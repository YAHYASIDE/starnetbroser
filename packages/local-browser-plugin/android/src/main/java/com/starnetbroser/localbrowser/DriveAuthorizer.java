package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * Google access tokens: Drive for the off-phone backup (Settings → Google Drive), and 📨 Gmail's
 * read-only scope for «بريد الرموز» (GmailCodes). Drive only ever asks for
 * "drive.file": the app sees the files it created itself (its STARNET backups folder) and nothing
 * else in the operator's Drive. Uses Google Identity Services' AuthorizationClient, which needs no
 * client secret in the APK - Google matches this app by its package name + signing certificate
 * against the Android OAuth client the operator registered in their own Google Cloud project.
 *
 * The access token is never stored here or in the web app: authorize() hands back a fresh (or
 * still-valid cached) one every time, silently once the operator has approved it.
 */
final class DriveAuthorizer {

    static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    static final String ERROR_CONSENT_REQUIRED = "DRIVE_CONSENT_REQUIRED";
    static final String ERROR_CANCELLED = "DRIVE_CANCELLED";
    static final String ERROR_FAILED = "DRIVE_AUTH_FAILED";

    /** Where a token (or the reason there is none) goes - a plugin call, or GmailCodeFetcher. */
    interface TokenCallback {
        void onToken(String token);

        void onError(String message, String code);
    }

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private TokenCallback pending;

    /** Must run while the Activity is being created (Plugin#load) - an ActivityResultLauncher can't
     * be registered once it has started. */
    void register(Activity activity) {
        if (!(activity instanceof AppCompatActivity)) {
            return;
        }
        try {
            consentLauncher = ((AppCompatActivity) activity).registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                result -> onConsentResult(activity, result)
            );
        } catch (IllegalStateException ex) {
            consentLauncher = null;
        }
    }

    void authorize(Activity activity, PluginCall call, boolean interactive) {
        authorize(activity, DRIVE_FILE_SCOPE, null, interactive, "يلزم ربط Google Drive من الإعدادات", forCall(call));
    }

    /** A token for `scope` (Drive's, or 📨 Gmail's read-only one), for `accountEmail` when given
     * (the Google account on this phone with that address - Google then never picks another one,
     * such as the account already linked for Drive; real, confirmed) or whichever account Google
     * picks when null. Non-interactive never shows a Google screen: it fails with
     * ERROR_CONSENT_REQUIRED and `consentMessage`. */
    void authorize(Activity activity, String scope, String accountEmail, boolean interactive, String consentMessage, TokenCallback callback) {
        authorizeWith(activity, scope, accountEmail, interactive, consentMessage, callback, consentLauncher);
    }

    /** The same, from a screen that has no consent launcher (the mail browser): never interactive. */
    static void authorizeSilently(Activity activity, String scope, String accountEmail, TokenCallback callback) {
        new DriveAuthorizer().authorizeWith(activity, scope, accountEmail, false, "", callback, null);
    }

    /** 💳 A token for the background (KastWatch): no screen, never asks - null when consent is
     * needed or Google can't be reached. Blocking - never on the main thread. */
    static String tokenInBackground(Context context, String scope, String accountEmail) {
        AuthorizationRequest.Builder builder = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(scope)));
        if (accountEmail != null && !accountEmail.trim().isEmpty()) {
            builder.setAccount(new android.accounts.Account(accountEmail.trim(), "com.google"));
        }
        try {
            AuthorizationResult result = com.google.android.gms.tasks.Tasks.await(
                Identity.getAuthorizationClient(context).authorize(builder.build()), 30, java.util.concurrent.TimeUnit.SECONDS);
            if (result.hasResolution()) return null;
            String token = result.getAccessToken();
            return token == null || token.isEmpty() ? null : token;
        } catch (Exception e) {
            return null;
        }
    }

    private void authorizeWith(Activity activity, String scope, String accountEmail, boolean interactive, String consentMessage,
                               TokenCallback callback, ActivityResultLauncher<IntentSenderRequest> launcher) {
        AuthorizationRequest.Builder builder = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(scope)));
        if (accountEmail != null && !accountEmail.trim().isEmpty()) {
            builder.setAccount(new android.accounts.Account(accountEmail.trim(), "com.google"));
        }
        AuthorizationRequest request = builder.build();
        Identity.getAuthorizationClient(activity)
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(callback, result);
                    return;
                }
                PendingIntent consent = result.getPendingIntent();
                if (!interactive || consent == null || launcher == null) {
                    callback.onError(consentMessage, ERROR_CONSENT_REQUIRED);
                    return;
                }
                if (pending != null) {
                    pending.onError("طلب ربط آخر بدأ", ERROR_CANCELLED);
                }
                pending = callback;
                activity.runOnUiThread(() -> launcher.launch(new IntentSenderRequest.Builder(consent.getIntentSender()).build()));
            })
            .addOnFailureListener(error -> callback.onError("تعذر الاتصال بحساب Google: " + error.getMessage(), ERROR_FAILED));
    }

    private static TokenCallback forCall(PluginCall call) {
        return new TokenCallback() {
            @Override
            public void onToken(String token) {
                JSObject ret = new JSObject();
                ret.put("accessToken", token);
                call.resolve(ret);
            }

            @Override
            public void onError(String message, String code) {
                call.reject(message, code);
            }
        };
    }

    /** A token Drive rejected (401) is dropped from Google Play services' cache, so the next
     * authorize() fetches a new one instead of handing back the same dead token. Blocking call -
     * never on the main thread. */
    void clearToken(Context context, PluginCall call, String token) {
        new Thread(() -> {
            try {
                GoogleAuthUtil.clearToken(context, token);
            } catch (Exception ignored) {
                // Nothing cached under that token - the next authorize() is fresh either way.
            }
            call.resolve();
        }).start();
    }

    private void onConsentResult(Activity activity, ActivityResult result) {
        TokenCallback callback = pending;
        pending = null;
        if (callback == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            callback.onError("لم تتم الموافقة على الوصول إلى حساب Google", ERROR_CANCELLED);
            return;
        }
        try {
            AuthorizationResult authorization = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.getData());
            resolveToken(callback, authorization);
        } catch (ApiException ex) {
            callback.onError("تعذر إكمال الربط مع Google: " + ex.getMessage(), ERROR_FAILED);
        }
    }

    private static void resolveToken(TokenCallback callback, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            callback.onError("لم يُرجع Google رمز وصول", ERROR_FAILED);
            return;
        }
        callback.onToken(token);
    }
}
