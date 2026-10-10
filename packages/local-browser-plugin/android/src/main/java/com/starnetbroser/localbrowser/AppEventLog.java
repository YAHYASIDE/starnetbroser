package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🔔 Every app event (AppEventNotifier) kept on disk the moment it happens - even while the app is
 * closed or notifications are off - until the app copies it into its own 🔔 list and acks it here.
 * The operator's rule (Oct 2026): a notification is never lost.
 */
final class AppEventLog {

    private AppEventLog() {}

    private static final String PREFS = "starnet_app_event_log";
    private static final String KEY = "pending";
    private static final int MAX = 300;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** [{"id","text","route","at"}], oldest first. */
    static synchronized JSONArray pending(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void add(Context context, String text, String route, long at) {
        JSONArray all = pending(context);
        try {
            JSONObject event = new JSONObject();
            event.put("id", "ev-" + at + "-" + all.length());
            event.put("text", text);
            event.put("route", route);
            event.put("at", at);
            all.put(event);
        } catch (JSONException e) {
            return;
        }
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, all.length() - MAX); i < all.length(); i++) kept.put(all.opt(i));
        prefs(context).edit().putString(KEY, kept.toString()).commit();
    }

    /** The app saved these in its 🔔 list - drop them here. */
    static synchronized void ack(Context context, Set<String> ids) {
        JSONArray kept = new JSONArray();
        JSONArray all = pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject event = all.optJSONObject(i);
            if (event != null && !ids.contains(event.optString("id"))) kept.put(event);
        }
        prefs(context).edit().putString(KEY, kept.toString()).commit();
    }
}
