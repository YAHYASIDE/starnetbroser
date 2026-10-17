package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ⏰ «مزامنات مجدولة» on the phone: his choices (pushed by the app's settings), the devices left
 * for the 🔁 retry after a 429, and today's log of every sync's end for the 🌙 night summary.
 */
final class ScheduledSyncStore {

    private static final String PREFS = "starnet_scheduled_syncs";
    private static final String KEY_MORNING = "morning";
    private static final String KEY_MORNING_HOUR = "morningHour";
    private static final String KEY_PAYMENT = "payment";
    private static final String KEY_RETRY = "retry";
    private static final String KEY_NIGHT = "night";
    private static final String KEY_NIGHT_HOUR = "nightHour";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_RETRIES = "retries";
    private static final String KEY_DAY_LOG = "dayLog";
    private static final int MAX_LOG = 500;

    static final int DEFAULT_MORNING_HOUR = 8;
    static final int DEFAULT_NIGHT_HOUR = 23;

    /** The run modes a pending device keeps (BackgroundSyncService). */
    static final String MODE_SYNC = "sync";
    static final String MODE_TRAVEL = "travel";
    static final String MODE_PAYMENT = "payment";

    private ScheduledSyncStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- his choices ----

    static void save(Context context, boolean morning, int morningHour, boolean payment, boolean retry, boolean night, int nightHour) {
        prefs(context).edit()
            .putBoolean(KEY_MORNING, morning)
            .putInt(KEY_MORNING_HOUR, clampHour(morningHour, DEFAULT_MORNING_HOUR))
            .putBoolean(KEY_PAYMENT, payment)
            .putBoolean(KEY_RETRY, retry)
            .putBoolean(KEY_NIGHT, night)
            .putInt(KEY_NIGHT_HOUR, clampHour(nightHour, DEFAULT_NIGHT_HOUR))
            .apply();
    }

    private static int clampHour(int hour, int fallback) {
        return hour >= 0 && hour <= 23 ? hour : fallback;
    }

    static boolean morning(Context context) {
        return prefs(context).getBoolean(KEY_MORNING, false);
    }

    static int morningHour(Context context) {
        return prefs(context).getInt(KEY_MORNING_HOUR, DEFAULT_MORNING_HOUR);
    }

    static boolean payment(Context context) {
        return prefs(context).getBoolean(KEY_PAYMENT, false);
    }

    static boolean retry(Context context) {
        return prefs(context).getBoolean(KEY_RETRY, false);
    }

    static boolean night(Context context) {
        return prefs(context).getBoolean(KEY_NIGHT, false);
    }

    static int nightHour(Context context) {
        return prefs(context).getInt(KEY_NIGHT_HOUR, DEFAULT_NIGHT_HOUR);
    }

    // ---- 🔁 the devices a 429 left ----

    static final class Pending {
        final String accountId;
        final String accountName;
        final String mode;
        final String label;

        Pending(String accountId, String accountName, String mode, String label) {
            this.accountId = accountId;
            this.accountName = accountName != null ? accountName : "";
            this.mode = mode != null ? mode : MODE_SYNC;
            this.label = label != null ? label : "";
        }
    }

    /** Adds to what's already waiting (a device once per mode). */
    static synchronized void addPending(Context context, List<Pending> more) {
        List<Pending> all = loadPending(context);
        for (Pending item : more) {
            boolean known = false;
            for (Pending existing : all) {
                if (existing.accountId.equals(item.accountId) && existing.mode.equals(item.mode)) known = true;
            }
            if (!known) all.add(item);
        }
        JSONArray array = new JSONArray();
        try {
            for (Pending item : all) {
                array.put(new JSONObject().put("id", item.accountId).put("name", item.accountName).put("mode", item.mode).put("label", item.label));
            }
        } catch (JSONException e) {
            return;
        }
        prefs(context).edit().putString(KEY_PENDING, array.toString()).apply();
    }

    static synchronized List<Pending> loadPending(Context context) {
        List<Pending> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(KEY_PENDING, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null || obj.optString("id", "").isEmpty()) continue;
                list.add(new Pending(obj.optString("id"), obj.optString("name", ""), obj.optString("mode", MODE_SYNC), obj.optString("label", "")));
            }
        } catch (JSONException ignored) {
            // nothing waiting
        }
        return list;
    }

    /** What's waiting, once - then forgotten. */
    static synchronized List<Pending> takePending(Context context) {
        List<Pending> list = loadPending(context);
        prefs(context).edit().remove(KEY_PENDING).apply();
        return list;
    }

    static int retries(Context context) {
        return prefs(context).getInt(KEY_RETRIES, 0);
    }

    static void setRetries(Context context, int retries) {
        prefs(context).edit().putInt(KEY_RETRIES, retries).apply();
    }

    // ---- 🌙 today's log ----

    static String today() {
        Calendar now = Calendar.getInstance();
        return now.get(Calendar.YEAR) + "-" + (now.get(Calendar.MONTH) + 1) + "-" + now.get(Calendar.DAY_OF_MONTH);
    }

    /** Every sync's end (AutoSyncResults.record), only today's kept. */
    static synchronized void log(Context context, String accountId, String outcome) {
        String day = today();
        JSONArray kept = new JSONArray();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(KEY_DAY_LOG, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj != null && day.equals(obj.optString("day"))) kept.put(obj);
            }
            kept.put(new JSONObject().put("day", day).put("id", accountId).put("outcome", outcome));
        } catch (JSONException e) {
            return;
        }
        while (kept.length() > MAX_LOG) kept.remove(0);
        prefs(context).edit().putString(KEY_DAY_LOG, kept.toString()).apply();
    }

    /** Today's log as [accountId, outcome] pairs, oldest first. */
    static synchronized List<String[]> todaysLog(Context context) {
        String day = today();
        List<String[]> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(KEY_DAY_LOG, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj != null && day.equals(obj.optString("day"))) list.add(new String[] {obj.optString("id"), obj.optString("outcome")});
            }
        } catch (JSONException ignored) {
            // empty day
        }
        return list;
    }
}
