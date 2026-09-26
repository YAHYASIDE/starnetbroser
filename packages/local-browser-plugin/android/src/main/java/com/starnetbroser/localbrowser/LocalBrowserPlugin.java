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

    @Override
    public void load() {
        activeInstance = new WeakReference<>(this);
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

        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
        } catch (RuntimeException ex) {
            call.reject("Invalid accountId: " + ex.getMessage());
            return;
        }

        String accountName = call.getString("accountName", accountId);
        String url = call.getString("url", DEFAULT_URL);

        // The caller (JS running in the app's WebView) is not trusted to pick where this
        // isolated, cookie-bearing browser navigates: only the real Starlink portal over HTTPS
        // is allowed, never http/file/javascript or an arbitrary host.
        if (!AllowedUrl.isAllowed(url)) {
            call.reject("Only https://starlink.com (or a subdomain) is allowed as the initial URL", ERROR_CODE_INVALID_URL);
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, AccountBrowserActivity.class);
        intent.putExtra(AccountBrowserActivity.EXTRA_PROFILE_NAME, profileName);
        intent.putExtra(AccountBrowserActivity.EXTRA_ACCOUNT_ID, accountId);
        intent.putExtra(AccountBrowserActivity.EXTRA_ACCOUNT_NAME, accountName);
        intent.putExtra(AccountBrowserActivity.EXTRA_URL, url);
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
        getActivity().startActivity(intent);
        call.resolve();
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
                entries.add(new AutoSyncAccountStore.Entry(accountId, obj.optString("accountName", null), url));
            }
        }

        boolean saved = AutoSyncAccountStore.save(getContext(), entries);
        if (saved) {
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
    @PluginMethod
    public void exportSessionCookies(PluginCall call) {
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
                    Map<String, String> cookiesByUrl = new LinkedHashMap<>();
                    Iterator<String> urls = cookiesByUrlJson.keys();
                    while (urls.hasNext()) {
                        String url = urls.next();
                        if (AllowedUrl.isAllowed(url)) {
                            cookiesByUrl.put(url, cookiesByUrlJson.optString(url, null));
                        }
                    }
                    List<CookieStringUtil.RestoreCookie> cookies = CookieStringUtil.buildRestoreCookies(cookiesByUrl, SESSION_COOKIE_APEX_HOST);
                    if (cookies.isEmpty()) {
                        continue;
                    }
                    String profileName;
                    try {
                        profileName = ProfileNaming.profileNameFor(accountId);
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
