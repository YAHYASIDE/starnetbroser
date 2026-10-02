package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bridges the web UI's "فتح" button to a real, isolated native Android
 * browser. Every method here is careful never to fall back to a shared
 * session: if this device can't do Multi-Profile isolation, callers get a
 * rejected promise, never a resolved one that quietly opened something
 * unsafe.
 */
@CapacitorPlugin(name = "LocalBrowser")
public class LocalBrowserPlugin extends Plugin {

    /** Telegram calls block on the network - one at a time, never on the main thread. */
    private final ExecutorService telegramExecutor = Executors.newSingleThreadExecutor();

    public static final String DEFAULT_URL = "https://starlink.com/account/home";
    public static final String ERROR_CODE_UNSUPPORTED = "MULTI_PROFILE_UNSUPPORTED";
    public static final String ERROR_CODE_INVALID_URL = "INVALID_URL";
    public static final String ERROR_CODE_NO_ACCOUNTS = "NO_ACCOUNTS_TO_SYNC";
    public static final String EVENT_ACCOUNT_DATA_SYNCED = "accountDataSynced";

    // The only hosts a session cookie is ever read from - matches AllowedUrl's own allow-listed
    // domain. android.webkit.CookieManager has no "list every cookie in this profile" API;
    // querying by URL is the only bulk-read it offers, so this fixed, small list is what makes
    // exportSessionCookies possible at all without guessing at arbitrary subdomains. The apex
    // comes first: what it sees is restored domain-wide (see CookieStringUtil#buildRestoreCookies).
    private static final String SESSION_COOKIE_APEX_HOST = "starlink.com";
    private static final String[] SESSION_COOKIE_URLS = {
        "https://starlink.com",
        "https://www.starlink.com",
        "https://api.starlink.com",
        "https://auth.starlink.com",
    };

    /** checkSession: extra wait between reports once the page has loaded, and the hard limit for
     * one account - same reasoning as AutoSyncWorker's SETTLE_DELAY_MS/PER_ACCOUNT_TIMEOUT_MS. */
    private static final long SESSION_CHECK_SETTLE_MS = 3000;
    private static final long SESSION_CHECK_TIMEOUT_MS = 25000;

    // androidx.webkit's Profile/ProfileStore and every WebView are @UiThread, while plugin methods
    // run on Capacitor's own background thread - anything touching them is posted here.
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // AccountBrowserActivity is a separate Activity, not this Plugin, so it has no direct way to
    // call notifyListeners() - it reaches back through this single live instance instead. A weak
    // reference costs nothing and avoids ever being the reason the plugin (and its Bridge/
    // WebView) can't be garbage-collected.
    private static WeakReference<LocalBrowserPlugin> activeInstance;

    private final DriveAuthorizer driveAuthorizer = new DriveAuthorizer();

    /** 📌 The page a home-screen shortcut asked for, until the app takes it. */
    private static String pendingShortcutRoute;

    @Override
    public void load() {
        activeInstance = new WeakReference<>(this);
        driveAuthorizer.register(getActivity());
        TelegramReplyService.appVisible = true;
        TelegramReplyService.refresh(getContext());
        rememberShortcutRoute(getActivity() != null ? getActivity().getIntent() : null);
    }

    /** Opened from a 📌 shortcut while the app was running: go there now. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String route = rememberShortcutRoute(intent);
        if (route != null) {
            JSObject data = new JSObject();
            data.put("route", route);
            notifyListeners("shortcutOpened", data);
        }
    }

    private static String rememberShortcutRoute(Intent intent) {
        if (intent == null) return null;
        String route = intent.getStringExtra(PhoneShortcuts.EXTRA_ROUTE);
        intent.removeExtra(PhoneShortcuts.EXTRA_ROUTE); // not again on a rotation / recreate
        if (!PhoneShortcuts.isRoute(route)) return null;
        pendingShortcutRoute = route;
        return route;
    }

    /** 📌 Pins a page of the app to the phone's home screen (the launcher asks to confirm). */
    @PluginMethod
    public void pinShortcut(PluginCall call) {
        String route = call.getString("route");
        String id = call.getString("id");
        JSObject ret = new JSObject();
        if (id == null || !id.matches("[a-z0-9_-]{1,60}") || !PhoneShortcuts.isRoute(route)) {
            call.reject("invalid shortcut");
            return;
        }
        if (!PhoneShortcuts.supported(getContext())) {
            ret.put("pinned", false);
            ret.put("unsupported", true);
            call.resolve(ret);
            return;
        }
        ret.put("pinned", PhoneShortcuts.pin(getContext(), id, call.getString("label"), route, call.getString("emoji"), call.getString("color")));
        ret.put("unsupported", false);
        call.resolve(ret);
    }

