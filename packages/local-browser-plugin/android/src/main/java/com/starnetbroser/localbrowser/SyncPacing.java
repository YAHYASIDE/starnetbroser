package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Random;

/**
 * Keeps the background sync polite to Starlink. Every account is opened from the same phone (one
 * IP), and Starlink's CDN answers a burst of page loads with "Error 429 Too many requests" - so:
 *  - accounts are opened one at a time with a pause between them (gapMs);
 *  - a run stops starting new accounts once it has used its time budget (SyncPriority decides
 *    which devices go first, so the most urgent ones are never the ones left out);
 *  - a 429 anywhere (background run or the visible browser) pauses all background syncing for
 *    COOLDOWN_MS (inCooldown);
 *  - 🌙 the background «مزامنة الآن» (BackgroundSyncService) and the visible chain of device browsers
 *    also pause between devices (chainGapMs) and stop at once on a 429 (his Oct 17 2026 report: the
 *    raw «Error 429 Too many requests» page on a device after a run over several devices).
 * The decisions are pure static methods (unit-tested); the two small persisted values live in
 * SharedPreferences.
 */
final class SyncPacing {

    static final long GAP_BASE_MS = 15_000;
    static final long GAP_JITTER_MS = 10_000;
    static final long COOLDOWN_MS = 20 * 60_000;
    /** WorkManager stops a worker after 10 minutes - leave room for the account in progress. */
    static final long RUN_BUDGET_MS = 8 * 60_000;

    private static final String PREFS = "starnet_sync_pacing";
    private static final String KEY_RATE_LIMITED_AT = "rateLimitedAt";
    private static final String KEY_ENABLED = "autoSyncOff";
    private static final String KEY_LIST_PUSHED_AT = "listPushedAt";

    private SyncPacing() {
    }

    /** Pause before the next account: 15-25 seconds, so the loads never line up in a burst. */
    static long gapMs(Random random) {
        return GAP_BASE_MS + (long) (random.nextDouble() * GAP_JITTER_MS);
    }

    static final long CHAIN_GAP_BASE_MS = 10_000;
    static final long CHAIN_GAP_JITTER_MS = 6_000;

    /** Pause between two devices of a run the operator started (10-16 s): shorter than the
     * background worker's, he is waiting for it - but never a burst. */
    static long chainGapMs(Random random) {
        return CHAIN_GAP_BASE_MS + (long) (random.nextDouble() * CHAIN_GAP_JITTER_MS);
    }

    /** Whole minutes until the cooldown ends (at least 1 while it lasts), 0 when not in one. */
    static int cooldownMinutesLeft(long rateLimitedAt, long now) {
        if (!inCooldown(rateLimitedAt, now)) return 0;
        long left = COOLDOWN_MS - (now - rateLimitedAt);
        return (int) Math.max(1, (left + 59_999) / 60_000);
    }

    static boolean inCooldown(long rateLimitedAt, long now) {
        return rateLimitedAt > 0 && now >= rateLimitedAt && now - rateLimitedAt < COOLDOWN_MS;
    }

    static boolean hasTimeForAnother(long startedAt, long now) {
        return now - startedAt < RUN_BUDGET_MS;
    }

    // ---- persisted state ----

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void recordRateLimited(Context context, long now) {
        prefs(context).edit().putLong(KEY_RATE_LIMITED_AT, now).apply();
    }

    static long rateLimitedAt(Context context) {
        return prefs(context).getLong(KEY_RATE_LIMITED_AT, 0);
    }

    /** المزامنة التلقائية (الإعدادات) - on unless turned off. */
    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putLong(KEY_ENABLED, enabled ? 0 : 1).apply();
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getLong(KEY_ENABLED, 0) == 0;
    }

    /** When the app last sent the device list (with its own dates/statuses) - a status the sync
     * read after this is newer than the app's. */
    static void recordListPushed(Context context, long now) {
        prefs(context).edit().putLong(KEY_LIST_PUSHED_AT, now).apply();
    }

    static long listPushedAt(Context context) {
        return prefs(context).getLong(KEY_LIST_PUSHED_AT, 0);
    }
}
