package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Which devices' mailboxes (📧 البريد) are signed in on this phone: set when a mailbox reaches the
 * Outlook inbox, cleared when it lands on the Microsoft sign-in page (MailUrl.sessionState) or its
 * device session is deleted. Only the email and a time are kept - never a password or cookie.
 */
final class MailSessionStore {

    private static final String PREFS = "starnet_mail_sessions";

    private MailSessionStore() {}

    static void markSignedIn(Context context, String accountId, String email) {
        if (accountId == null || accountId.isEmpty()) return;
        String value = System.currentTimeMillis() + "|" + (email == null ? "" : email.trim());
        prefs(context).edit().putString(accountId, value).apply();
    }

    static void markSignedOut(Context context, String accountId) {
        if (accountId == null || accountId.isEmpty()) return;
        prefs(context).edit().remove(accountId).apply();
    }

    /** accountId -> [signedInAtMillis, email]. */
    static Map<String, String[]> all(Context context) {
        Map<String, String[]> out = new LinkedHashMap<>();
        for (Map.Entry<String, ?> entry : prefs(context).getAll().entrySet()) {
            if (!(entry.getValue() instanceof String)) continue;
            String[] parts = parse((String) entry.getValue());
            if (parts != null) out.put(entry.getKey(), parts);
        }
        return out;
    }

    /** "time|email" -> [time, email], or null when unreadable. */
    static String[] parse(String stored) {
        if (stored == null) return null;
        int bar = stored.indexOf('|');
        if (bar <= 0) return null;
        return new String[] { stored.substring(0, bar), stored.substring(bar + 1) };
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
