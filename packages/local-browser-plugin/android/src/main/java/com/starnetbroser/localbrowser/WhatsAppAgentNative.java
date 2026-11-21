package com.starnetbroser.localbrowser;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🤖 «وكيل واتساب» while STAR NET itself is closed (his Nov 21 2026 «التطبيق مغلق لا يجاوب، وهذا غير صحيح»). The app
 * hands the reader a «pack» (apps/web lib/whatsappAgent.ts buildAgentPack): his Claude key, the model, the agent's
 * instructions and answer shape, the business and payment lines, his lessons, each registered customer's facts (by the
 * last 8 digits of his number), the last turns of each chat and the questions still waiting for him. When the app has
 * not said «I'm here» for ALIVE_MS, the reader answers by itself with the same words the app would send - and the app
 * takes what it did into its log / questions / spend when it opens. Pure, no android.* - JUnit: WhatsAppAgentNativeTest.
 */
final class WhatsAppAgentNative {

    private WhatsAppAgentNative() {}

    /** The app answers while it said «I'm here» this recently (its runner says it every 5 s). */
    static final long ALIVE_MS = 20_000L;
    static final int MAX_TURNS = 12;
    static final int SILENT_AFTER = 2;
    static final long SILENT_MS = 24L * 60L * 60L * 1000L;

    static boolean appAlive(long heartbeatAt, long now) {
        return heartbeatAt > 0 && now - heartbeatAt < ALIVE_MS;
    }

    /** Silent with this customer: the questions waiting for him (in the pack) + the ones the reader handed off since. */
    static boolean silenced(int waitingInPack, List<Long> handoffsSince, long now) {
        int n = waitingInPack;
        if (handoffsSince != null) for (Long t : handoffsSince) if (t != null && now - t < SILENT_MS) n++;
        return n >= SILENT_AFTER;
    }

    /** The conversation: the pack's turns for this customer, then the reader's own since, the last MAX_TURNS. */
    static JSONArray chat(JSONObject pack, String key, JSONArray since) {
        JSONArray out = new JSONArray();
        JSONObject chats = pack.optJSONObject("chats");
        JSONArray a = chats == null ? null : chats.optJSONArray(key);
        if (a != null) for (int i = 0; i < a.length(); i++) out.put(a.opt(i));
        if (since != null) for (int i = 0; i < since.length(); i++) out.put(since.opt(i));
        JSONArray last = new JSONArray();
        for (int i = Math.max(0, out.length() - MAX_TURNS); i < out.length(); i++) last.put(out.opt(i));
        return last;
    }

    /** Exactly what the app's agentUserText writes for one message. */
    static String userText(JSONObject pack, String key, String senderName, String message, JSONArray chat, String today) {
        return userText(pack, key, senderName, message, chat, today, "");
    }

    /** `section`: what the customer chose in the menus (WhatsAppMenu topic), "" = none. */
    static String userText(JSONObject pack, String key, String senderName, String message, JSONArray chat, String today, String section) {
        StringBuilder history = new StringBuilder();
        if (chat == null || chat.length() == 0) {
            history.append("(no earlier messages)");
        } else {
            for (int i = 0; i < chat.length(); i++) {
                JSONObject t = chat.optJSONObject(i);
                if (t == null) continue;
                if (history.length() > 0) history.append('\n');
                history.append("customer".equals(t.optString("from")) ? "Customer: " : "STAR NET: ").append(t.optString("text"));
            }
        }
        JSONObject facts = pack.optJSONObject("facts");
        String known = facts == null ? "" : facts.optString(key, "");
        String lessons = pack.optString("lessons", "");
        String catalog = pack.optString("catalog", "");
        StringBuilder sb = new StringBuilder();
        sb.append("Business: ").append(pack.optString("business", "")).append("\n\n");
        sb.append("How to pay:\n").append(pack.optString("payment", "")).append("\n\n");
        sb.append(known.isEmpty() ? "Unknown sender (not a registered customer). WhatsApp name: " + (senderName == null || senderName.isEmpty() ? "-" : senderName) : known).append("\n\n");
        if (!lessons.isEmpty()) sb.append("Owner's lessons:\n").append(lessons).append("\n\n");
        if (!catalog.isEmpty()) sb.append(catalog).append("\n\n");
        String menu = pack.optString("menu", "");
        if (!menu.isEmpty()) sb.append("Owner's menu:\n").append(menu).append("\n\n");
        sb.append("Today: ").append(today).append("\n\n");
        sb.append("Conversation so far:\n").append(history).append("\n\n");
        if (section != null && !section.isEmpty()) sb.append("Customer chose in the menu: ").append(section).append("\n\n");
        sb.append("Customer's newest message:\n").append(message);
        return sb.toString();
    }

