package com.starnetbroser.localbrowser;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 📋 A Starlink session pasted in a bot («Cookie-Editor» → Export → JSON): TelegramReplyService
 * leaves its pieces (Telegram cuts a long text into ~4096-character messages, often inside one
 * long cookie value) for the app, which joins them and adds the device (telegramSession.ts - same
 * rules). Any piece that looks like exported cookies - the first, a middle, or the tail - counts,
 * so a split session is never answered as a command. Never logged. Pure Java (no android.*),
 * JUnit-tested.
 */
final class SessionText {

    private SessionText() {}

    static final long PART_GAP_MS = 5 * 60_000L;

    private static final Pattern COOKIE_KEY = Pattern.compile("\"(name|value|domain|path|secure|httpOnly|hostOnly|expirationDate|sameSite)\"\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern NETSCAPE = Pattern.compile("\\t(TRUE|FALSE)\\t");
    private static final Pattern ARABIC = Pattern.compile("[\\u0600-\\u06ff]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s");
    private static final Pattern HEADER = Pattern.compile("(^|;\\s*)[A-Za-z0-9._-]+=[^\\s;]{12,}");
    private static final Pattern TWO_WORDS = Pattern.compile("^\\S+\\s+\\S+\\s");

    private static final Map<String, Long> lastPartAt = new HashMap<>();

    /** One message that is (a piece of) an exported session - never a short command. */
    static boolean isFragment(String text) {
        String t = text == null ? "" : text.trim();
        if (t.length() < 40 || ARABIC.matcher(t).find()) return false;
        char c = t.charAt(0);
        if (c == '[' || c == '{' || c == ']' || c == '}' || c == ',' || c == '"') return true;
        if (COOKIE_KEY.matcher(t).find() || NETSCAPE.matcher(t).find()) return true;
        if (t.length() >= 120 && !WHITESPACE.matcher(t).find()) return true;
        return HEADER.matcher(t).find() && !TWO_WORDS.matcher(t).find();
    }

    /** True when this message of `chatKey` is (a piece of) a session - it goes to the app, in
     * arrival order, and is never answered as a command. */
    static synchronized boolean take(String chatKey, String text, long now) {
        if (!isFragment(text)) return false;
        Long last = lastPartAt.get(chatKey);
        if (last == null || now - last > PART_GAP_MS) lastPartAt.remove(chatKey);
        lastPartAt.put(chatKey, now);
        return true;
    }

    /** The first piece he sends - used only to decide whether to tell him «📥 وصلت الجلسة». */
    static boolean isStart(String text) {
        String t = text == null ? "" : text.trim();
        return isFragment(text) && (t.startsWith("[") || t.startsWith("{"));
    }
}
