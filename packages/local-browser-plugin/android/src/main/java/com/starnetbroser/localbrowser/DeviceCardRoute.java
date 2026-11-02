package com.starnetbroser.localbrowser;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * 🗂️ «البطاقة» in a device's browser (his Nov 2 2026 ask): back to the app on THIS device's card - the home page's
 * search for its email (else its name), the same «/?q=…» route a 🔔 notification about a device opens. Pure.
 */
final class DeviceCardRoute {

    private DeviceCardRoute() {}

    /** "/?q=<email or name>", or "/" when neither is known. */
    static String of(String email, String name) {
        String key = email != null && !email.trim().isEmpty() ? email.trim() : name != null ? name.trim() : "";
        if (key.isEmpty()) return "/";
        if (key.length() > 120) key = key.substring(0, 120);
        try {
            return "/?q=" + URLEncoder.encode(key, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            return "/";
        }
    }
}
