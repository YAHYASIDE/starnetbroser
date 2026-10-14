package com.starnetbroser.localbrowser;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 🖐 Unlocking STAR NET with the phone's fingerprint (or face) - Android's own BiometricPrompt.
 * Only answers yes/no: no key, no fingerprint data ever reaches the app. The PIN stays the
 * fallback («استخدم الرمز» closes the prompt).
 */
final class BiometricUnlock {
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    interface Result {
        /** ok: the finger was accepted; else `error` says why (canceled, no fingerprint, locked out…). */
        void done(boolean ok, String error);
    }

    private BiometricUnlock() {}

    /** A fingerprint (or face) is set up on this phone and can be used now. */
    static boolean available(AppCompatActivity activity) {
        return BiometricManager.from(activity).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    /** Shows the prompt (main thread); `result` is called exactly once. */
    static void authenticate(AppCompatActivity activity, String title, String subtitle, String cancel, Result result) {
        AtomicBoolean answered = new AtomicBoolean(false);
        BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult authResult) {
                if (answered.compareAndSet(false, true)) result.done(true, null);
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                if (answered.compareAndSet(false, true)) result.done(false, errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON || errorCode == BiometricPrompt.ERROR_USER_CANCELED ? "canceled" : String.valueOf(errString));
            }
            // onAuthenticationFailed (a finger not recognized): the prompt itself says so and waits for another try.
        });
        BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setNegativeButtonText(cancel)
            .setAllowedAuthenticators(AUTHENTICATORS);
        if (subtitle != null && !subtitle.isEmpty()) info.setSubtitle(subtitle);
        prompt.authenticate(info.build());
    }
}
