package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;

/** 💬 His saved choice of WhatsApp ("personal" / "business" / "ask"), pushed by the app (setWhatsAppApp) - read by the native shares. */
final class WhatsAppChoice {

    private WhatsAppChoice() {}

    private static final String PREFS = "starnet_whatsapp_app";
    private static final String KEY = "choice";

    static String get(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return normalize(p.getString(KEY, "ask"));
    }

    static void set(Context context, String choice) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, normalize(choice)).apply();
    }

    /** Only the three known words; anything else is «ask». */
    static String normalize(String choice) {
        return "personal".equals(choice) || "business".equals(choice) ? choice : "ask";
    }

    /** Is this package installed (visible - AndroidManifest queries)? */
    static boolean installed(Context context, String pkg) {
        try {
            context.getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
