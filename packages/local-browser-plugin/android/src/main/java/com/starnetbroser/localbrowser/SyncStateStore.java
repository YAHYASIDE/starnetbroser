package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What the background sync last learned about each device, kept natively so priorities stay right
 * while the app is closed: when it was last visited, and the service status / renewal date the
 * Starlink page showed then. Stored one device per line ("id \t visitedAt \t status \t renewal"),
 * a format simple enough to test without Android or org.json (SyncStateStoreTest).
 */
final class SyncStateStore {

    static final class State {
        final long visitedAt;
        final String serviceStatus;
        final String renewalDate;

        State(long visitedAt, String serviceStatus, String renewalDate) {
            this.visitedAt = visitedAt;
            this.serviceStatus = serviceStatus;
            this.renewalDate = renewalDate;
        }
    }

    private static final String PREFS = "starnet_sync_state";
    private static final String KEY_STATES = "states";

    private SyncStateStore() {
    }

    private static String clean(String value) {
        return value == null ? "" : value.replace('\t', ' ').replace('\n', ' ').trim();
    }

    static String encode(Map<String, State> states) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, State> e : states.entrySet()) {
            State s = e.getValue();
            out.append(clean(e.getKey())).append('\t')
                .append(s.visitedAt).append('\t')
                .append(clean(s.serviceStatus)).append('\t')
                .append(clean(s.renewalDate)).append('\n');
        }
        return out.toString();
    }

    /** Never throws - an unreadable line is skipped, never a crash. */
    static Map<String, State> decode(String raw) {
        Map<String, State> states = new LinkedHashMap<>();
        if (raw == null) return states;
        for (String line : raw.split("\n")) {
            String[] parts = line.split("\t", -1);
            if (parts.length < 4 || parts[0].isEmpty()) continue;
            try {
                long at = Long.parseLong(parts[1]);
                states.put(parts[0], new State(at, parts[2].isEmpty() ? null : parts[2], parts[3].isEmpty() ? null : parts[3]));
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return states;
    }

    /** After a visit: the page's values replace the old ones only when the page actually showed
     * them (an empty read keeps what was known). */
    static State afterVisit(State previous, long now, String pageStatus, String pageRenewal) {
        String status = pageStatus != null && !pageStatus.isEmpty() ? pageStatus : previous != null ? previous.serviceStatus : null;
        String renewal = pageRenewal != null && !pageRenewal.isEmpty() ? pageRenewal : previous != null ? previous.renewalDate : null;
        return new State(now, status, renewal);
    }

    // ---- persisted ----

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized Map<String, State> load(Context context) {
        return decode(prefs(context).getString(KEY_STATES, null));
    }

    static synchronized void put(Context context, String accountId, State state) {
        Map<String, State> states = load(context);
        states.put(accountId, state);
        prefs(context).edit().putString(KEY_STATES, encode(states)).apply();
    }
}
