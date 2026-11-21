package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Fake numbers, names and keys only. */
public class WhatsAppAgentNativeTest {

    private static JSONObject pack() throws Exception {
        return new JSONObject()
            .put("model", "claude-haiku-5-5")
            .put("system", "SYSTEM")
            .put("schema", new JSONObject().put("type", "object"))
            .put("business", "STAR NET")
            .put("payment", "• BANKILY : 0000")
            .put("lessons", "- Q: كم\n  A: 20,000")
            .put("facts", new JSONObject().put("70000001", "Known customer: زبون"))
            .put("chats", new JSONObject().put("70000001", new JSONArray()
                .put(new JSONObject().put("from", "customer").put("text", "السلام").put("at", 1))
                .put(new JSONObject().put("from", "agent").put("text", "مرحبا").put("at", 2))));
    }

    @Test
    public void theAppAnswersWhileItIsAlive() {
        assertTrue(WhatsAppAgentNative.appAlive(1000, 1000 + 5_000));
        assertFalse(WhatsAppAgentNative.appAlive(1000, 1000 + 30_000));
        assertFalse(WhatsAppAgentNative.appAlive(0, 5_000));
    }

    @Test
    public void silentAfterTwoWaiting() {
        long now = 100L * 24 * 3600 * 1000;
        assertFalse(WhatsAppAgentNative.silenced(1, null, now));
        assertTrue(WhatsAppAgentNative.silenced(2, null, now));
        assertTrue(WhatsAppAgentNative.silenced(1, Arrays.asList(now - 60_000L), now));
        assertFalse(WhatsAppAgentNative.silenced(1, Arrays.asList(now - 25L * 3600 * 1000), now));
    }

    @Test
    public void theSameTextAsTheApp() throws Exception {
        JSONObject p = pack();
        JSONArray chat = WhatsAppAgentNative.chat(p, "70000001", new JSONArray().put(new JSONObject().put("from", "customer").put("text", "متى؟")));
        assertEquals(3, chat.length());
        String text = WhatsAppAgentNative.userText(p, "70000001", "", "كم السعر؟", chat, "2026-11-21");
        assertEquals(
            "Business: STAR NET\n\nHow to pay:\n• BANKILY : 0000\n\nKnown customer: زبون\n\nOwner's lessons:\n- Q: كم\n  A: 20,000\n\nToday: 2026-11-21\n\n"
                + "Conversation so far:\nCustomer: السلام\nSTAR NET: مرحبا\nCustomer: متى؟\n\nCustomer's newest message:\nكم السعر؟",
            text);
        String unknown = WhatsAppAgentNative.userText(p, "70000009", "أحمد", "سلام", new JSONArray(), "2026-11-21");
        assertTrue(unknown.contains("Unknown sender (not a registered customer). WhatsApp name: أحمد"));
        assertTrue(unknown.contains("(no earlier messages)"));
        JSONObject body = WhatsAppAgentNative.requestBody(p, text);
        assertEquals("claude-haiku-5-5", body.getString("model"));
        assertEquals("low", body.getJSONObject("output_config").getString("effort"));
        assertEquals("json_schema", body.getJSONObject("output_config").getJSONObject("format").getString("type"));
    }

    @Test
    public void readsTheAnswerOrSaysWhy() {
        String ok = "{\"stop_reason\":\"end_turn\",\"usage\":{\"input_tokens\":3000,\"output_tokens\":120},"
            + "\"content\":[{\"type\":\"text\",\"text\":\"{\\\"reply\\\":\\\"مرحبا\\\",\\\"handoff\\\":false,\\\"reason\\\":\\\"\\\"}\"}]}";
        WhatsAppAgentNative.Answer a = WhatsAppAgentNative.parse(200, ok);
        assertNull(a.error);
        assertEquals("مرحبا", a.reply);
        assertEquals(3000, a.input);
        assertEquals("مفتاح Claude غير صحيح", WhatsAppAgentNative.parse(401, "{}").error);
        assertEquals("رصيد حساب Claude انتهى", WhatsAppAgentNative.parse(400, "{\"error\":{\"message\":\"Your credit balance is too low\"}}").error);
        assertEquals("رفض Claude هذا الطلب", WhatsAppAgentNative.parse(200, "{\"stop_reason\":\"refusal\"}").error);
        assertEquals("جواب غير مفهوم من Claude", WhatsAppAgentNative.parse(200, "not json").error);
        assertTrue(WhatsAppAgentNative.handoffNotice("أحمد", "22270000001", "دفعت", "يقول إنه دفع").endsWith("السبب: يقول إنه دفع"));
    }
}
