package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;

/**
 * 🧭 What a 🌙 background sync read on each page (his Oct 18 2026 report: «التحديث في الخلفية لا يحدث
 * نفس التحديث الطبيعي - لا يتغير شيء، بطيء، الطبق رمادي»): one short Arabic line per device, kept
 * with its outcome (AutoSyncResults) and shown in the app's sync-line details, so the page that
 * fails in the hidden window is known instead of guessed. Pure (no android.*).
 *
 * «⏳ دخول 4ث · الاشتراكات ✓ 1.2ث · الأجهزة ⚪ 7ث · الفوترة ✗ 9ث · الرئيسية ✓ 3.6ث»
 * ✓ read and complete · ⚪ read but what it waited for never came (gray dots, no renewal day) ·
 * ✗ nothing read at all.
 */
final class SyncTrace {

    private final List<String> parts = new ArrayList<>();

    /** How long the sign-in check took before the walk started. */
    void signedIn(long ms) {
        parts.add("⏳ دخول " + seconds(ms));
    }

    /** One page's settled read: `read` = something was saved, `complete` = what it waited for came. */
    void page(String label, boolean read, boolean complete, long ms) {
        String mark = !read ? "✗" : complete ? "✓" : "⚪";
        parts.add(label + " " + mark + " " + seconds(ms));
    }

    /** The run stopped in the middle (stuck, page left Starlink...). */
    void stopped(String why) {
        parts.add("⛔ " + why);
    }

    String text() {
        return String.join(" · ", parts);
    }

    static String seconds(long ms) {
        long tenths = Math.max(0, Math.round(ms / 100.0));
        return (tenths % 10 == 0 ? String.valueOf(tenths / 10) : (tenths / 10) + "." + (tenths % 10)) + "ث";
    }
}
