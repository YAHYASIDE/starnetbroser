package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ⏰ The reminders set in devices' browsers - app-private prefs (a phone convenience, like the codes log). Each:
 * id, accountId, the device's name, when, the note, fired (the notification went out), done («تم» in the app).
 */
final class DeviceReminderStore {

    private static final String PREFS = "starnet_device_reminders";
    private static final String KEY = "list";
    /** Done ones are forgotten after this long. */
    private static final long KEEP_DONE_MS = 7L * 24 * 60 * 60_000L;

    private DeviceReminderStore() {}

    static synchronized List<JSONObject> list(Context context) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(KEY, "[]"));
            for (int i = 0; i < array.length(); i++) out.add(array.getJSONObject(i));
        } catch (JSONException e) {
            // a broken list starts again
        }
        return out;
    }

    static synchronized JSONObject find(Context context, String id) {
        for (JSONObject r : list(context)) if (id != null && id.equals(r.optString("id"))) return r;
        return null;
    }

    static synchronized JSONObject add(Context context, String accountId, String device, long at, String note) {
        JSONObject r = new JSONObject();
        try {
            r.put("id", "rem-" + System.currentTimeMillis() + "-" + (int) (Math.random() * 10000));
            r.put("accountId", accountId == null ? "" : accountId);
            r.put("device", device == null ? "" : device);
            r.put("at", at);
            r.put("note", note == null ? "" : note.trim());
            r.put("createdAt", System.currentTimeMillis());
        } catch (JSONException e) {
            return null;
        }
        List<JSONObject> all = list(context);
        all.add(r);
        save(context, all);
        return r;
    }

    /** Sets a flag (fired / done) on one reminder. */
    static synchronized void mark(Context context, String id, String flag) {
        List<JSONObject> all = list(context);
        long now = System.currentTimeMillis();
        List<JSONObject> kept = new ArrayList<>();
        for (JSONObject r : all) {
            try {
                if (id != null && id.equals(r.optString("id"))) r.put(flag, now);
            } catch (JSONException ignored) {
                // left as it was
            }
            long done = r.optLong("done", 0);
            if (done == 0 || now - done < KEEP_DONE_MS) kept.add(r);
        }
        save(context, kept);
    }

    private static void save(Context context, List<JSONObject> all) {
        JSONArray array = new JSONArray();
        for (JSONObject r : all) array.put(r);
        prefs(context).edit().putString(KEY, array.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
