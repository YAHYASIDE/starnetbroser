package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class TelegramRepliesTest {

    private static TelegramReplies.Snapshot snapshot() {
        TelegramReplies.Snapshot s = new TelegramReplies.Snapshot();
        s.at = "27/09 16:40";
        s.ownerHelp = "OWNER HELP";
        s.repHelp = "REP HELP";
        s.unknown = "لم أفهم «{text}».";
        s.statementLater = "LATER";
        s.linkReply = "أهلاً {name}";
        s.linkNotice = "طلب من {name}";
        s.owner.put("stopped", "STOPPED LIST");
        s.owner.put("cash", "CASH");
        s.ownerWords.put("help", "help");
        s.ownerWords.put("stopped", "stopped");
        s.ownerWords.put("المتوقفة", "stopped");
        s.ownerWords.put("الصندوق", "cash");
        s.ownerWords.put("كشف", "statement");
        s.repWords.put("اجهزتي", "devices"); // folded, as the app sends them
        s.repWords.put("ديون", "debts");
        s.repWords.put("start", "help");
        Map<String, String> r1 = new HashMap<>();
        r1.put("devices", "R1 DEVICES");
        r1.put("debts", "R1 DEBTS");
        r1.put("name", "سالم");
        s.reps.put("r1", r1);
        Map<String, String> r2 = new HashMap<>();
        r2.put("devices", "R2 DEVICES");
        s.reps.put("r2", r2);
        r1.put("stopped", "R1 STOPPED");
        r1.put("stopped#kb", "{\"inline_keyboard\":[]}");
        s.repWords.put("الموقوفه", "stopped");
        s.repWords.put("بحث", "search");
        s.repWords.put("دفعه", "payment");
        s.repWords.put("زبون", "client");
        s.paymentHint = "PAY HINT";
        s.clientHint = "CLIENT HINT";
        s.requestReceived = "RECEIVED";
        s.requestNotice = "طلب من {rep}: «{text}»";
        s.repWords.put("وعد", "promise");
        s.promiseHint = "PROMISE HINT";
        s.promiseReceived = "PROMISE OK";
        s.promiseNotice = "وعد عبر {rep}: «{text}»";
        s.plans.add("ROM");
        s.plans.add("Sis");
        s.plans.add("100G");
        s.activationHint = "ACT HINT";
        s.repWords.put("تفعيل", "activate");
        s.repKeyboard = "KEYBOARD";
        s.searchHint = "HINT";
        java.util.List<TelegramReplies.SearchEntry> r1Devices = new java.util.ArrayList<>();
        r1Devices.add(new TelegramReplies.SearchEntry("مقهي النخيل محمد احمد 22212345678", "CARD1", "💬 محمد", "https://wa.me/22212345678",
            "2026-09-28", "• مقهى - محمد", "https://wa.me/22212345678?text=renew", "acc1"));
        r1Devices.add(new TelegramReplies.SearchEntry("منزل سالم", "CARD2", null, null, "2026-10-20", "• منزل", null));
        s.repSearch.put("r1", r1Devices);
        java.util.List<TelegramReplies.SearchEntry> r2Devices = new java.util.ArrayList<>();
        r2Devices.add(new TelegramReplies.SearchEntry("جهاز علي محمد", "OTHER", null, null));
        s.repSearch.put("r2", r2Devices);
        s.repSearch.put(TelegramReplies.OWNER_INDEX, r1Devices);
        return s;
    }

    @Test
    public void commandWordStripsSlashBotNameAndCase() {
        assertEquals("stopped", TelegramReplies.commandWord("/Stopped@starnet_bot"));
        assertEquals("ديون", TelegramReplies.commandWord("  ديون زبائني "));
        assertEquals("كشف", TelegramReplies.commandWord("كشف محمد"));
        assertEquals("", TelegramReplies.commandWord("   "));
        assertEquals("", TelegramReplies.commandWord(null));
        // Keyboard buttons send the emoji too.
        assertEquals("أجهزتي", TelegramReplies.commandWord("📡 أجهزتي"));
        assertEquals("الموقوفة", TelegramReplies.commandWord("⛔️ الموقوفة"));
        assertEquals("محمد", TelegramReplies.afterCommand("🔎 بحث محمد"));
        // An email keeps its "@gmail" - only a "/command@bot" loses the @name.
        assertEquals("abdlkrim9113@gmail.com", TelegramReplies.cleanText("abdlkrim9113@gmail.com"));
        assertEquals("start", TelegramReplies.cleanText("/start@starnet_reps_bot"));
    }

    @Test
    public void ownerGetsPreparedAnswersWithTheirTime() {
        TelegramReplies.Reply reply = TelegramReplies.forOwner("المتوقفة", snapshot());
        assertEquals("STOPPED LIST\n\n🕒 حسب بيانات الهاتف عند 27/09 16:40", reply.text);
        assertFalse(reply.toInbox);
        assertEquals("OWNER HELP", TelegramReplies.forOwner("/help", snapshot()).text);
        assertEquals("لم أفهم «مرحبا».\n\nOWNER HELP", TelegramReplies.forOwner("مرحبا", snapshot()).text);
    }

    @Test
    public void ownerStatementWaitsForTheApp() {
        TelegramReplies.Reply reply = TelegramReplies.forOwner("كشف محمد", snapshot());
        assertEquals("LATER", reply.text);
        assertTrue(reply.toInbox);
        TelegramReplies.Reply early = TelegramReplies.forOwner("كشف محمد", null);
        assertTrue(early.toInbox);
        assertEquals(TelegramReplies.NOT_READY, TelegramReplies.forOwner("الصندوق", null).text);
    }

    @Test
    public void repOnlyEverGetsHisOwnTexts() {
        assertTrue(TelegramReplies.forRep("r1", "أجهزتي", snapshot()).text.startsWith("R1 DEVICES"));
        assertTrue(TelegramReplies.forRep("r2", "أجهزتي", snapshot()).text.startsWith("R2 DEVICES"));
        assertTrue(TelegramReplies.forRep("r1", "ديون زبائني", snapshot()).text.startsWith("R1 DEBTS"));
        // r2 has no debts text prepared - never falls back to someone else's.
        assertEquals(TelegramReplies.NOT_READY, TelegramReplies.forRep("r2", "ديون", snapshot()).text);
        assertEquals(TelegramReplies.NOT_READY, TelegramReplies.forRep("r9", "أجهزتي", snapshot()).text);
        // Owner-only words mean nothing to a rep - searched among his devices, then help.
        assertEquals("🔎 لم أجد «الصندوق» بين أجهزتك\n\nREP HELP", TelegramReplies.forRep("r1", "الصندوق", snapshot()).text);
        assertEquals("REP HELP", TelegramReplies.forRep("r1", "/start", snapshot()).text);
        assertEquals("KEYBOARD", TelegramReplies.forRep("r1", "/start", snapshot()).markup);
        TelegramReplies.Reply stopped = TelegramReplies.forRep("r1", "⛔ الموقوفة", snapshot());
        assertTrue(stopped.text.startsWith("R1 STOPPED"));
        assertEquals("{\"inline_keyboard\":[]}", stopped.markup);
        // No prepared buttons -> the keyboard.
        assertEquals("KEYBOARD", TelegramReplies.forRep("r1", "أجهزتي", snapshot()).markup);
    }

    @Test
    public void unlinkedIsToldOnceAndTheOwnerHears() {
        TelegramReplies.Reply first = TelegramReplies.forUnlinked("سالم", false, snapshot());
        assertEquals("أهلاً سالم", first.text);
        assertEquals("طلب من سالم", first.ownerNotice);
        assertTrue(first.toInbox);
        TelegramReplies.Reply again = TelegramReplies.forUnlinked("سالم", true, snapshot());
        assertNull(again.text);
        assertNull(again.ownerNotice);
        assertFalse(again.toInbox);
        assertEquals("طلب من مستخدم", TelegramReplies.forUnlinked(" ", false, snapshot()).ownerNotice);
    }

    @Test
    public void searchOnlyHisDevicesWithWhatsAppButtons() {
        TelegramReplies.Reply byName = TelegramReplies.forRep("r1", "مُحمّد", snapshot());
        assertTrue(byName.text.startsWith("🔎 نتائج «مُحمّد» (1):\n\nCARD1"));
        assertFalse(byName.text.contains("OTHER"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"💬 محمد\",\"url\":\"https://wa.me/22212345678\"},"
            + "{\"text\":\"⚡ تفعيل\",\"callback_data\":\"a:acc1\"}]]}", byName.markup);
        TelegramReplies.Reply byPhone = TelegramReplies.forRep("r1", "🔎 بحث ٢٢٢١٢", snapshot());
        assertTrue(byPhone.text.contains("CARD1"));
        TelegramReplies.Reply noButton = TelegramReplies.forRep("r1", "بحث سالم", snapshot());
        assertTrue(noButton.text.contains("CARD2"));
        assertEquals("KEYBOARD", noButton.markup);
        assertEquals("HINT", TelegramReplies.forRep("r1", "🔎 بحث", snapshot()).text);
        // Numbers typed with dashes/spaces match the compacted keys.
        assertTrue(TelegramReplies.forRep("r1", "222-12-345", snapshot()).text.contains("CARD1"));
        // Typed spelling variants fold to the same word.
        assertTrue(TelegramReplies.forRep("r1", "أجهزتي", snapshot()).text.startsWith("R1 DEVICES"));
        assertEquals("🔎 لم أجد «علي» بين أجهزتك", TelegramReplies.forRep("r1", "بحث علي", snapshot()).text);
    }

    @Test
    public void searchByDay() {
        java.util.Calendar today = java.util.Calendar.getInstance();
        today.set(2026, java.util.Calendar.SEPTEMBER, 27);
        TelegramReplies.Snapshot s = snapshot();
        s.at = "";
        TelegramReplies.Reply tomorrow = TelegramReplies.search("r1", "غداً", false, s, today);
        assertEquals("📆 تجديدات غداً 28/09 (1):\n• مقهى - محمد", tomorrow.text);
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"💬 محمد\",\"url\":\"https://wa.me/22212345678?text=renew\"}]]}", tomorrow.markup);
        assertEquals("📆 تجديدات يوم 20 (1):\n• منزل - 2026-10-20", TelegramReplies.search("r1", "يوم ٢٠", false, s, today).text);
        assertEquals("📆 تجديدات 20/10 (1):\n• منزل - 2026-10-20", TelegramReplies.search("r1", "20/10", false, s, today).text);
        assertEquals("📆 لا تجديدات لأجهزتك 5/05", TelegramReplies.search("r1", "5/05", false, s, today).text);
        assertNull(TelegramReplies.parseDay("4521", today));
        // r2 never sees r1's renewals.
        assertEquals("📆 لا تجديدات لأجهزتك غداً 28/09", TelegramReplies.search("r2", "غدا", false, s, today).text);
    }

    @Test
    public void requestsGoToTheAppAndTheOwner() {
        TelegramReplies.Reply pay = TelegramReplies.forRep("r1", "دفعة 5000 محمد", snapshot());
        assertEquals("RECEIVED", pay.text);
        assertTrue(pay.toInbox);
        assertEquals("طلب من سالم: «دفعة 5000 محمد»", pay.ownerNotice);
        // No amount yet / just the button: the how-to, nothing recorded.
        TelegramReplies.Reply button = TelegramReplies.forRep("r1", "💵 دفعة", snapshot());
        assertEquals("PAY HINT", button.text);
        assertFalse(button.toInbox);
        assertEquals("CLIENT HINT", TelegramReplies.forRep("r1", "➕ زبون جديد", snapshot()).text);
        TelegramReplies.Reply client = TelegramReplies.forRep("r1", "زبون جديد محمد 22212345", snapshot());
        assertTrue(client.toInbox);
        assertEquals("RECEIVED", client.text);
    }

    @Test
    public void ownerSearchesAllDevicesWithWhatsAppButtonsOnly() {
        TelegramReplies.Reply reply = TelegramReplies.forOwner("محمد", snapshot());
        assertTrue(reply.text.startsWith("🔎 نتائج «محمد» (1):\n\nCARD1"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"💬 محمد\",\"url\":\"https://wa.me/22212345678\"}]]}", reply.markup);
        assertTrue(TelegramReplies.forOwner("مرحبا", snapshot()).text.startsWith("لم أفهم"));
    }

    @Test
    public void promisesAreRecordedByTheApp() {
        assertEquals("PROMISE HINT", TelegramReplies.forRep("r1", "🤝 وعد دفع", snapshot()).text);
        TelegramReplies.Reply promise = TelegramReplies.forRep("r1", "وعد 5000 محمد الخميس", snapshot());
        assertEquals("PROMISE OK", promise.text);
        assertTrue(promise.toInbox);
        assertEquals("وعد عبر سالم: «وعد 5000 محمد الخميس»", promise.ownerNotice);
    }

    @Test
    public void activationFlow() {
        TelegramReplies.Snapshot s = snapshot();
        // "تفعيل محمد": exactly one device -> its plans.
        TelegramReplies.Reply pick = TelegramReplies.forRep("r1", "⚡ تفعيل محمد", s);
        assertTrue(pick.text.startsWith("⚡ تفعيل CARD1"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"ROM\",\"callback_data\":\"p:acc1:ROM\"},"
            + "{\"text\":\"Sis\",\"callback_data\":\"p:acc1:Sis\"},{\"text\":\"100G\",\"callback_data\":\"p:acc1:100G\"}]]}", pick.markup);
        assertEquals("ACT HINT", TelegramReplies.forRep("r1", "⚡ تفعيل", s).text);
        // Search results carry ⚡ next to WhatsApp.
        String markup = TelegramReplies.forRep("r1", "محمد", s).markup;
        assertTrue(markup.contains("{\"text\":\"⚡ تفعيل\",\"callback_data\":\"a:acc1\"}"));
        // Only his own devices.
        assertNull(TelegramReplies.findEntry("r2", "acc1", s));
        assertEquals("CARD1", TelegramReplies.findEntry("r1", "acc1", s).deviceName());
    }

    @Test
    public void prices() {
        assertEquals("15,000 أوقية", TelegramReplies.parsePrice("15000").label());
        assertEquals("15,000 أوقية", TelegramReplies.parsePrice("١٥٬٠٠٠ أوقية").label());
        assertEquals("50 دولار", TelegramReplies.parsePrice("50 دولار").label());
        assertEquals("3,000 سيفا", TelegramReplies.parsePrice("3000 سيفا").label());
        assertNull(TelegramReplies.parsePrice("بدون"));
        assertNull(TelegramReplies.parsePrice("0"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"✅ موافق\",\"callback_data\":\"y:ab1\"},{\"text\":\"❌ رفض\",\"callback_data\":\"n:ab1\"}]]}",
            TelegramReplies.approvalButtons("ab1"));
    }

    @Test
    public void deviceFileFromARep() {
        assertTrue(TelegramReplies.isDeviceFile("starnet-device-ab12.json"));
        assertTrue(TelegramReplies.isDeviceFile("STARNET-DEVICE-x.json"));
        assertFalse(TelegramReplies.isDeviceFile("photo.jpg"));
        assertFalse(TelegramReplies.isDeviceFile(null));
        TelegramReplies.Reply reply = TelegramReplies.deviceFile("r1", "starnet-device-ab12.json", snapshot());
        assertEquals(TelegramReplies.DEVICE_RECEIVED, reply.text);
        assertTrue(reply.toInbox);
        assertTrue(reply.ownerNotice.startsWith("📥 المندوب "));
        assertNotNull(TelegramReplies.deviceFile("r1", "x", null).text);
    }

    @Test
    public void normalizeMatchesTheApp() {
        assertEquals("احمد مكه 123", TelegramReplies.normalize("  أحمَد   مكة ١٢٣ "));
        assertEquals("\"a\\\"b\\nc\"", TelegramReplies.jsonString("a\"b\nc"));
    }
}