    /** The page a 📌 shortcut opened the app on (once), or null. */
    @PluginMethod
    public void takeShortcutRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", pendingShortcutRoute);
        pendingShortcutRoute = null;
        call.resolve(ret);
    }

    /** In front, the app answers Telegram itself with live data; behind, TelegramReplyService does. */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        TelegramReplyService.appVisible = true;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        TelegramReplyService.appVisible = false;
    }

    /** Google Drive (drive.file) access token for the off-phone backup - see DriveAuthorizer.
     * `interactive: false` never shows any Google screen: it fails with DRIVE_CONSENT_REQUIRED
     * instead (used by the automatic daily upload). */
    @PluginMethod
    public void authorizeDrive(PluginCall call) {
        driveAuthorizer.authorize(getActivity(), call, call.getBoolean("interactive", true));
    }

    /** 📨 «بريد الرموز»: links the shop's Gmail (read-only) once - the Google screen lets the
     * operator pick the account, and it must be `email` itself (checked against Gmail's profile). */
    @PluginMethod
    public void linkGmailCodes(PluginCall call) {
        String email = call.getString("email", "").trim().toLowerCase(java.util.Locale.ROOT);
        if (email.isEmpty()) {
            call.reject("اكتب بريد Gmail أولاً");
            return;
        }
        driveAuthorizer.authorize(getActivity(), GmailCodes.SCOPE, email, true, "يلزم ربط Gmail", new DriveAuthorizer.TokenCallback() {
            @Override
            public void onToken(String token) {
                telegramExecutor.execute(() -> {
                    try {
                        String account = GmailCodes.profileEmail(GmailCodeFetcher.get(GmailCodes.PROFILE_URL, token));
                        if (!email.equals(account)) {
                            call.reject("اخترت حساباً آخر (" + account + ") - اختر " + email);
                            return;
                        }
                        GmailCodeFetcher.setLinkedEmail(getContext(), email);
                        JSObject ret = new JSObject();
                        ret.put("email", email);
                        call.resolve(ret);
                    } catch (java.io.IOException ex) {
                        call.reject(gmailError(ex));
                    }
                });
            }

            @Override
            public void onError(String message, String code) {
                call.reject(message + " - تأكد أن " + email + " مضاف في إعدادات الهاتف ← الحسابات", code);
            }
        });
    }

    /** Which Gmail «بريد الرموز» is linked to (no `email` when none). */
    @PluginMethod
    public void gmailCodesStatus(PluginCall call) {
        JSObject ret = new JSObject();
        String email = GmailCodeFetcher.linkedEmail(getContext());
        if (email != null) ret.put("email", email); // absent = not linked
        call.resolve(ret);
    }

    @PluginMethod
    public void unlinkGmailCodes(PluginCall call) {
        GmailCodeFetcher.setLinkedEmail(getContext(), null);
        call.resolve();
    }

    /** «🔍 جرّب»: the newest code of the last day in the linked Gmail (no `code` when none). */
    @PluginMethod
    public void latestGmailCode(PluginCall call) {
        DriveAuthorizer.authorizeSilently(getActivity(), GmailCodes.SCOPE, GmailCodeFetcher.linkedEmail(getContext()), new DriveAuthorizer.TokenCallback() {
            @Override
            public void onToken(String token) {
                telegramExecutor.execute(() -> {
                    try {
                        String code = GmailCodeFetcher.newestCode(token, System.currentTimeMillis() - 24L * 60 * 60 * 1000);
                        JSObject ret = new JSObject();
                        if (code != null) ret.put("code", code); // absent = no code today
                        call.resolve(ret);
                    } catch (java.io.IOException ex) {
                        call.reject(gmailError(ex));
                    }
                });
            }

            @Override
            public void onError(String message, String code) {
                call.reject("اربط Gmail الرموز أولاً", code);
            }
        });
    }

    private static String gmailError(java.io.IOException ex) {
        if (ex instanceof GmailCodeFetcher.HttpError && ((GmailCodeFetcher.HttpError) ex).status == 403) {
            return "Gmail رفض الطلب (403) - فعّل Gmail API في مشروع Google Cloud";
        }
        return "تعذر الاتصال بـ Gmail: " + ex.getMessage();
    }

    @PluginMethod
    public void clearDriveToken(PluginCall call) {
        String token = call.getString("accessToken");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        driveAuthorizer.clearToken(getContext(), call, token);
    }

    /**
     * Called by AccountBrowserActivity after a successful "تحديث من Starlink" tap, once the
     * result is already durably staged in PendingSyncStore (see that class). This live event is
     * only a best-effort fast path for when the app's Bridge/WebView happens to be attached and
     * resumed right now - notifyListeners() silently drops the event otherwise, so
     * listPendingAccountSyncs() (drained on app open/resume) is what actually guarantees
     * delivery. `syncId` lets the web UI acknowledge this exact record (ackPendingAccountSyncs)
     * however it was received, live or via the pending list, without ever double-applying it.
     */
    public static void emitAccountDataSynced(String syncId, String accountId, JSObject fields) {
        LocalBrowserPlugin instance = activeInstance != null ? activeInstance.get() : null;
        if (instance == null) {
            return;
        }
        JSObject event = new JSObject();
        event.put("syncId", syncId);
        event.put("accountId", accountId);
        event.put("fields", fields);
        instance.notifyListeners(EVENT_ACCOUNT_DATA_SYNCED, event);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", isMultiProfileSupported());
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccountBrowser(PluginCall call) {
        String accountId = call.getString("accountId");
        if (accountId == null || accountId.trim().isEmpty()) {
            call.reject("accountId is required");
            return;
        }

        if (!isMultiProfileSupported()) {
            call.reject("هذا الجهاز لا يدعم المتصفحات المستقلة", ERROR_CODE_UNSUPPORTED);
            return;
        }

        Intent intent;
        try {
            intent = accountBrowserIntent(accountId, call.getData());
        } catch (InvalidUrlException ex) {
            call.reject(ex.getMessage(), ERROR_CODE_INVALID_URL);
            return;
        } catch (RuntimeException ex) {
            call.reject("Invalid accountId: " + ex.getMessage());
            return;
        }
        getActivity().startActivity(intent);
        call.resolve();
    }

    /** A JS string[] option (empty when absent) - the passwords «📧 البريد» offers. */
    private static String[] stringArray(JSObject options, String key) {
        org.json.JSONArray array = options.optJSONArray(key);
        if (array == null) return new String[0];
        List<String> values = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            String value = array.optString(i, "");
            if (!value.isEmpty()) values.add(value);
        }
        return values.toArray(new String[0]);
    }

    /** Thrown by accountBrowserIntent for a start URL other than the real Starlink site. */
    private static final class InvalidUrlException extends RuntimeException {
        InvalidUrlException(String message) {
            super(message);
        }
    }

    /** The device's Starlink browser, opened with these options (openAccountBrowser's, or the
     * «تفعيل Starlink» that follows a new email in «إنشاء حساب جديد»). */
    private Intent accountBrowserIntent(String accountId, JSObject options) {
        String profileName = ProfileNaming.profileNameFor(accountId);

        String accountName = options.getString("accountName", accountId);
        String url = options.getString("url", DEFAULT_URL);

        // The caller (JS running in the app's WebView) is not trusted to pick where this
        // isolated, cookie-bearing browser navigates: only the real Starlink portal over HTTPS
        // is allowed, never http/file/javascript or an arbitrary host.
        if (!AllowedUrl.isAllowed(url)) {
            throw new InvalidUrlException("Only https://starlink.com (or a subdomain) is allowed as the initial URL");
        }

        Context context = getContext();
        Intent intent = new Intent(context, AccountBrowserActivity.class);
        intent.putExtra(AccountBrowserActivity.EXTRA_PROFILE_NAME, profileName);
        intent.putExtra(AccountBrowserActivity.EXTRA_ACCOUNT_ID, accountId);
        intent.putExtra(AccountBrowserActivity.EXTRA_ACCOUNT_NAME, accountName);
        intent.putExtra(AccountBrowserActivity.EXTRA_URL, url);
        // Optional login autofill (only ever typed into empty Starlink login fields, never logged).
        String loginEmail = options.getString("loginEmail");
        String loginPassword = options.getString("loginPassword");
        if (loginEmail != null && !loginEmail.trim().isEmpty()) intent.putExtra(AccountBrowserActivity.EXTRA_LOGIN_EMAIL, loginEmail);
        if (loginPassword != null && !loginPassword.isEmpty()) intent.putExtra(AccountBrowserActivity.EXTRA_LOGIN_PASSWORD, loginPassword);
        String mailPassword = options.getString("mailPassword");
        if (mailPassword != null && !mailPassword.isEmpty()) intent.putExtra(AccountBrowserActivity.EXTRA_MAIL_PASSWORD, mailPassword);
        String[] mailSuggestions = stringArray(options, "mailSuggestions");
        if (mailSuggestions.length > 0) intent.putExtra(AccountBrowserActivity.EXTRA_MAIL_SUGGESTIONS, mailSuggestions);
        String mailRecovery = options.getString("mailRecoveryEmail");
        if (mailRecovery != null && !mailRecovery.trim().isEmpty()) intent.putExtra(AccountBrowserActivity.EXTRA_MAIL_RECOVERY, mailRecovery.trim());
        // A distinct Uri per account (never loaded/navigated to - AccountBrowserActivity only
        // ever reads EXTRA_URL for that) is what makes each account its own separate "document"
        // task in Recents (see documentLaunchMode="intoExisting" on this Activity in the
        // manifest) - two different accounts get two independently split-screenable windows,
        // while reopening the SAME account brings its own already-open one back to front instead
        // of spawning a duplicate. FLAG_ACTIVITY_MULTIPLE_TASK is the documented companion flag
        // for NEW_DOCUMENT, so this account's task is never merged into whichever task the "فتح"
        // tap itself came from.
        intent.setData(Uri.parse("starnet-account://" + Uri.encode(accountId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        // 🤖 The Starlink sign-in pressed through by itself (after the automatic mailbox sign-in).
        if (options.optBoolean("autoLogin", false)) intent.putExtra(AccountBrowserActivity.EXTRA_AUTO_LOGIN, true);
        // 🛑 «إلغاء الاشتراك» (the operator pressed the card's button and confirmed).
        String cancelReason = options.getString("cancelSubscriptionReason");
        if (cancelReason != null && !cancelReason.trim().isEmpty()) intent.putExtra(AccountBrowserActivity.EXTRA_CANCEL_REASON, cancelReason.trim());
        JSObject activation = options.getJSObject("activation");
        if (activation != null) {
            intent.putExtra(AccountBrowserActivity.EXTRA_ACTIVATION_KIT, activation.getString("kit"));
            intent.putExtra(AccountBrowserActivity.EXTRA_ACTIVATION_FIRST_NAME, activation.getString("firstName"));
            intent.putExtra(AccountBrowserActivity.EXTRA_ACTIVATION_LAST_NAME, activation.getString("lastName"));
            intent.putExtra(AccountBrowserActivity.EXTRA_ACTIVATION_EMAIL, activation.getString("email"));
            intent.putExtra(AccountBrowserActivity.EXTRA_ACTIVATION_PHONE, activation.getString("phone"));
        }
        return intent;
    }

    /** 📧 البريد: the device's own mailbox in its own isolated profile (MailBrowserActivity). */
    @PluginMethod
    public void openMailBrowser(PluginCall call) {
        String accountId = call.getString("accountId");
        if (accountId == null || accountId.trim().isEmpty()) {
            call.reject("accountId is required");
            return;
        }
        if (!isMultiProfileSupported()) {
            call.reject("هذا الجهاز لا يدعم المتصفحات المستقلة", ERROR_CODE_UNSUPPORTED);
            return;
        }
        try {
            JSObject signup = call.getObject("signup");
            if (signup == null) {
                // 🤖 With `auto`: signs in by itself, then `then` (the device's Starlink browser).
                JSObject then = call.getObject("then");
                MailBrowserActivity.open(getActivity(), accountId, call.getString("accountName", accountId),
                    call.getString("email"), call.getString("password"), stringArray(call.getData(), "suggestions"),
                    call.getString("recoveryEmail"), Boolean.TRUE.equals(call.getBoolean("auto", false)),
                    then != null ? accountBrowserIntent(accountId, then) : null);
            } else {
                // 🆕 «إنشاء حساب جديد»: Microsoft's signup instead of the inbox, then «تفعيل Starlink».
                Intent intent = MailBrowserActivity.intentFor(getActivity(), accountId, call.getString("accountName", accountId),
                    call.getString("email"), call.getString("password"));
                JSObject then = call.getObject("then");
                MailBrowserActivity.asSignup(intent, signup.getString("firstName"), signup.getString("lastName"), signup.getString("recoveryEmail"),
                    then != null ? accountBrowserIntent(accountId, then) : null);
                getActivity().startActivity(intent);
            }
        } catch (RuntimeException ex) {
            call.reject("تعذر فتح البريد: " + ex.getMessage());
            return;
        }
        call.resolve();
    }

    // ---- 💳 KAST card mail (KastWatch) ----

    /** The devices' expected Starlink amounts and cards, for guessing which device a refused
     * payment was; also starts the hourly check. */
    @PluginMethod
    public void kastSetDevices(PluginCall call) {
        com.getcapacitor.JSArray devices = call.getArray("devices");
        KastWatch.setDevices(getContext(), devices == null ? "[]" : devices.toString());
        KastWatchWorker.schedule(getContext());
        call.resolve();
    }

    /** One check now (the app just opened). */
    @PluginMethod
    public void kastCheckNow(PluginCall call) {
        KastWatchWorker.checkNow(getContext());
        call.resolve();
    }

    /** 💳 Whether «Notification access» is on (the KAST app's notifications are read). */
    @PluginMethod
    public void kastNotificationsStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", KastNotificationListener.isEnabled(getContext()));
        call.resolve(ret);
    }

    /** Opens Android's «Notification access» screen, where the operator turns it on. */
    @PluginMethod
    public void openKastNotificationAccess(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("تعذر فتح إعدادات الإشعارات");
        }
    }

    /** The KAST events (dollars received, Starlink payments) the app hasn't saved yet. */
    @PluginMethod
    public void kastPendingDeposits(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("deposits", new com.getcapacitor.JSArray(KastWatch.pendingDeposits(getContext()).toString()));
        } catch (org.json.JSONException e) {
            ret.put("deposits", new com.getcapacitor.JSArray());
        }
        call.resolve(ret);
    }

    /** The app saved these deposits (in its own store) - forget them here. */
    @PluginMethod
    public void kastAckDeposits(PluginCall call) {
        java.util.Set<String> ids = new java.util.HashSet<>(java.util.Arrays.asList(stringArray(call.getData(), "ids")));
        KastWatch.ackDeposits(getContext(), ids);
        call.resolve();
    }

    /** The devices whose mailbox (📧 البريد) is signed in on this phone - id, email, since when. */
    @PluginMethod
    public void listMailSessions(PluginCall call) {
        com.getcapacitor.JSArray sessions = new com.getcapacitor.JSArray();
        for (java.util.Map.Entry<String, String[]> entry : MailSessionStore.all(getContext()).entrySet()) {
            JSObject item = new JSObject();
            item.put("accountId", entry.getKey());
            item.put("email", entry.getValue()[1]);
            long at = 0;
            try {
                at = Long.parseLong(entry.getValue()[0]);
            } catch (NumberFormatException ignored) {
                // an unreadable time stays 0
            }
            item.put("signedInAt", at);
            sessions.put(item);
        }
        JSObject ret = new JSObject();
        ret.put("sessions", sessions);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteAccountSession(PluginCall call) {
        String accountId = call.getString("accountId");
        if (accountId == null || accountId.trim().isEmpty()) {
            call.reject("accountId is required");
            return;
        }

        if (!isMultiProfileSupported()) {
            JSObject ret = new JSObject();
            ret.put("deleted", false);
            call.resolve(ret);
            return;
        }

        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
        } catch (RuntimeException ex) {
            call.reject("Invalid accountId: " + ex.getMessage());
            return;
        }

        mainHandler.post(() -> {
            // The device's mailbox profile (📧 البريد) goes with it - best effort, it may never
            // have been opened.
            MailSessionStore.markSignedOut(getContext(), accountId);
            try {
                ProfileStore.getInstance().deleteProfile(ProfileNaming.mailProfileNameFor(accountId));
            } catch (RuntimeException ignored) {
                // never opened / still open
            }
            boolean deleted;
            try {
                deleted = ProfileStore.getInstance().deleteProfile(profileName);
            } catch (RuntimeException ex) {
                // Profile never existed, is the (unreachable, per ProfileNaming) default profile,
                // or still has a live WebView attached. Report "nothing deleted" instead of
                // crashing - the account is already gone from STAR NET either way by then.
                deleted = false;
            }
            JSObject ret = new JSObject();
            ret.put("deleted", deleted);
            call.resolve(ret);
        });
    }

    /**
     * Every "تحديث من Starlink" result not yet acknowledged by the web UI, oldest first. Callers
     * are expected to drain this on app open and on every resume - not just rely on the live
     * accountDataSynced event, which is lost whenever this Activity's Bridge/WebView wasn't
     * attached and resumed at the moment AccountBrowserActivity fired it.
     */
    @PluginMethod
    public void listPendingAccountSyncs(PluginCall call) {
        JSONArray pending = PendingSyncStore.listPending(getContext());
        JSObject ret = new JSObject();
        ret.put("syncs", pending);
        call.resolve(ret);
    }

    /**
     * Marks the given syncIds as delivered so PendingSyncStore stops returning them. Callers must
     * only call this AFTER the corresponding result has actually been merged and saved on the web
     * side - acking first and failing to save after would lose the result permanently. Resolves
     * with `acked: false` (never rejects) when the underlying write didn't reach disk - the
     * caller must treat that as "still pending" and retry the ack later, not as delivered.
     */
    @PluginMethod
    public void ackPendingAccountSyncs(PluginCall call) {
        JSArray syncIdsArray = call.getArray("syncIds");
        List<String> syncIds = new ArrayList<>();
        if (syncIdsArray != null) {
            for (int i = 0; i < syncIdsArray.length(); i++) {
                try {
                    syncIds.add(syncIdsArray.getString(i));
                } catch (JSONException ignored) {
                    // Not a string entry - skip it rather than failing the whole ack call.
                }
            }
        }
        boolean acked = PendingSyncStore.ack(getContext(), syncIds);
        JSObject ret = new JSObject();
        ret.put("acked", acked);
        call.resolve(ret);
    }

    /**
     * Replaces (never merges into) the list of accounts AutoSyncWorker visits on its next
     * scheduled periodic run, and schedules/cancels that job accordingly - an empty list cancels
     * it entirely, since a periodic job with nothing to do should never keep running. The web UI
     * is expected to call this every time its own account list changes (added/edited/removed), so
     * a closed/killed app's next background run always reflects the current list. This never logs
     * an account in itself: an account whose isolated profile has no session yet just yields no
     * fields each run, exactly like a manual "تحديث من Starlink" tap on a logged-out page - so
     * unlike openAccountBrowser, this never rejects for an unsupported device, it just persists
     * nothing to actually run (isMultiProfileSupported() is re-checked by AutoSyncWorker itself
     * before it does anything, same defensive-recheck pattern as AccountBrowserActivity).
     */
    @PluginMethod
    public void setAutoSyncAccountIds(PluginCall call) {
        JSArray accountsArray = call.getArray("accounts");
        List<AutoSyncAccountStore.Entry> entries = new ArrayList<>();
        if (accountsArray != null) {
            for (int i = 0; i < accountsArray.length(); i++) {
                JSONObject obj = accountsArray.optJSONObject(i);
                if (obj == null) {
                    continue;
                }
                String accountId = obj.optString("accountId", null);
                if (accountId == null || accountId.trim().isEmpty()) {
                    continue;
                }
                String url = obj.optString("url", DEFAULT_URL);
                entries.add(new AutoSyncAccountStore.Entry(
                    accountId,
                    obj.optString("accountName", null),
                    url,
                    obj.optString("renewalDate", null),
                    obj.optString("serviceStatus", null),
                    obj.optString("representativeId", null)
                ));
            }
        }

        boolean saved = AutoSyncAccountStore.save(getContext(), entries);
        if (saved) {
            SyncPacing.recordListPushed(getContext(), System.currentTimeMillis());
            if (entries.isEmpty()) {
                AutoSyncScheduler.cancel(getContext());
            } else if (isMultiProfileSupported()) {
                AutoSyncScheduler.schedule(getContext());
            }
        }

        JSObject ret = new JSObject();
        ret.put("saved", saved);
        call.resolve(ret);
    }

    /**
     * "مزامنة الآن": runs the same headless sync AutoSyncWorker does on its hourly schedule, right
     * now instead of waiting. Resolves once the job has been handed to WorkManager - not once the
     * sync itself has finished; actual results still flow through the existing accountDataSynced
     * event / listPendingAccountSyncs pipeline. Rejects (never silently no-ops) on an unsupported
     * device or when there are no accounts registered yet - an account only becomes syncable after
     * opening it once via openAccountBrowser, and the caller should tell the user that plainly
     * rather than the button appearing to do nothing.
     */
    /**
     * المزامنة التلقائية on/off (الإعدادات). Stored natively so it survives the app being closed;
     * applied right away. Off leaves "مزامنة الآن" and each card's "تحديث" working.
     */
    @PluginMethod
    public void setAutoSyncEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        SyncPacing.setEnabled(getContext(), enabled == null || enabled);
        if (!AutoSyncAccountStore.load(getContext()).isEmpty() && isMultiProfileSupported()) {
            AutoSyncScheduler.schedule(getContext());
        }
        JSObject ret = new JSObject();
        ret.put("enabled", SyncPacing.isEnabled(getContext()));
        call.resolve(ret);
    }

    // ---- Telegram bots (TelegramStore / TelegramClient / TelegramSendWorker) ----
    // Every method takes `bot`: "owner" (default - the operator's own bot and chat) or "reps" (the
    // representatives' bot; messages only ever go to a rep chat the operator linked).

    private static boolean isRepsBot(PluginCall call) {
        return TelegramStore.isRepBot(call.getString("bot"));
    }

    /** The rep bot this call goes out through (money / alerts fall back to the devices bot). */
    private String repBot(PluginCall call) {
        return TelegramStore.repBotFor(getContext(), call.getString("bot"));
    }

    /**
     * Connects a bot. Owner: checks the token (getMe), finds the private chat that sent the bot a
     * message (the operator's own "/start"), stores both and says hello there. Reps: checks the
     * token only - each rep then presses Start and the operator links him in الإعدادات.
     * Rejects with a plain Arabic reason the settings screen shows as-is.
     */
    @PluginMethod
    public void telegramConnect(PluginCall call) {
        String raw = call.getString("token");
        if (raw == null || raw.trim().isEmpty()) {
            call.reject("الصق مفتاح البوت أولاً");
            return;
        }
        String token = raw.trim();
        boolean reps = isRepsBot(call);
        String extra = TelegramStore.isExtraBot(call.getString("bot")) ? call.getString("bot") : null;
        telegramExecutor.execute(() -> {
            try {
                JSONObject me = TelegramClient.call(token, "getMe", new LinkedHashMap<>());
                String botName = me.getJSONObject("result").optString("username", "");
                if (extra != null) {
                    // 💰 / 🔔: a separate bot of its own - never one already used for something else.
                    if (!token.equals(TelegramStore.extraToken(getContext(), extra)) && TelegramStore.allTokens(getContext()).contains(token)) {
                        call.reject("هذا المفتاح مستعمل لبوت آخر - أنشئ بوتاً جديداً من @BotFather");
                        return;
                    }
                    if (!TelegramStore.saveExtraBot(getContext(), extra, token, botName)) {
                        call.reject("تعذر حفظ الربط على الهاتف");
                        return;
                    }
                    TelegramReplyService.refresh(getContext());
                    JSObject ret = new JSObject();
                    ret.put("botName", botName);
                    ret.put("chatName", "");
                    call.resolve(ret);
                    return;
                }
                if (reps) {
                    if (token.equals(TelegramStore.token(getContext()))) {
                        call.reject("هذا مفتاح بوتك الشخصي - أنشئ بوتاً ثانياً للمندوبين من @BotFather");
                        return;
                    }
                    if (!TelegramStore.saveReps(getContext(), token, botName)) {
                        call.reject("تعذر حفظ الربط على الهاتف");
                        return;
                    }
                    TelegramReplyService.refresh(getContext());
                    JSObject ret = new JSObject();
                    ret.put("botName", botName);
                    ret.put("chatName", "");
                    call.resolve(ret);
                    return;
                }
                if (token.equals(TelegramStore.repsToken(getContext()))) {
                    call.reject("هذا مفتاح بوت المندوبين - استعمل بوتاً آخر لنفسك");
                    return;
                }
                Map<String, String> params = new LinkedHashMap<>();
                params.put("timeout", "0");
                JSONArray updates = TelegramClient.call(token, "getUpdates", params).getJSONArray("result");
                String chatId = null;
                String chatName = null;
                long lastUpdate = 0;
                for (int i = 0; i < updates.length(); i++) {
                    JSONObject update = updates.getJSONObject(i);
                    lastUpdate = Math.max(lastUpdate, update.optLong("update_id"));
                    JSONObject message = update.optJSONObject("message");
                    JSONObject chat = message != null ? message.optJSONObject("chat") : null;
                    if (chat == null || !"private".equals(chat.optString("type"))) continue;
                    chatId = String.valueOf(chat.optLong("id"));
                    chatName = chat.optString("first_name", "");
                }
                if (chatId == null) {
                    call.reject("افتح البوت @" + botName + " في تيليغرام واضغط «ابدأ» (أو أرسل له /start)، ثم اضغط «ربط» مرة أخرى");
                    return;
                }
                if (lastUpdate > 0) {
                    // The "/start" is not a command for the app - mark everything so far as read.
                    Map<String, String> ack = new LinkedHashMap<>();
                    ack.put("offset", String.valueOf(lastUpdate + 1));
                    ack.put("timeout", "0");
                    TelegramClient.call(token, "getUpdates", ack);
                }
                if (!TelegramStore.save(getContext(), token, chatId, chatName, botName)) {
                    call.reject("تعذر حفظ الربط على الهاتف");
                    return;
                }
                TelegramClient.sendMessage(token, chatId, "✅ تم ربط STAR NET بهذه المحادثة.\nستصلك هنا إشعارات الأجهزة المتوقفة والدفعات والملخصات.\nاكتب «مساعدة» لترى الأوامر (تُجاب والتطبيق مفتوح).");
                TelegramReplyService.refresh(getContext());
                JSObject ret = new JSObject();
                ret.put("botName", botName);
                ret.put("chatName", chatName);
                call.resolve(ret);
            } catch (TelegramClient.TelegramError e) {
                call.reject(e.code == 401 || e.code == 404 ? "المفتاح غير صحيح - انسخه من جديد من @BotFather" : "رفض تيليغرام الطلب: " + e.getMessage());
            } catch (Exception e) {
                // Only the failure's kind - its message could carry the request URL, which holds the token.
                call.reject("تعذر الاتصال بتيليغرام - تأكد من الإنترنت ثم حاول مجدداً (" + e.getClass().getSimpleName() + ")");
            }
        });
    }

    @PluginMethod
    public void telegramStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("configured", TelegramStore.isConfigured(getContext()));
        ret.put("botName", TelegramStore.botName(getContext()));
        ret.put("chatName", TelegramStore.chatName(getContext()));
        ret.put("stoppedEnabled", TelegramStore.isStoppedEnabled(getContext()));
        ret.put("repsConfigured", TelegramStore.isRepsConfigured(getContext()));
        ret.put("repsBotName", TelegramStore.repsBotName(getContext()));
        ret.put("moneyConfigured", TelegramStore.extraToken(getContext(), TelegramStore.MONEY) != null);
        ret.put("moneyBotName", TelegramStore.extraBotName(getContext(), TelegramStore.MONEY));
        ret.put("alertsConfigured", TelegramStore.extraToken(getContext(), TelegramStore.ALERTS) != null);
        ret.put("alertsBotName", TelegramStore.extraBotName(getContext(), TelegramStore.ALERTS));
        ret.put("instant", TelegramStore.isInstantEnabled(getContext()));
        ret.put("instantRunning", TelegramReplyService.isPolling());
        ret.put("batteryUnrestricted", isIgnoringBatteryOptimizations());
        JSObject diag = new JSObject();
        for (String key : new String[] {"startedAt", "startError", "pollAt", "pollError", "replyAt", "sendError"}) {
            String value = TelegramStore.diagValue(getContext(), key);
            if (value != null) diag.put(key, value);
        }
        diag.put("device", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + " · Android " + android.os.Build.VERSION.RELEASE);
        diag.put("appVisible", TelegramReplyService.appVisible);
        ret.put("diagnostics", diag);
        call.resolve(ret);
    }

    @PluginMethod
    public void telegramDisconnect(PluginCall call) {
        if (TelegramStore.isExtraBot(call.getString("bot"))) {
            TelegramStore.clearExtraBot(getContext(), call.getString("bot"));
        } else if (isRepsBot(call)) {
            TelegramStore.clearReps(getContext());
        } else {
            TelegramSendWorker.cancel(getContext(), "morning");
            TelegramSendWorker.cancel(getContext(), "evening");
            TelegramStore.clear(getContext());
        }
        TelegramReplyService.refresh(getContext());
        call.resolve();
    }

    /** Whether the background sync also sends "⛔ توقف" (to the operator / to each rep). */
    @PluginMethod
    public void telegramSetOptions(PluginCall call) {
        Boolean stopped = call.getBoolean("stopped");
        if (stopped != null) TelegramStore.setStoppedEnabled(getContext(), stopped);
        Boolean repsStopped = call.getBoolean("repsStopped");
        if (repsStopped != null) TelegramStore.setRepsStoppedEnabled(getContext(), repsStopped);
        call.resolve();
    }

    /** The reps the operator linked: {chats: {repId: chatId}} - replaces the previous map. */
    @PluginMethod
    public void telegramSetRepChats(PluginCall call) {
        JSObject chats = call.getObject("chats", new JSObject());
        Map<String, String> map = new LinkedHashMap<>();
        Iterator<String> keys = chats.keys();
        while (keys.hasNext()) {
            String repId = keys.next();
            String chatId = chats.optString(repId, "");
            if (!chatId.isEmpty()) map.put(repId, chatId);
        }
        TelegramStore.setRepChats(getContext(), map);
        for (String chatId : map.values()) TelegramStore.forgetRequested(getContext(), chatId);
        call.resolve();
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return true;
        android.os.PowerManager power = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    /** Asks Android (one system dialog) to let STAR NET run in the background without limits - what
     * keeps the bot answering with the app closed on phones that stop background apps. */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryUnrestricted(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (RuntimeException noDialog) {
            try {
                Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(list);
            } catch (RuntimeException ignored) {
                call.reject("افتح إعدادات البطارية يدوياً");
                return;
            }
        }
        call.resolve();
    }

    /** The phone maker's own "app launch / autostart" screen (HONOR, Huawei, Xiaomi, Oppo, Vivo,
     * Tecno/Infinix), where background running must be allowed by hand; the app's details page
     * when the maker has none. Resolves with which one opened. */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        String[][] screens = {
            {"com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity"},
        };
        for (String[] screen : screens) {
            try {
                Intent intent = new Intent();
                intent.setComponent(new android.content.ComponentName(screen[0], screen[1]));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("opened", "maker");
                call.resolve(ret);
                return;
            } catch (RuntimeException notOnThisPhone) {
                // try the next maker
            }
        }
        try {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(details);
            JSObject ret = new JSObject();
            ret.put("opened", "app");
            call.resolve(ret);
        } catch (RuntimeException ignored) {
            call.reject("افتح إعدادات الهاتف ← التطبيقات ← STAR NET يدوياً");
        }
    }

    /** A link request the operator dismissed: if that person writes again he's answered again. */
    @PluginMethod
    public void telegramForgetRequest(PluginCall call) {
        String chatId = call.getString("chatId");
        if (chatId != null) TelegramStore.forgetRequested(getContext(), chatId);
        call.resolve();
    }

    /** A rep's ✏️ decided in the app: its ✅/❌ in the owner's bot then says the request is over. */
    @PluginMethod
    public void telegramResolveEdit(PluginCall call) {
        String id = call.getString("id");
        if (id != null) TelegramStore.removeEdit(getContext(), id);
        call.resolve();
    }

    /** An ⚡ activation decided in the app: its ✅/❌ in the owner's bot then says it's over. */
    @PluginMethod
    public void telegramResolveActivation(PluginCall call) {
        String id = call.getString("id");
        if (id != null) TelegramStore.removeActivation(getContext(), id);
        call.resolve();
    }

    /** Answers with the app closed (TelegramReplyService, with its permanent notification). */
    @PluginMethod
    public void telegramSetInstant(PluginCall call) {
        TelegramStore.setInstantEnabled(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled", true)));
        TelegramReplyService.refresh(getContext());
        call.resolve();
    }

    /** The answers prepared by the app for when it's closed (JSON, see TelegramReplies.Snapshot). */
    @PluginMethod
    public void telegramSetReplies(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null || snapshot.length() > 2_000_000) {
            call.reject("invalid replies");
            return;
        }
        TelegramStore.setReplies(getContext(), snapshot);
        call.resolve();
    }

    /** Messages TelegramReplyService left for the app (then removed). */
    @PluginMethod
    public void telegramTakeInbox(PluginCall call) {
        TelegramReplyService.lastDrainAt = System.currentTimeMillis();
        JSONArray inbox = TelegramReplyService.takeInbox(getContext());
        JSArray messages = new JSArray();
        for (int i = 0; i < inbox.length(); i++) {
            JSONObject item = inbox.optJSONObject(i);
            if (item == null) continue;
            JSObject out = new JSObject();
            out.put("bot", item.optString("bot", TelegramStore.OWNER));
            out.put("chatId", item.optString("chatId", ""));
            out.put("name", item.optString("name", ""));
            out.put("username", item.optString("username", ""));
            out.put("text", item.optString("text", ""));
            out.put("replied", item.optBoolean("replied", false));
            if (item.has("fileId")) {
                out.put("fileId", item.optString("fileId", ""));
                out.put("fileName", item.optString("fileName", ""));
            }
            if (item.has("kind")) {
                out.put("kind", item.optString("kind", ""));
                out.put("data", item.optString("data", ""));
            }
            messages.put(out);
        }
        JSObject ret = new JSObject();
        ret.put("messages", messages);
        ret.put("running", TelegramReplyService.isPolling());
        call.resolve(ret);
    }

    /** Downloads a device file a rep sent the reps bot (a few KB of encrypted JSON) as text. */
    @PluginMethod
    public void telegramDownloadFile(PluginCall call) {
        String fileId = call.getString("fileId");
        String token = TelegramStore.repsToken(getContext());
        if (token == null || fileId == null || fileId.isEmpty()) {
            call.reject("not configured");
            return;
        }
        telegramExecutor.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("text", TelegramClient.downloadText(token, fileId, 2_000_000));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("download failed: " + e.getClass().getSimpleName());
            }
        });
    }

    /** 📸 A payment photo a rep sent the reps or money bot, as a data: URL (jpeg / png). */
    @PluginMethod
    public void telegramDownloadImage(PluginCall call) {
        String fileId = call.getString("fileId");
        String bot = call.getString("bot", TelegramStore.REPS);
        String token = TelegramStore.MONEY.equals(bot) ? TelegramStore.extraToken(getContext(), TelegramStore.MONEY) : TelegramStore.repsToken(getContext());
        if (token == null || fileId == null || fileId.isEmpty()) {
            call.reject("not configured");
            return;
        }
        telegramExecutor.execute(() -> {
            try {
                byte[] bytes = TelegramClient.downloadBytes(token, fileId, 6_000_000);
                boolean png = bytes.length > 3 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G';
                JSObject ret = new JSObject();
                ret.put("dataUrl", "data:image/" + (png ? "png" : "jpeg") + ";base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("download failed: " + e.getClass().getSimpleName());
            }
        });
    }

    /**
     * Queues a text message (sent once there's a network, even if the app closes). Reps bot: to
     * `chatId`, which must be a linked rep - or, with `reply: true`, a one-off answer right now to
     * someone who just wrote to the bot (the "waiting to be linked" reply).
     */
    @PluginMethod
    public void telegramSend(PluginCall call) {
        String text = call.getString("text");
        JSObject ret = new JSObject();
        if (text == null || text.trim().isEmpty()) {
            ret.put("queued", false);
            call.resolve(ret);
            return;
        }
        if (!isRepsBot(call)) {
            boolean configured = TelegramStore.isConfigured(getContext());
            if (configured) TelegramSendWorker.enqueue(getContext(), text);
            ret.put("queued", configured);
            call.resolve(ret);
            return;
        }
        String chatId = call.getString("chatId");
        if (!TelegramStore.isRepsConfigured(getContext()) || chatId == null) {
            ret.put("queued", false);
            call.resolve(ret);
            return;
        }
        String markup = call.getString("replyMarkup");
        if (TelegramStore.isLinkedRepChat(getContext(), chatId)) {
            TelegramSendWorker.enqueueToRepBot(getContext(), repBot(call), chatId, text, markup);
            ret.put("queued", true);
            call.resolve(ret);
            return;
        }
        if (!Boolean.TRUE.equals(call.getBoolean("reply", false))) {
            ret.put("queued", false);
            call.resolve(ret);
            return;
        }
        telegramExecutor.execute(() -> {
            try {
                TelegramClient.sendMessage(TelegramStore.repsToken(getContext()), chatId, text, markup);
                ret.put("queued", true);
            } catch (Exception e) {
                ret.put("queued", false);
            }
            call.resolve(ret);
        });
    }

    /** Schedules the text for `at` (epoch ms), replacing the previous one under `key`. */
    @PluginMethod
    public void telegramSchedule(PluginCall call) {
        String key = call.getString("key");
        String text = call.getString("text");
        Long at = call.getLong("at");
        boolean reps = isRepsBot(call);
        String chatId = call.getString("chatId");
        if (key == null || !key.matches("[a-z0-9_-]{1,60}") || at == null) {
            call.reject("invalid schedule");
            return;
        }
        boolean ready = reps
            ? TelegramStore.isRepsConfigured(getContext()) && TelegramStore.isLinkedRepChat(getContext(), chatId)
            : TelegramStore.isConfigured(getContext());
        if (!ready || text == null || text.trim().isEmpty()) {
            TelegramSendWorker.cancel(getContext(), key);
        } else {
            TelegramSendWorker.schedule(getContext(), key, at, text, reps ? repBot(call) : TelegramStore.OWNER, reps ? chatId : null, reps ? call.getString("replyMarkup") : null);
        }
        call.resolve();
    }

    @PluginMethod
    public void telegramCancel(PluginCall call) {
        String key = call.getString("key");
        if (key != null && key.matches("[a-z0-9_-]{1,60}")) TelegramSendWorker.cancel(getContext(), key);
        call.resolve();
    }

    /** Sends a PDF (base64) right away - to the operator, or to a linked rep (reps bot). With
     * `photo: true` it's a jpeg / png shown as a picture (a transfer screenshot to a rep). */
    /** 📥 The file last opened with STAR NET (SharedFileActivity), once - then forgotten. */
    @PluginMethod
    public void takeSharedFile(PluginCall call) {
        java.io.File file = new java.io.File(getContext().getFilesDir(), SharedFileActivity.FILE_NAME);
        JSObject result = new JSObject();
        if (!file.exists()) {
            result.put("text", null);
            call.resolve(result);
            return;
        }
        try {
            byte[] bytes = new byte[(int) file.length()];
            try (java.io.FileInputStream in = new java.io.FileInputStream(file)) {
                int offset = 0;
                while (offset < bytes.length) {
                    int read = in.read(bytes, offset, bytes.length - offset);
                    if (read < 0) break;
                    offset += read;
                }
            }
            result.put("text", new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            result.put("text", null);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
        call.resolve(result);
    }

    @PluginMethod
    public void telegramSendDocument(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = call.getString("fileName", "document.pdf");
        String caption = call.getString("caption");
        boolean reps = isRepsBot(call);
        String chatId = reps ? call.getString("chatId") : TelegramStore.chatId(getContext());
        String token = reps ? TelegramStore.tokenFor(getContext(), repBot(call)) : TelegramStore.token(getContext());
        if (token == null || chatId == null || (reps && !TelegramStore.isLinkedRepChat(getContext(), chatId))) {
            call.reject(reps ? "المندوب غير مربوط ببوت المندوبين" : "اربط تيليغرام أولاً من الإعدادات");
            return;
        }
        if (base64 == null || base64.isEmpty()) {
            call.reject("الملف فارغ");
            return;
        }
        telegramExecutor.execute(() -> {
            try {
                byte[] file = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                if (Boolean.TRUE.equals(call.getBoolean("photo", false))) {
                    String type = fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".png") ? "image/png" : "image/jpeg";
                    TelegramClient.sendPhoto(token, chatId, fileName, type, file, caption);
                } else {
                    String contentType = call.getString("contentType", "application/pdf");
                    TelegramClient.sendDocument(token, chatId, fileName, contentType, file, caption);
                }
                call.resolve();
            } catch (TelegramClient.TelegramError e) {
                call.reject("رفض تيليغرام الملف: " + e.getMessage());
            } catch (Exception e) {
                call.reject("تعذر الإرسال - تأكد من الإنترنت");
            }
        });
    }

    /**
     * Reads new messages sent to a bot (while the app is open - the app answers commands itself,
     * since the data lives only on this phone). Owner: only the connected chat. Reps: every private
     * chat, with its id and name, so the app can answer linked reps and list the others as link
     * requests. Pass back `nextOffset` next time to mark these as read.
     */
    @PluginMethod
    public void telegramPoll(PluginCall call) {
        boolean reps = isRepsBot(call);
        String token = reps ? TelegramStore.repsToken(getContext()) : TelegramStore.token(getContext());
        if (token == null || (!reps && !TelegramStore.isConfigured(getContext()))) {
            call.reject("not configured");
            return;
        }
        Long offset = call.getLong("offset");
        telegramExecutor.execute(() -> {
            try {
                Map<String, String> params = new LinkedHashMap<>();
                params.put("timeout", "0");
                params.put("allowed_updates", "[\"message\"]");
                if (offset != null && offset > 0) params.put("offset", String.valueOf(offset));
                JSONArray updates = TelegramClient.call(token, "getUpdates", params).getJSONArray("result");
                String ownerChat = TelegramStore.chatId(getContext());
                long next = offset != null ? offset : 0;
                JSArray messages = new JSArray();
                for (int i = 0; i < updates.length(); i++) {
                    JSONObject update = updates.getJSONObject(i);
                    next = Math.max(next, update.optLong("update_id") + 1);
                    JSONObject message = update.optJSONObject("message");
                    JSONObject chat = message != null ? message.optJSONObject("chat") : null;
                    if (chat == null || !"private".equals(chat.optString("type"))) continue;
                    String chatId = String.valueOf(chat.optLong("id"));
                    if (!reps && !chatId.equals(ownerChat)) continue;
                    String text = message.optString("text", "");
                    JSONObject document = reps ? message.optJSONObject("document") : null;
                    boolean deviceFile = document != null && TelegramReplies.isDeviceFile(document.optString("file_name", ""));
                    if (text.isEmpty() && !deviceFile) continue;
                    JSObject item = new JSObject();
                    item.put("text", text);
                    if (deviceFile) {
                        item.put("fileId", document.optString("file_id", ""));
                        item.put("fileName", document.optString("file_name", ""));
                    }
                    item.put("chatId", chatId);
                    String first = chat.optString("first_name", "");
                    String last = chat.optString("last_name", "");
                    item.put("name", (first + " " + last).trim());
                    item.put("username", chat.optString("username", ""));
                    messages.put(item);
                }
                JSObject ret = new JSObject();
                ret.put("messages", messages);
                ret.put("nextOffset", next);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("poll failed");
            }
        });
    }

    @PluginMethod
    public void syncNow(PluginCall call) {
        if (!isMultiProfileSupported()) {
            call.reject("هذا الجهاز لا يدعم المتصفحات المستقلة", ERROR_CODE_UNSUPPORTED);
            return;
        }
        List<AutoSyncAccountStore.Entry> stored = AutoSyncAccountStore.load(getContext());
        if (stored.isEmpty()) {
            call.reject("لا توجد حسابات للمزامنة - افتح كل حساب مرة واحدة أولًا", ERROR_CODE_NO_ACCOUNTS);
            return;
        }

        // Optional: scope this run to one card's own "تحديث" tap instead of the whole list.
        String accountId = call.getString("accountId");
        if (accountId != null && !accountId.trim().isEmpty()) {
            boolean known = false;
            for (AutoSyncAccountStore.Entry entry : stored) {
                if (entry.accountId.equals(accountId)) {
                    known = true;
                    break;
                }
            }
            if (!known) {
                call.reject("لم يتم فتح هذا الحساب من قبل - افتحه أولًا بزر \"فتح\"", ERROR_CODE_NO_ACCOUNTS);
                return;
            }
        }

        AutoSyncScheduler.triggerNow(getContext(), accountId);
        call.resolve();
    }

    /**
     * Reads the raw session cookies for each given accountId's isolated profile, for a small
     * fixed set of known Starlink hosts (SESSION_COOKIE_URLS) - used only as an in-memory
     * pass-through to the web layer, which is responsible for encrypting it with a user-chosen
     * password before it ever touches disk (see apps/web/src/lib/backupCrypto.ts). This method
     * itself never writes anything to a file and never logs the values it reads or returns.
     *
     * An id whose profile was never created (never opened via openAccountBrowser) is simply
     * absent from the result, not an error - there is nothing to export for it. Only cookies are
     * captured, with no attributes (expiry/secure/domain - android.webkit.CookieManager's public
     * API exposes none of those; importSessionCookies re-derives them) and no localStorage/
     * IndexedDB, so this is a best-effort session snapshot, not a byte-for-byte profile clone.
     */
    /** Prefix of the second key a device carries when its Outlook mailbox travels with it. */
    private static final String MAIL_SESSION_PREFIX = "mail:";

    @PluginMethod
    public void exportSessionCookies(PluginCall call) {
        boolean withMailbox = Boolean.TRUE.equals(call.getBoolean("mailbox", false));
        JSArray accountIdsArray = call.getArray("accountIds");
        List<String> accountIds = new ArrayList<>();
        if (accountIdsArray != null) {
            for (int i = 0; i < accountIdsArray.length(); i++) {
                try {
                    String accountId = accountIdsArray.getString(i);
                    if (accountId != null && !accountId.trim().isEmpty()) {
                        accountIds.add(accountId);
                    }
                } catch (JSONException ignored) {
                    // Not a string entry - skip it.
                }
            }
        }
        if (accountIds.isEmpty() || !isMultiProfileSupported()) {
            JSObject ret = new JSObject();
            ret.put("sessions", new JSObject());
            call.resolve(ret);
            return;
        }
        mainHandler.post(() -> {
            try {
                JSObject sessions = new JSObject();
                for (String accountId : accountIds) {
                    CookieManager cookieManager = existingCookieManager(accountId);
                    if (cookieManager == null) {
                        continue;
                    }
                    JSObject cookiesByUrl = new JSObject();
                    for (String url : SESSION_COOKIE_URLS) {
                        String cookie = cookieManager.getCookie(url);
                        if (cookie != null && !cookie.isEmpty()) {
                            cookiesByUrl.put(url, cookie);
                        }
                    }
                    if (cookiesByUrl.length() > 0) {
                        sessions.put(accountId, cookiesByUrl);
                    }
                    // The device's Outlook mailbox, when asked for (a rep sending a device that
                    // he also signed the mailbox into) - under its own "mail:" key.
                    if (withMailbox) {
                        CookieManager mailCookies = mailCookieManager(accountId);
                        if (mailCookies != null) {
                            JSObject mailByUrl = new JSObject();
                            for (String url : MailUrl.MAIL_COOKIE_URLS) {
                                String cookie = mailCookies.getCookie(url);
                                if (cookie != null && !cookie.isEmpty()) {
                                    mailByUrl.put(url, cookie);
                                }
                            }
                            if (mailByUrl.length() > 0) {
                                sessions.put(MAIL_SESSION_PREFIX + accountId, mailByUrl);
                            }
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("sessions", sessions);
                call.resolve(ret);
            } catch (RuntimeException ex) {
                call.reject("تعذر قراءة جلسات الدخول");
            }
        });
    }

    /**
     * Restores cookies previously read by exportSessionCookies into each account's isolated
     * profile (created if it doesn't exist yet). Rejects on an unsupported device rather than
     * silently importing nothing. Restored cookies are persistent (they survive the app being
     * closed) and domain-wide where the apex saw them - see CookieStringUtil#buildRestoreCookies.
     * Only allow-listed Starlink URLs from the backup are ever written. Never establishes a login
     * beyond what the cookies themselves carry: if Starlink already invalidated the session, this
     * restores a dead one - checkSession is how the caller finds out.
     */
    @PluginMethod
    public void importSessionCookies(PluginCall call) {
        if (!isMultiProfileSupported()) {
            call.reject("هذا الجهاز لا يدعم المتصفحات المستقلة", ERROR_CODE_UNSUPPORTED);
            return;
        }
        JSObject sessions = call.getObject("sessions");
        if (sessions == null) {
            JSObject ret = new JSObject();
            ret.put("importedCount", 0);
            call.resolve(ret);
            return;
        }
        mainHandler.post(() -> {
            try {
                int importedCount = 0;
                Iterator<String> accountIds = sessions.keys();
                while (accountIds.hasNext()) {
                    String accountId = accountIds.next();
                    if (accountId == null || accountId.trim().isEmpty()) {
                        continue;
                    }
                    JSONObject cookiesByUrlJson = sessions.optJSONObject(accountId);
                    if (cookiesByUrlJson == null) {
                        continue;
                    }
                    // A "mail:<id>" entry restores the device's Outlook mailbox (its own profile
                    // and allow-list); anything else is the Starlink session.
                    boolean isMail = accountId.startsWith(MAIL_SESSION_PREFIX);
                    String deviceId = isMail ? accountId.substring(MAIL_SESSION_PREFIX.length()) : accountId;
                    if (deviceId.trim().isEmpty()) {
                        continue;
                    }
                    Map<String, String> cookiesByUrl = new LinkedHashMap<>();
                    Iterator<String> urls = cookiesByUrlJson.keys();
                    while (urls.hasNext()) {
                        String url = urls.next();
                        if (isMail ? MailUrl.isAllowed(url) : AllowedUrl.isAllowed(url)) {
                            cookiesByUrl.put(url, cookiesByUrlJson.optString(url, null));
                        }
                    }
                    List<CookieStringUtil.RestoreCookie> cookies =
                        CookieStringUtil.buildRestoreCookies(cookiesByUrl, isMail ? MailUrl.MAIL_COOKIE_APEX_HOST : SESSION_COOKIE_APEX_HOST);
                    if (cookies.isEmpty()) {
                        continue;
                    }
                    String profileName;
                    try {
                        profileName = isMail ? ProfileNaming.mailProfileNameFor(deviceId) : ProfileNaming.profileNameFor(deviceId);
                    } catch (RuntimeException ex) {
                        continue;
                    }
                    CookieManager cookieManager = ProfileStore.getInstance().getOrCreateProfile(profileName).getCookieManager();
                    boolean restoredAny = false;
                    for (CookieStringUtil.RestoreCookie cookie : cookies) {
                        cookieManager.setCookie(cookie.url, cookie.cookie);
                        restoredAny = true;
                    }
                    if (restoredAny) {
                        cookieManager.flush();
                        importedCount++;
                        // The restored mailbox is signed in - the green «📧 البريد» and the
                        // «البريد المسجّل» page reflect it (the email comes from the account).
                        if (isMail) {
                            MailSessionStore.markSignedIn(getContext(), deviceId, "");
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("importedCount", importedCount);
                call.resolve(ret);
            } catch (RuntimeException ex) {
                call.reject("تعذر استعادة جلسات الدخول");
            }
        });
    }

    /**
     * "فحص الجلسة": opens the account's Starlink home page in a hidden WebView on its own isolated
     * profile - exactly what "فتح" would show - and reports whether it lands on the logged-in
     * portal or on a sign-in page (see SessionProbe; nothing from the page is read or returned
     * beyond that). Resolves `status`:
     *   "loggedIn" | "loginRequired" | "none" (no profile / no cookies at all) | "unknown"
     * (offline, a load error, or no clear answer before the timeout). Rejects only on an
     * unsupported device. Never logs anything in or out; one account per call.
     */
    @PluginMethod
    public void checkSession(PluginCall call) {
        String accountId = call.getString("accountId");
        if (accountId == null || accountId.trim().isEmpty()) {
            call.reject("accountId is required");
            return;
        }
        if (!isMultiProfileSupported()) {
            call.reject("هذا الجهاز لا يدعم المتصفحات المستقلة", ERROR_CODE_UNSUPPORTED);
            return;
        }
        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
        } catch (RuntimeException ex) {
            call.reject("Invalid accountId: " + ex.getMessage());
            return;
        }
        Context context = getContext().getApplicationContext();
        mainHandler.post(() -> {
            try {
                runSessionCheckOnMainThread(context, accountId, profileName, call);
            } catch (RuntimeException ex) {
                resolveSessionStatus(call, SessionProbe.STATUS_UNKNOWN);
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void runSessionCheckOnMainThread(Context context, String accountId, String profileName, PluginCall call) {
        CookieManager cookieManager = existingCookieManager(accountId);
        if (cookieManager == null || !hasAnySessionCookie(cookieManager)) {
            resolveSessionStatus(call, SessionProbe.STATUS_NONE);
            return;
        }

        WebView webView = new WebView(context);
        WebViewCompat.setProfile(webView, profileName);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        AtomicBoolean finished = new AtomicBoolean(false);
        AtomicBoolean probing = new AtomicBoolean(false);
        int[] consecutiveAccount = { 0 };
        String[] lastProbe = { null };

        // Resolves exactly once and always tears the hidden WebView down.
        StatusSink finish = status -> {
            if (!finished.compareAndSet(false, true)) {
                return;
            }
            mainHandler.removeCallbacksAndMessages(webView);
            webView.stopLoading();
            webView.setWebViewClient(new WebViewClient());
            webView.destroy();
            resolveSessionStatus(call, status);
        };

        Runnable[] probe = new Runnable[1];
        probe[0] = () -> {
            if (finished.get()) {
                return;
            }
            if (!AllowedUrl.isAllowed(webView.getUrl())) {
                // Left the allow-listed portal - never run script there; keep waiting (it may
                // come back) and let the timeout answer.
                lastProbe[0] = SessionProbe.PROBE_OTHER;
                consecutiveAccount[0] = 0;
                mainHandler.postAtTime(probe[0], webView, SystemClock.uptimeMillis() + SESSION_CHECK_SETTLE_MS);
                return;
            }
            webView.evaluateJavascript(SessionProbe.SCRIPT, value -> {
                if (finished.get()) {
                    return;
                }
                String report = SessionProbe.parse(value);
                lastProbe[0] = report;
                String status = SessionProbe.decide(report, consecutiveAccount);
                if (status != null) {
                    finish.done(status);
                } else {
                    mainHandler.postAtTime(probe[0], webView, SystemClock.uptimeMillis() + SESSION_CHECK_SETTLE_MS);
                }
            });
        };

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (probing.compareAndSet(false, true)) {
                        mainHandler.postAtTime(probe[0], webView, SystemClock.uptimeMillis() + SESSION_CHECK_SETTLE_MS);
                    }
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        finish.done(SessionProbe.STATUS_UNKNOWN);
                    }
                }
            }
        );

        mainHandler.postAtTime(() -> finish.done(SessionProbe.onTimeout(lastProbe[0])), webView, SystemClock.uptimeMillis() + SESSION_CHECK_TIMEOUT_MS);
        webView.loadUrl(DEFAULT_URL);
    }

    /** java.util.function.Consumer needs API 24; minSdk is lower. */
    private interface StatusSink {
        void done(String status);
    }

    private static void resolveSessionStatus(PluginCall call, String status) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        call.resolve(ret);
    }

    /** The account's isolated profile's CookieManager, or null when the profile was never created
     * (never opened) - never creates one. Main thread only. */
    private static CookieManager existingCookieManager(String accountId) {
        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
        } catch (RuntimeException ex) {
            return null;
        }
        Profile profile = ProfileStore.getInstance().getProfile(profileName);
        return profile == null ? null : profile.getCookieManager();
    }

    /** The cookie manager of a device's Outlook mailbox profile, or null if it was never opened. */
    private static CookieManager mailCookieManager(String accountId) {
        String profileName;
        try {
            profileName = ProfileNaming.mailProfileNameFor(accountId);
        } catch (RuntimeException ex) {
            return null;
        }
        Profile profile = ProfileStore.getInstance().getProfile(profileName);
        return profile == null ? null : profile.getCookieManager();
    }

    private static boolean hasAnySessionCookie(CookieManager cookieManager) {
        for (String url : SESSION_COOKIE_URLS) {
            String cookie = cookieManager.getCookie(url);
            if (cookie != null && !cookie.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Opens this app's own OS-level notification settings screen, rather than building a second,
     * redundant in-app toggle for sync/reminder notifications: SyncNotifier.java already checks
     * NotificationManagerCompat#areNotificationsEnabled() before posting anything, so the one
     * switch that actually controls both notification kinds is the one Android itself already
     * provides. Never rejects - on the rare device where this screen doesn't exist, the intent
     * simply won't resolve to anything and the call still completes.
     */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        call.resolve();
    }

    private boolean isMultiProfileSupported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
    }
}
