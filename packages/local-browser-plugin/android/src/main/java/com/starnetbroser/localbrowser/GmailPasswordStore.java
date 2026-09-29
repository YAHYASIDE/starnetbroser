package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;

/**
 * Each Gmail's «كلمة مرور التطبيق», in the phone's private app storage, keyed by the email (so
 * two devices on the same Gmail share it). Never logged, never sent anywhere but Gmail's IMAP.
 */
final class GmailPasswordStore {

    private static final String PREFS = "starnet_gmail_app_passwords";

    private GmailPasswordStore() {}

    static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    static String get(Context context, String email) {
        String k = key(email);
        return k.isEmpty() ? null : prefs(context).getString(k, null);
    }

    static void put(Context context, String email, String appPassword) {
        String k = key(email);
        if (k.isEmpty()) return;
        prefs(context).edit().putString(k, appPassword.replace(" ", "")).apply();
    }

    static void remove(Context context, String email) {
        prefs(context).edit().remove(key(email)).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
