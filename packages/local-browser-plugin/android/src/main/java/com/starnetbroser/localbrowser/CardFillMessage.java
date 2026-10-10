package com.starnetbroser.localbrowser;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 💳 The small messages the card-fill script (starnetCardFill.js) sends from a page frame:
 * {"type":"ready"|"focus"|"filled"|"sight"|"clicked"|"stuck", ...}. Pure Java (no android.*),
 * JUnit-tested.
 */
final class CardFillMessage {

    private CardFillMessage() {}

    private static final Pattern TYPE = Pattern.compile("\"type\"\\s*:\\s*\"(ready|focus|filled|sight|clicked|stuck)\"");
    private static final Pattern COUNT = Pattern.compile("\"count\"\\s*:\\s*(\\d+)");

    /** "ready", "focus", "filled", "sight", "clicked", "stuck", or null for anything else. */
    static String type(String message) {
        if (message == null) return null;
        Matcher m = TYPE.matcher(message);
        return m.find() ? m.group(1) : null;
    }

    /** How many fields a "filled" message says were filled (0 when unknown). */
    static int count(String message) {
        if (message == null) return 0;
        Matcher m = COUNT.matcher(message);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    /** A "sight" flag ({"save":true}). */
    static boolean flag(String message, String name) {
        if (message == null) return false;
        return Pattern.compile("\"" + Pattern.quote(name) + "\"\\s*:\\s*true").matcher(message).find();
    }

    /** A short text value ({"what":"save"}, {"onFile":"1111"}, {"error":"declined"}); null when absent / null. */
    static String text(String message, String name) {
        if (message == null) return null;
        Matcher m = Pattern.compile("\"" + Pattern.quote(name) + "\"\\s*:\\s*\"([A-Za-z0-9-]{1,40})\"").matcher(message);
        return m.find() ? m.group(1) : null;
    }

    /** A card goes only to secure pages' frames. */
    static boolean isSecureOrigin(String scheme) {
        return "https".equalsIgnoreCase(scheme);
    }
}
