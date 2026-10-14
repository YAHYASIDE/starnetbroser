package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 📶 in the reps bot: the dish / Wi-Fi reading of a device's own refresh, kept per device so
 * TelegramReplyService can answer with it - and only with a reading made after the rep asked.
 * AutoSyncWorker records every single-device run here, "" for a dot it couldn't read (a failed
 * run records both empty, so the rep hears at once instead of waiting out the timeout).
 */
final class LiveCheckStore {

    private static final String PREFS = "starnet_live_check";

    private LiveCheckStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void put(Context context, String accountId, long at, String dish, String wifi) {
        prefs(context).edit().putString(accountId, encode(at, dish, wifi)).commit();
    }

    /** {dish, wifi} of a run finished at or after `since`, or null when there's none yet. */
    static String[] since(Context context, String accountId, long since) {
        return decodeSince(prefs(context).getString(accountId, null), since);
    }

    static String encode(long at, String dish, String wifi) {
        return at + "\n" + (dish == null ? "" : dish) + "\n" + (wifi == null ? "" : wifi);
    }

    static String[] decodeSince(String raw, long since) {
        if (raw == null) return null;
        String[] parts = raw.split("\n", -1);
        if (parts.length < 3) return null;
        try {
            if (Long.parseLong(parts[0]) < since) return null;
        } catch (NumberFormatException broken) {
            return null;
        }
        return new String[] {parts[1], parts[2]};
    }
}
