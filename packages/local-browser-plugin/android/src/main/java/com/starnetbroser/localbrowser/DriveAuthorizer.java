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
 * Google Drive access for the off-phone backup (Settings → Google Drive). Only ever asks for
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

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

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
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_FILE_SCOPE)))
            .build();
        Identity.getAuthorizationClient(activity)
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                PendingIntent consent = result.getPendingIntent();
                if (!interactive || consent == null || consentLauncher == null) {
                    call.reject("يلزم ربط Google Drive من الإعدادات", ERROR_CONSENT_REQUIRED);
                    return;
                }
                if (pendingCall != null) {
                    pendingCall.reject("طلب ربط آخر بدأ", ERROR_CANCELLED);
                }
                pendingCall = call;
                activity.runOnUiThread(() -> consentLauncher.launch(new IntentSenderRequest.Builder(consent.getIntentSender()).build()));
            })
            .addOnFailureListener(error -> call.reject("تعذر الاتصال بحساب Google: " + error.getMessage(), ERROR_FAILED));
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
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("لم تتم الموافقة على الوصول إلى Google Drive", ERROR_CANCELLED);
            return;
        }
        try {
            AuthorizationResult authorization = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.getData());
            resolveToken(call, authorization);
        } catch (ApiException ex) {
            call.reject("تعذر إكمال ربط Google Drive: " + ex.getMessage(), ERROR_FAILED);
        }
    }

    private static void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("لم يُرجع Google رمز وصول", ERROR_FAILED);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}
