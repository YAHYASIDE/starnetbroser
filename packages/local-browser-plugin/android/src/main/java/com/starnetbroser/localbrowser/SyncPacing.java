package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Keeps the background sync polite to Starlink. Every account is opened from the same phone (one
 * IP), and Starlink's CDN answers a burst of page loads with "Error 429 Too many requests" - so:
 *  - accounts are opened one at a time with a pause between them (gapMs);
 *  - a run stops starting new accounts once it has used its time budget, and the next run
 *    continues where it stopped (rotate) instead of starting over from the first account;
 *  - a 429 anywhere (background run or the visible browser) pauses all background syncing for
 *    COOLDOWN_MS (inCooldown).
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
    private static final String KEY_CURSOR = "lastAccountId";
    private static final String KEY_INTERVAL_HOURS = "intervalHours";

    /** How often the background sync runs - chosen in الإعدادات. 0 = off. */
    static final int DEFAULT_INTERVAL_HOURS = 2;
    static final int[] ALLOWED_INTERVAL_HOURS = {0, 1, 2, 3, 6, 12};

    private SyncPacing() {
    }

    /** Pause before the next account: 15-25 seconds, so the loads never line up in a burst. */
    static long gapMs(Random random) {
        return GAP_BASE_MS + (long) (random.nextDouble() * GAP_JITTER_MS);
    }

    static boolean inCooldown(long rateLimitedAt, long now) {
        return rateLimitedAt > 0 && now >= rateLimitedAt && now - rateLimitedAt < COOLDOWN_MS;
    }

    static boolean hasTimeForAnother(long startedAt, long now) {
        return now - startedAt < RUN_BUDGET_MS;
    }

    /** The accounts in round-robin order: starting right after the last one synced, wrapping
     * around. Unknown or missing cursor = the stored order. */
    static <T> List<T> rotate(List<T> items, List<String> ids, String lastId) {
        int start = lastId == null ? 0 : ids.indexOf(lastId) + 1;
        if (start <= 0 || start >= items.size()) return new ArrayList<>(items);
        List<T> result = new ArrayList<>(items.subList(start, items.size()));
        result.addAll(items.subList(0, start));
        return result;
    }

    /** Any value that isn't one of the offered choices falls back to the default. */
    static int normalizeIntervalHours(int hours) {
        for (int allowed : ALLOWED_INTERVAL_HOURS) {
            if (allowed == hours) return hours;
        }
        return DEFAULT_INTERVAL_HOURS;
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

    static void saveCursor(Context context, String accountId) {
        prefs(context).edit().putString(KEY_CURSOR, accountId).apply();
    }

    static String loadCursor(Context context) {
        return prefs(context).getString(KEY_CURSOR, null);
    }

    static void saveIntervalHours(Context context, int hours) {
        prefs(context).edit().putLong(KEY_INTERVAL_HOURS, normalizeIntervalHours(hours)).apply();
    }

    static int intervalHours(Context context) {
        return normalizeIntervalHours((int) prefs(context).getLong(KEY_INTERVAL_HOURS, DEFAULT_INTERVAL_HOURS));
    }
}
