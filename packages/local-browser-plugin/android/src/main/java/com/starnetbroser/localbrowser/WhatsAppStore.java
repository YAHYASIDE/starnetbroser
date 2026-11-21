package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 💬 What the WhatsApp reader keeps on this phone (WhatsAppMessage): the messages with an email, waiting for the app
 * to make devices of them (then acked); each registered customer's ready answer and the on/off switch (set by the app,
 * apps/web lib/whatsappDesk.ts); when each customer was last answered; the last answers sent (for «💬 واتساب» in the
 * app). Nothing is logged.
 */
final class WhatsAppStore {

    private WhatsAppStore() {}

    private static final String PREFS = "starnet_whatsapp";
    private static final int MAX_PENDING = 300;
    private static final int MAX_LOG = 60;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray array(Context context, String key) {
        try {
            return new JSONArray(prefs(context).getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static JSONArray last(JSONArray all, int max) {
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, all.length() - max); i < all.length(); i++) kept.put(all.opt(i));
        return kept;
    }

    /** [{"id","phone","name","text","at"}], oldest first. */
    static synchronized JSONArray pending(Context context) {
        return array(context, "pending");
    }

    static synchronized void addMessage(Context context, String id, String phone, String name, String text, long at) {
        JSONArray all = pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && id.equals(m.optString("id"))) return;
        }
        try {
            JSONObject m = new JSONObject();
            m.put("id", id);
            if (phone != null) m.put("phone", phone);
            m.put("name", name == null ? "" : name);
            m.put("text", text == null ? "" : text);
            m.put("at", at);
            all.put(m);
        } catch (JSONException e) {
            return;
        }
        prefs(context).edit().putString("pending", last(all, MAX_PENDING).toString()).commit();
    }

    static synchronized void ack(Context context, Set<String> ids) {
        JSONArray kept = new JSONArray();
        JSONArray all = pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && !ids.contains(m.optString("id"))) kept.put(m);
        }
        prefs(context).edit().putString("pending", kept.toString()).commit();
    }

    /** The app's answers ({"20000001": "مرحبًا …"}) and whether answering is on. */
    static synchronized void setup(Context context, String answersJson, boolean enabled) {
        SharedPreferences.Editor e = prefs(context).edit().putBoolean("enabled", enabled);
        if (answersJson != null) e.putString("answers", answersJson);
        e.apply();
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean("enabled", false);
    }

    /** The ready answer of the customer with this key (last 8 digits), or null. */
    static String answerFor(Context context, String key) {
        if (key == null) return null;
        try {
            String text = new JSONObject(prefs(context).getString("answers", "{}")).optString(key, "");
            return text.isEmpty() ? null : text;
        } catch (JSONException e) {
            return null;
        }
    }

    static long lastAnsweredAt(Context context, String key) {
        return prefs(context).getLong("answered_" + key, 0L);
    }

    /** An answer went out: remembered (the 30-minute gap) and shown in the app's list. */
    static synchronized void noteAnswered(Context context, String key, String name, String question, long at) {
        JSONArray log = array(context, "log");
        try {
            JSONObject m = new JSONObject();
            m.put("name", name == null ? "" : name);
            m.put("question", question == null ? "" : question);
            m.put("at", at);
            log.put(m);
        } catch (JSONException ignored) {
            // the answer still went out
        }
        prefs(context).edit().putLong("answered_" + key, at).putString("log", last(log, MAX_LOG).toString()).apply();
    }

    /** The last answers sent, oldest first. */
    static synchronized JSONArray log(Context context) {
        return array(context, "log");
    }

    // ---- 🤖 «وكيل واتساب» (WhatsAppAgentRules): his settings, the messages waiting for an answer, the answers sent ----

    /** On / everyone, his test numbers and the reps' numbers (last 8 digits each). Set by the app. */
    static synchronized void agentSetup(Context context, boolean on, boolean everyone, String numbersJson, String repKeysJson) {
        SharedPreferences.Editor e = prefs(context).edit().putBoolean("agent_on", on).putBoolean("agent_all", everyone);
        if (numbersJson != null) e.putString("agent_numbers", numbersJson);
        if (repKeysJson != null) e.putString("agent_reps", repKeysJson);
        e.apply();
    }

    private static java.util.List<String> list(Context context, String key) {
        java.util.List<String> out = new java.util.ArrayList<>();
        JSONArray a = array(context, key);
        for (int i = 0; i < a.length(); i++) {
            String v = a.optString(i, "");
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }

    /** Whether the agent answers this number now. */
    static boolean agentAnswers(Context context, String key) {
        SharedPreferences p = prefs(context);
        return WhatsAppAgentRules.answers(key, p.getBoolean("agent_on", false), p.getBoolean("agent_all", false), list(context, "agent_numbers"), list(context, "agent_reps"));
    }

    /** 🔍 Why the agent would take / leave a message from `key` (WhatsAppAgentRules.reason) with his current settings. */
    static String agentReason(Context context, String key, boolean savedName) {
        SharedPreferences p = prefs(context);
        return WhatsAppAgentRules.reason(key, savedName, p.getBoolean("agent_on", false), p.getBoolean("agent_all", false), list(context, "agent_numbers"), list(context, "agent_reps"));
    }

    /** Whether `key` is one of his test numbers. */
    static boolean agentIsTest(Context context, String key) {
        return key != null && list(context, "agent_numbers").contains(key);
    }

    /** 🔍 The last WhatsApp message the reader saw (phone only, never in a backup): for the agent section's line. */
    static synchronized void agentNoteSeen(Context context, JSONObject seen) {
        prefs(context).edit().putString("agent_last_seen", seen.toString()).apply();
    }

    static synchronized JSONObject agentLastSeen(Context context) {
        String raw = prefs(context).getString("agent_last_seen", null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    /** [{"id","phone","key","name","text","at"}], oldest first - for the app to answer. */
    static synchronized JSONArray agentInbox(Context context) {
        return array(context, "agent_inbox");
    }

    static synchronized void agentAdd(Context context, String id, String phone, String key, String name, String text, long at) {
        JSONArray all = agentInbox(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && id.equals(m.optString("id"))) return;
        }
        try {
            JSONObject m = new JSONObject();
            m.put("id", id);
            if (phone != null) m.put("phone", phone);
            m.put("key", key);
            m.put("name", name == null ? "" : name);
            m.put("text", text == null ? "" : text);
            m.put("at", at);
            all.put(m);
        } catch (JSONException e) {
            return;
        }
        prefs(context).edit().putString("agent_inbox", last(all, 100).toString()).commit();
    }

    static synchronized void agentAck(Context context, Set<String> ids) {
        JSONArray kept = new JSONArray();
        JSONArray all = agentInbox(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && !ids.contains(m.optString("id"))) kept.put(m);
        }
        prefs(context).edit().putString("agent_inbox", kept.toString()).commit();
    }

    /** When this number was answered by the agent (ms) - the hourly limit. */
    static synchronized java.util.List<Long> agentSentAt(Context context, String key) {
        java.util.List<Long> out = new java.util.ArrayList<>();
        JSONArray a = array(context, "agent_sent_" + key);
        for (int i = 0; i < a.length(); i++) out.add(a.optLong(i, 0L));
        return out;
    }

    static synchronized void agentNoteSent(Context context, String key, long at) {
        JSONArray a = array(context, "agent_sent_" + key);
        a.put(at);
        prefs(context).edit().putString("agent_sent_" + key, last(a, WhatsAppAgentRules.MAX_PER_HOUR).toString()).apply();
    }
}
