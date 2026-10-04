package com.starnetbroser.localbrowser;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 📋 A Starlink session pasted in a bot («Cookie-Editor» → Export → JSON): TelegramReplyService
 * leaves its parts (Telegram cuts a long text into ~4096-character messages) for the app, which
 * joins them and adds the device (telegramSession.ts - same rules). Never answered as a command,
 * never logged. Pure Java (no android.*), JUnit-tested.
 */
final class SessionText {

    private SessionText() {}

    static final long PART_GAP_MS = 3 * 60_000L;

    private static final Pattern NAME_KEY = Pattern.compile("\"name\"\\s*:");
    private static final Pattern VALUE_KEY = Pattern.compile("\"value\"\\s*:");
    private static final Pattern ANY_KEY = Pattern.compile("\"(name|value|domain)\"\\s*:");
    private static final Pattern STARLINK = Pattern.compile("starlink", Pattern.CASE_INSENSITIVE);
    private static final Pattern NETSCAPE = Pattern.compile("\\t(TRUE|FALSE)\\t");
    private static final Pattern HEADER = Pattern.compile("(^|;\\s*)[A-Za-z0-9._-]+=[^\\s;]{8,}");
    private static final Pattern COOKIE_SHAPE = Pattern.compile("\"(name|value|domain)\"\\s*:|\\tTRUE\\t|\\tFALSE\\t|Starlink\\.Com\\.", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHITESPACE = Pattern.compile("\\s");

    private static final Map<String, Long> lastPartAt = new HashMap<>();

    /** The first part: an exported cookie list, cookies.txt lines or "Name=value" pairs of Starlink. */
    static boolean isStart(String text) {
        String t = text == null ? "" : text.trim();
        if (t.startsWith("[") || t.startsWith("{")) return NAME_KEY.matcher(t).find() && VALUE_KEY.matcher(t).find();
        if (ANY_KEY.matcher(t).find()) return false;
        return STARLINK.matcher(t).find() && (NETSCAPE.matcher(t).find() || HEADER.matcher(t).find());
    }

    /** A following part of a session still arriving - never a short command with spaces. */
    static boolean isContinuation(String text) {
        String t = text == null ? "" : text.trim();
        if (t.isEmpty()) return false;
        if (COOKIE_SHAPE.matcher(t).find() || t.startsWith("]") || t.startsWith("}") || t.startsWith(",")) return true;
        return t.length() >= 200 && !WHITESPACE.matcher(t).find();
    }

    /** True when this message of `chatKey` is (part of) a session - it goes to the app. */
    static synchronized boolean take(String chatKey, String text, long now) {
        Long last = lastPartAt.get(chatKey);
        boolean open = last != null && now - last <= PART_GAP_MS;
        if ((open && isContinuation(text)) || isStart(text)) {
            lastPartAt.put(chatKey, now);
            return true;
        }
        if (!open) lastPartAt.remove(chatKey);
        return false;
    }
}
