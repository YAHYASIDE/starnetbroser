package com.starnetbroser.localbrowser;

/**
 * ✅ / ❌ under the money bot's operation messages (his Nov 1 2026 brief; the app builds them - lib/repOpMessage.ts).
 * A tap is `rt:g:<token>` or `rt:b:<token>` (8 hex, the operation's short id). The service:
 *  - records it once for the app (inbox «repOpRating»); the same choice tapped again does nothing;
 *  - marks the chosen button (the other one stays, to change his mind);
 *  - «❌ غير جيد» also reaches the operator at once (his own bot + the phone's bar).
 * Pure (no android.*), JUnit: TelegramRatingsTest.
 */
final class TelegramRatings {

    private TelegramRatings() {}

    /** The choices remembered per chat (`token=g;token=b;…`), newest last - enough for weeks of messages. */
    static final int MAX_REMEMBERED = 400;

    static final class Tap {
        final char verdict;
        final String token;

        Tap(char verdict, String token) {
            this.verdict = verdict;
            this.token = token;
        }
    }

    /** `rt:g:0a1b2c3d` → the tap, or null when it isn't one. */
    static Tap parse(String data) {
        if (data == null || data.length() != 13 || !data.startsWith("rt:") || data.charAt(4) != ':') return null;
        char v = data.charAt(3);
        if (v != 'g' && v != 'b') return null;
        String token = data.substring(5);
        if (!token.matches("[0-9a-f]{8}")) return null;
        return new Tap(v, token);
    }

    /** The buttons after a tap: the chosen one marked. */
    static String markup(String token, char chosen) {
        String good = chosen == 'g' ? "✅ جيد ✓" : "✅ جيد";
        String bad = chosen == 'b' ? "❌ غير جيد ✓" : "❌ غير جيد";
        return "{\"inline_keyboard\":[[{\"text\":\"" + good + "\",\"callback_data\":\"rt:g:" + token + "\"},{\"text\":\"" + bad
            + "\",\"callback_data\":\"rt:b:" + token + "\"}]]}";
    }

    /** What was chosen before for `token` in `remembered`, or 0. */
    static char recalled(String remembered, String token) {
        if (remembered == null || remembered.isEmpty()) return 0;
        String key = token + "=";
        int at = remembered.lastIndexOf(key);
        while (at > 0 && remembered.charAt(at - 1) != ';') at = remembered.lastIndexOf(key, at - 1);
        if (at < 0 || at + key.length() >= remembered.length()) return 0;
        return remembered.charAt(at + key.length());
    }

    /** `remembered` with `token`'s choice set (its older one dropped), capped. */
    static String remember(String remembered, String token, char verdict) {
        StringBuilder out = new StringBuilder();
        int kept = 0;
        String[] parts = remembered == null || remembered.isEmpty() ? new String[0] : remembered.split(";");
        int start = Math.max(0, parts.length - (MAX_REMEMBERED - 1));
        for (int i = start; i < parts.length; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.startsWith(token + "=")) continue;
            if (kept++ > 0) out.append(';');
            out.append(p);
        }
        if (kept > 0) out.append(';');
        return out.append(token).append('=').append(verdict).toString();
    }

    /** The toast on his phone after a tap. */
    static String toast(char verdict, boolean same) {
        if (same) return verdict == 'g' ? "✅ سُجّلت «جيد» من قبل" : "❌ سُجّلت «غير جيد» من قبل - المسؤول يراجعها";
        return verdict == 'g' ? "✅ شكرًا - سُجّلت «جيد»" : "❌ سُجّلت «غير جيد» - أُبلغ المسؤول ليراجعها";
    }

    /** 🚨 To the operator at once on «غير جيد»: who, and the operation as he saw it. */
    static String ownerAlert(String repName, String by, String messageText) {
        String who = repName == null || repName.trim().isEmpty() ? "المندوب" : "المندوب " + repName.trim();
        String presser = by == null || by.trim().isEmpty() || by.trim().equals(repName == null ? "" : repName.trim()) ? "" : " (" + by.trim() + ")";
        String body = messageText == null ? "" : messageText.trim();
        return "🚨 " + who + presser + " ضغط «❌ غير جيد» على عملية - راجعها\n\n" + body;
    }
}
