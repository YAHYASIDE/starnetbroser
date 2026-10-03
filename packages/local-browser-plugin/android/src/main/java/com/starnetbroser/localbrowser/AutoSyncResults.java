package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🔄 How each auto-sync ended («تحديث من Starlink» / «مزامنة الآن»): kept until the app takes them
 * (takeAutoSyncResults) to tell the operator, per device, what was done and what wasn't - "ok",
 * "nothing" (nothing read), "saveFailed", "signedOut" (not signed in to Starlink - skipped at once),
 * "stuck" (no end within the time limit - skipped), "closed" (closed by hand).
 */
final class AutoSyncResults {

    private static final String PREFS = "starnet_auto_sync_results";
    private static final String KEY = "results";
    /** Never grows without bound if the app doesn't come back for a long time. */
    private static final int MAX = 300;

    private AutoSyncResults() {}

    static synchronized void record(Context context, String accountId, String outcome) {
        if (accountId == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list = parse(prefs.getString(KEY, "[]"));
        try {
            JSONObject entry = new JSONObject();
            entry.put("accountId", accountId);
            entry.put("outcome", outcome);
            entry.put("at", System.currentTimeMillis());
            list.put(entry);
        } catch (JSONException e) {
            return;
        }
        while (list.length() > MAX) list.remove(0);
        prefs.edit().putString(KEY, list.toString()).commit();
    }

    /** Every recorded result, oldest first - and forgets them. */
    static synchronized JSONArray take(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list = parse(prefs.getString(KEY, "[]"));
        prefs.edit().remove(KEY).commit();
        return list;
    }

    private static JSONArray parse(String raw) {
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