    /** The Messages API request body: the pack's model, instructions and answer shape, low effort. */
    static JSONObject requestBody(JSONObject pack, String user) throws JSONException {
        JSONObject body = new JSONObject();
        body.put("model", pack.optString("model", "claude-haiku-5-5"));
        body.put("max_tokens", 4000);
        body.put("system", pack.optString("system", ""));
        JSONArray messages = new JSONArray();
        messages.put(new JSONObject().put("role", "user").put("content", user));
        body.put("messages", messages);
        JSONObject format = new JSONObject().put("type", "json_schema").put("schema", pack.optJSONObject("schema") == null ? new JSONObject() : pack.optJSONObject("schema"));
        body.put("output_config", new JSONObject().put("effort", "low").put("format", format));
        return body;
    }

    /** One answer: reply / handoff / reason and the tokens, or `error` (in his words). */
    static final class Answer {
        String reply = "";
        boolean handoff;
        String reason = "";
        int input;
        int output;
        String error;
    }

    /** The API's response (its HTTP status and body) → the agent's answer. */
    static Answer parse(int status, String body) {
        Answer a = new Answer();
        try {
            JSONObject r = new JSONObject(body == null ? "{}" : body);
            if (status == 401) {
                a.error = "مفتاح Claude غير صحيح";
                return a;
            }
            if (status == 429) {
                a.error = "طلبات كثيرة - انتظر دقيقة";
                return a;
            }
            if (status < 200 || status >= 300) {
                JSONObject err = r.optJSONObject("error");
                String m = err == null ? "" : err.optString("message", "");
                a.error = m.toLowerCase(java.util.Locale.ROOT).matches(".*(credit|balance|billing).*") ? "رصيد حساب Claude انتهى" : "خطأ من Claude (" + status + ")";
                return a;
            }
            String stop = r.optString("stop_reason", "");
            if ("refusal".equals(stop)) {
                a.error = "رفض Claude هذا الطلب";
                return a;
            }
            JSONObject usage = r.optJSONObject("usage");
            if (usage != null) {
                a.input = usage.optInt("input_tokens", 0);
                a.output = usage.optInt("output_tokens", 0);
            }
            JSONArray content = r.optJSONArray("content");
            String text = null;
            if (content != null) for (int i = 0; i < content.length(); i++) {
                JSONObject b = content.optJSONObject(i);
                if (b != null && "text".equals(b.optString("type"))) text = b.optString("text");
            }
            if (text == null) {
                a.error = "جواب غير مفهوم من Claude";
                return a;
            }
            JSONObject v = new JSONObject(text);
            a.reply = v.optString("reply", "").trim();
            a.handoff = v.optBoolean("handoff", false);
            a.reason = v.optString("reason", "");
            if (a.reply.isEmpty()) a.error = "جواب فارغ من Claude";
        } catch (JSONException e) {
            a.error = "جواب غير مفهوم من Claude";
        }
        return a;
    }

    /** The owner's notification when the agent hands a customer to him (the app's handoffNotice words). */
    static String handoffNotice(String name, String phone, String message, String reason) {
        String m = message == null ? "" : message.length() > 160 ? message.substring(0, 160) : message;
        return "🤖 زبون يحتاجك على واتساب\n" + (name == null ? "" : name) + (phone == null || phone.isEmpty() ? "" : " (" + phone + ")") + ": «" + m + "»" + (reason == null || reason.isEmpty() ? "" : "\nالسبب: " + reason);
    }
}
