package com.starnetbroser.localbrowser;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 💳 The small messages the card-fill script (starnetCardFill.js) sends from a page frame:
 * {"type":"ready"|"focus"|"filled", ...}. Pure Java (no android.*), JUnit-tested.
 */
final class CardFillMessage {

    private CardFillMessage() {}

    private static final Pattern TYPE = Pattern.compile("\"type\"\\s*:\\s*\"(ready|focus|filled)\"");
    private static final Pattern COUNT = Pattern.compile("\"count\"\\s*:\\s*(\\d+)");

    /** "ready", "focus", "filled", or null for anything else. */
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

    /** A card goes only to secure pages' frames. */
    static boolean isSecureOrigin(String scheme) {
        return "https".equalsIgnoreCase(scheme);
    }
}
