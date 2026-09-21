package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.Intent;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
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

        boolean deleted;
        try {
            deleted = ProfileStore.getInstance().deleteProfile(profileName);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            // Profile never existed, is the (unreachable, per ProfileNaming) default profile, or
            // still has a live WebView attached. Report "nothing deleted" instead of crashing -
            // the account is already gone from STAR NET either way by the time this is called.
            deleted = false;
        }

        JSObject ret = new JSObject();
        ret.put("deleted", deleted);
        call.resolve(ret);
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
        if (AutoSyncAccountStore.load(getContext()).isEmpty()) {
            call.reject("لا توجد حسابات للمزامنة - افتح كل حساب مرة واحدة أولًا", ERROR_CODE_NO_ACCOUNTS);
            return;
        }
        AutoSyncScheduler.triggerNow(getContext());
        call.resolve();
    }

    private boolean isMultiProfileSupported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
    }
}
