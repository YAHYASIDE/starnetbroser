package com.starnetbroser.localbrowser;

import android.content.Context;
import java.util.Locale;

/**
 * 📮 «بريد على نطاقي» (his Oct 17 2026 choice): the devices' emails are made-up addresses on his own
 * domain (ahmed.salem427@his-domain), all forwarded to his «بريد الرموز» Gmail - no mailbox per device.
 * A Starlink code for such a device is read from that Gmail, from the messages sent TO that device's
 * address only (another device's code of the same minute is never taken).
 */
final class ForwardedMail {

    private static final String PREFS = "starnet_forwarded_mail";
    private static final String KEY_DOMAIN = "domain";

    private ForwardedMail() {}

    /** "his-domain.com" from what he typed ("@His-Domain.com ", "https://his-domain.com/"); "" when empty or not a domain. */
    static String normalizeDomain(String raw) {
        if (raw == null) return "";
        String d = raw.trim().toLowerCase(Locale.ROOT).replaceFirst("^https?://", "").replaceFirst("^@", "");
        int slash = d.indexOf('/');
        if (slash >= 0) d = d.substring(0, slash);
        return d.matches("[a-z0-9-]+(\\.[a-z0-9-]+)+") ? d : "";
    }

    /** True when `email` is on `domain` (pure). */
    static boolean onDomain(String email, String domain) {
        if (email == null || domain == null || domain.isEmpty()) return false;
        return email.trim().toLowerCase(Locale.ROOT).endsWith("@" + domain);
    }

    static void setDomain(Context context, String domain) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DOMAIN, normalizeDomain(domain)).apply();
    }

    static String domain(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DOMAIN, "");
    }

    static boolean isForwarded(Context context, String email) {
        return onDomain(email, domain(context));
    }
}
