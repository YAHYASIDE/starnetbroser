package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.Intent;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    private boolean isMultiProfileSupported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
    }
}
