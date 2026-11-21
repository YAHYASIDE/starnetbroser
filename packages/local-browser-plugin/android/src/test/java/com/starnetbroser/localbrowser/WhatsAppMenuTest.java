package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The same menu and the same strings as the app's agentMenus.test.ts (menu-default.json = defaultMenuDoc()). */
public class WhatsAppMenuTest {

    private static final long NOW = 1_795_000_000_000L;
    private static final int NOON = 12 * 60;
    private static final String PAY = "• BANKILY : 0000";

    private static JSONObject doc() throws Exception {
        try (InputStream in = WhatsAppMenuTest.class.getResourceAsStream("/menu-default.json"); Scanner s = new Scanner(in, StandardCharsets.UTF_8.name())) {
            return new JSONObject(s.useDelimiter("\\A").next());
        }
    }

    private static JSONObject settings() throws Exception {
        return new JSONObject().put("mode", "auto").put("keywords", new JSONArray().put("القائمة").put("قائمة").put("menu").put("منيو"))
            .put("welcomeEveryHours", 12).put("hoursFrom", "08:00").put("hoursTo", "22:00");
    }

    @Test
    public void theMenusAsTheApp() throws Exception {
        JSONObject d = doc();
        assertEquals("1️⃣ 📡 حساباتي وأجهزتي\n2️⃣ 💰 الأسعار والاشتراكات\n3️⃣ 🛰️ الأجهزة والإكسسوارات\n4️⃣ 💳 الدفع والفواتير\n5️⃣ 🛠️ الدعم الفني\n6️⃣ 👨‍💼 التحدث مع موظف\n\nاكتب رقم الخدمة 👆",
            WhatsAppMenu.renderMenu(d, null));
        assertEquals("💳 الدفع والفواتير\n\n1️⃣ 🏦 طرق الدفع المتاحة\n2️⃣ 🧾 إرسال إثبات الدفع\n3️⃣ 📄 طلب فاتورة\n4️⃣ ⏳ حالة عملية الدفع\n5️⃣ 📊 سجل المدفوعات\n\n" + WhatsAppMenu.NAV_LINE,
            WhatsAppMenu.renderMenu(d, "pay"));
    }

    @Test
    public void welcomeAndNavigation() throws Exception {
        JSONObject d = doc();
        JSONObject s = settings();
        WhatsAppMenu.Step a = WhatsAppMenu.step(d, s, null, 0, "السلام عليكم", NOW, NOON, PAY);
        assertEquals("reply", a.kind);
        assertTrue(a.text.startsWith("🌐 مرحبًا بك في STAR NET"));
        assertEquals(NOW, a.lastWelcomeAt);
        WhatsAppMenu.Step b = WhatsAppMenu.step(d, s, null, NOW, "سلام", NOW + 3_600_000L, NOON, PAY);
        assertEquals(WhatsAppMenu.renderMenu(d, null), b.text);
        WhatsAppMenu.Step q = WhatsAppMenu.step(d, s, null, 0, "كم سعر التجديد؟", NOW, NOON, PAY);
        assertEquals("ai", q.kind);
        assertEquals(WhatsAppMenu.MENU_HINT, q.suffix);

        WhatsAppMenu.Step open = WhatsAppMenu.step(d, s, null, NOW, "٤", NOW, NOON, PAY);
        assertEquals("pay", open.at);
        assertEquals("💳 طرق الدفع المتاحة\n\n" + PAY + "\n\n" + WhatsAppMenu.NAV_LINE, WhatsAppMenu.step(d, s, "pay", NOW, "1", NOW, NOON, PAY).text);
        assertEquals("handoff", WhatsAppMenu.step(d, s, "pay", NOW, "3", NOW, NOON, PAY).kind);
        assertEquals("py_history", WhatsAppMenu.step(d, s, "pay", NOW, "5", NOW, NOON, PAY).node);
        WhatsAppMenu.Step back = WhatsAppMenu.step(d, s, "pay", NOW, "رجوع", NOW, NOON, PAY);
        assertEquals(null, back.at);
        assertEquals(WhatsAppMenu.renderMenu(d, null), WhatsAppMenu.step(d, s, "pay", NOW, "0", NOW, NOON, PAY).text);
        assertEquals("handoff", WhatsAppMenu.step(d, s, "pay", NOW, "موظف", NOW, NOON, PAY).kind);
        WhatsAppMenu.Step words = WhatsAppMenu.step(d, s, "pay", NOW, "دفعت أمس", NOW, NOON, PAY);
        assertEquals("ai", words.kind);
        assertEquals("الدفع والفواتير", words.topic);
        assertEquals(WhatsAppMenu.NAV_LINE, words.suffix);
    }

    @Test
    public void pricesHoursGreetings() throws Exception {
        JSONObject d = doc();
        d.put("plans", new JSONArray().put(new JSONObject().put("id", "p1").put("name", "قياسي").put("price", 20000).put("currency", "أوقية")
            .put("country", "موريتانيا").put("period", "شهر").put("details", "").put("enabled", true)));
        assertEquals("💰 أسعار تجديد الاشتراك\n\n• قياسي: 20,000 أوقية / شهر (موريتانيا)\n\n" + WhatsAppMenu.NAV_LINE,
            WhatsAppMenu.step(d, settings(), "prices", NOW, "1", NOW, NOON, PAY).text);
        assertTrue(WhatsAppMenu.isGreeting("Bonjour"));
        assertFalse(WhatsAppMenu.isGreeting("سلام، كم سعر التجديد؟"));
        assertTrue(WhatsAppMenu.handoffText(settings(), 23 * 60).contains("من 08:00 إلى 22:00"));
        assertEquals("ai", WhatsAppMenu.step(d, settings().put("mode", "off"), null, 0, "1", NOW, NOON, PAY).kind);
    }
}
