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
        s.clientMoved = "CLIENT MOVED";
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
        // A tapped day button of 📆 الأيام answers like "يوم 20".
        assertEquals("📆 تجديدات يوم 20 (1):\n• منزل - 2026-10-20", TelegramReplies.dayReply("r1", TelegramReplies.dayCallback("dd:20"), s).text);
        assertNull(TelegramReplies.dayCallback("dd:40"));
        assertNull(TelegramReplies.dayCallback("dd:x"));
        assertNull(TelegramReplies.dayCallback("a:dd:1"));
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
        // ➕ New customers are added from the app now: the bot only redirects, never records.
        TelegramReplies.Reply clientButton = TelegramReplies.forRep("r1", "➕ زبون جديد", snapshot());
        assertEquals("CLIENT MOVED", clientButton.text);
        assertFalse(clientButton.toInbox);
        TelegramReplies.Reply client = TelegramReplies.forRep("r1", "زبون جديد محمد 22212345", snapshot());
        assertFalse(client.toInbox);
        assertEquals("CLIENT MOVED", client.text);
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
    public void changesFileFromARep() {
        assertTrue(TelegramReplies.isDeviceFile("starnet-changes-r1-1000.json"));
        assertTrue(TelegramReplies.isChangesFile("starnet-changes-r1-1000.json"));
        assertFalse(TelegramReplies.isChangesFile("starnet-device-ab12.json"));
        TelegramReplies.Reply reply = TelegramReplies.deviceFile("r1", "starnet-changes-r1-1000.json", snapshot());
        assertEquals(TelegramReplies.CHANGES_RECEIVED, reply.text);
        assertTrue(reply.toInbox);
        assertTrue(reply.ownerNotice.contains("تسجيلاته"));
        TelegramReplies.Reply pairing = TelegramReplies.deviceFile("r1", "starnet-changes-pairing-1000.json", snapshot());
        assertTrue(pairing.text.contains("ربط هاتفك"));
        assertTrue(pairing.toInbox);
    }

    @Test
    public void normalizeMatchesTheApp() {
        assertEquals("احمد مكه 123", TelegramReplies.normalize("  أحمَد   مكة ١٢٣ "));
        assertEquals("\"a\\\"b\\nc\"", TelegramReplies.jsonString("a\"b\nc"));
    }

    // ---- the device menu (mirrors repDeviceMenu.test.ts) ----

    private static TelegramReplies.SearchEntry menuEntry(String id, String name, String keys) {
        Map<String, String> sections = new HashMap<>();
        sections.put("r", "📅 التجديد\nالتاريخ: 2026/10/27");
        sections.put("f", "👤 معلومات الجهاز\n📶 كود الواي فاي: wifi-1");
        Map<String, String> values = new HashMap<>();
        values.put("w", "wifi-1");
        return new TelegramReplies.SearchEntry(keys, "📡 " + name + "\nFULL CARD 🔴 غير متصل", "💬 محمد", "https://wa.me/1", "2026-10-27", "• " + name, null, id,
            "📡 " + name + "\n👤 محمد", sections, values);
    }

    private static TelegramReplies.Snapshot menuSnapshot() {
        TelegramReplies.Snapshot s = snapshot();
        java.util.List<TelegramReplies.SearchEntry> list = new java.util.ArrayList<>();
        list.add(menuEntry("acc-1", "مقهى", "مقهي محمد"));
        list.add(menuEntry("acc-2", "منزل", "منزل محمد"));
        s.repSearch.put("r1", list);
        return s;
    }

    @Test
    public void oneResultShowsItsMenuWithoutTheStaleDots() {
        TelegramReplies.Reply reply = TelegramReplies.forRep("r1", "مقهى", menuSnapshot());
        assertTrue(reply.text.contains("📡 مقهى\n👤 محمد"));
        assertTrue(reply.text.contains(TelegramReplies.MENU_HINT));
        assertFalse(reply.text.contains("غير متصل"));
        assertTrue(reply.markup.contains("\"callback_data\":\"v:n:acc-1\""));
        assertTrue(reply.markup.contains("\"callback_data\":\"nt:acc-1\""));
        assertTrue(reply.markup.contains("\"url\":\"https://wa.me/1\""));
        assertTrue(reply.markup.contains("\"callback_data\":\"a:acc-1\""));
    }

    @Test
    public void severalResultsGetOneButtonEach() {
        TelegramReplies.Reply reply = TelegramReplies.forRep("r1", "محمد", menuSnapshot());
        assertTrue(reply.text.contains("1. 📡 مقهى"));
        assertTrue(reply.text.contains("2. 📡 منزل"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"📡 مقهى\",\"callback_data\":\"m:acc-1\"}],[{\"text\":\"📡 منزل\",\"callback_data\":\"m:acc-2\"}]]}", reply.markup);
    }

    @Test
    public void menuMarkupMatchesTheApp() {
        assertEquals(
            "{\"inline_keyboard\":[[{\"text\":\"📶 الشبكة\",\"callback_data\":\"v:n:x\"},{\"text\":\"📅 التجديد\",\"callback_data\":\"v:r:x\"},{\"text\":\"🛰️ الاشتراك\",\"callback_data\":\"v:p:x\"}],"
                + "[{\"text\":\"💰 الدين\",\"callback_data\":\"v:d:x\"},{\"text\":\"🔢 KIT/SN\",\"callback_data\":\"v:i:x\"},{\"text\":\"👤 المعلومات\",\"callback_data\":\"v:f:x\"}],"
                + "[{\"text\":\"✏️ تعديل\",\"callback_data\":\"e:x\"},{\"text\":\"📊 كشف\",\"callback_data\":\"v:s:x\"},{\"text\":\"📝 ملاحظة\",\"callback_data\":\"nt:x\"}],"
                + "[{\"text\":\"⚡ تفعيل\",\"callback_data\":\"a:x\"}]]}",
            TelegramReplies.menuMarkup("x", null));
        String edit = TelegramReplies.editMarkup("x");
        assertTrue(edit.contains("\"callback_data\":\"ef:w:x\""));
        assertTrue(edit.endsWith("[{\"text\":\"↩️ رجوع\",\"callback_data\":\"v:h:x\"}]]}"));
        assertFalse(TelegramReplies.menuFits(new String(new char[60]).replace('\0', 'x')));
    }

    @Test
    public void tapsParse() {
        assertEquals("menu", TelegramReplies.parseTap("m:acc-1").kind);
        TelegramReplies.Tap view = TelegramReplies.parseTap("v:r:acc-1");
        assertEquals("view", view.kind);
        assertEquals("r", view.code);
        assertEquals("acc-1", view.accountId);
        TelegramReplies.Tap field = TelegramReplies.parseTap("ef:w:acc:1");
        assertEquals("field", field.kind);
        assertEquals("w", field.code);
        assertEquals("acc:1", field.accountId);
        assertEquals("edit", TelegramReplies.parseTap("e:acc-1").kind);
        assertEquals("note", TelegramReplies.parseTap("nt:acc-1").kind);
        assertNull(TelegramReplies.parseTap("ef:z:acc-1"));
        assertNull(TelegramReplies.parseTap("y:ab1"));
        assertNull(TelegramReplies.parseTap("dd:12"));
        assertNull(TelegramReplies.parseTap("a:acc-1"));
        assertNull(TelegramReplies.parseTap("p:acc-1:ROM"));
    }

    @Test
    public void sectionsEditsAndNotes() {
        TelegramReplies.Snapshot s = menuSnapshot();
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "acc-1", s);
        assertTrue(TelegramReplies.sectionText(e, "f", s).contains("📶 كود الواي فاي: wifi-1"));
        assertTrue(TelegramReplies.sectionText(e, "zz", s).contains("—"));
        assertTrue(TelegramReplies.fieldQuestion(e, "w").contains("كود الواي فاي - مقهى\nالحالي: wifi-1"));
        assertTrue(TelegramReplies.fieldQuestion(e, "p").contains("الحالي: —"));
        String owner = TelegramReplies.editToOwner("سالم", e, "w", "wifi-2");
        assertTrue(owner.contains("المندوب سالم"));
        assertTrue(owner.contains("الحالي: wifi-1\nالجديد: wifi-2"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"✅ موافق\",\"callback_data\":\"ey:q1\"},{\"text\":\"❌ رفض\",\"callback_data\":\"en:q1\"}]]}",
            TelegramReplies.editButtons("q1"));
        assertTrue(TelegramReplies.noteToOwner("سالم", e, "الجهاز في المخزن").contains("الجهاز في المخزن"));
    }

    @Test
    public void networkOnlyFromAFreshReading() {
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "acc-1", menuSnapshot());
        String ok = TelegramReplies.networkResult(e, "online", "offline", "10:41");
        assertTrue(ok.contains("تحديث 10:41"));
        assertTrue(ok.contains("🛰️ الطبق: 🟢 متصل"));
        assertTrue(ok.contains("📶 الواي فاي: 🔴 غير متصل"));
        assertTrue(TelegramReplies.networkResult(e, "unknown", "", "10:41").contains("⚪ غير معروف"));
        assertEquals(TelegramReplies.networkFailed(e), TelegramReplies.networkResult(e, "", "", "10:41"));
        assertTrue(TelegramReplies.networkFailed(e).contains("لا تُعرض حالة الشبكة إلا بعد تحديث ناجح"));
    }

    @Test
    public void liveCheckOnlyAfterTheAsk() {
        String raw = LiveCheckStore.encode(2000, "online", "");
        String[] dots = LiveCheckStore.decodeSince(raw, 1500);
        assertEquals("online", dots[0]);
        assertEquals("", dots[1]);
        assertNull(LiveCheckStore.decodeSince(raw, 2500));
        assertNull(LiveCheckStore.decodeSince(null, 0));
        assertNull(LiveCheckStore.decodeSince("x\ny", 0));
    }

    // ---- 💰 money / 🔔 alerts bots (mirrors repBots.test.ts) ----

    private static TelegramReplies.Snapshot moneySnapshot() {
        TelegramReplies.Snapshot s = menuSnapshot();
        s.moneyBot = "m_bot";
        s.devicesBot = "d_bot";
        s.moneyKeyboard = "MONEY KB";
        s.moneyHelp = "MONEY HELP";
        s.moneyRedirect = "REDIRECT";
        s.handoverHint = "HANDOVER HINT";
        s.handoverReceived = "HANDOVER OK";
        s.repWords.put("سلمت", "handover");
        s.repWords.put("كشفي", "statement");
        s.repWords.put("اجهزتي", "devices");
        s.reps.get("r1").put("statement", "R1 STATEMENT");
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "acc-1", s);
        e.sections.put("d", "💰 الدين\n🔴 عليه: 3,000 أوقية");
        e.sections.put("s", "📊 كشف حساب - مقهى");
        e.debtUrl = "https://wa.me/debt";
        return s;
    }

    @Test
    public void menuWithTheMoneyBotMatchesTheApp() {
        assertEquals(
            "{\"inline_keyboard\":[[{\"text\":\"📶 الشبكة\",\"callback_data\":\"v:n:acc-1\"},{\"text\":\"📅 التجديد\",\"callback_data\":\"v:r:acc-1\"},{\"text\":\"🛰️ الاشتراك\",\"callback_data\":\"v:p:acc-1\"}],"
                + "[{\"text\":\"🔢 KIT/SN\",\"callback_data\":\"v:i:acc-1\"},{\"text\":\"👤 المعلومات\",\"callback_data\":\"v:f:acc-1\"},{\"text\":\"📝 ملاحظة\",\"callback_data\":\"nt:acc-1\"}],"
                + "[{\"text\":\"✏️ تعديل\",\"callback_data\":\"e:acc-1\"},{\"text\":\"💰 المال\",\"url\":\"https://t.me/m_bot?start=d_acc-1\"}],"
                + "[{\"text\":\"⚡ تفعيل\",\"callback_data\":\"a:acc-1\"}]]}",
            TelegramReplies.menuMarkup("acc-1", null, "m_bot"));
        assertNull(TelegramReplies.moneyDeepLink("m_bot", "bad id"));
    }

    @Test
    public void devicesBotSendsMoneyToTheMoneyBot() {
        TelegramReplies.Reply reply = TelegramReplies.forRep("r1", "دفعة 5000 محمد", moneySnapshot());
        assertEquals("REDIRECT", reply.text);
        assertFalse(reply.toInbox);
        // Without the money bot nothing changes.
        assertEquals("RECEIVED", TelegramReplies.forRep("r1", "دفعة 5000 محمد", menuSnapshot()).text);
    }

    @Test
    public void moneyBotAnswers() {
        TelegramReplies.Snapshot s = moneySnapshot();
        TelegramReplies.Reply card = TelegramReplies.forMoney("r1", "/start d_acc-1", s);
        assertTrue(card.text.contains("🔴 عليه: 3,000 أوقية"));
        assertTrue(card.markup.contains("\"callback_data\":\"v:s:acc-1\""));
        assertTrue(card.markup.contains("https://wa.me/debt"));
        // 🔎 a typed name searches his money operations, never lists his customers' devices
        assertEquals(TelegramReplies.OPS_SEARCH_HINT, TelegramReplies.forMoney("r1", "مقهى", s).text);
        TelegramReplies.Reply pay = TelegramReplies.forMoney("r1", "دفعة 5000 مقهى", s);
        assertEquals("RECEIVED", pay.text);
        assertTrue(pay.toInbox);
        assertEquals("MONEY KB", pay.markup);
        TelegramReplies.Reply handover = TelegramReplies.forMoney("r1", "🤲 سلّمت المسؤول 50000", s);
        assertEquals("HANDOVER OK", handover.text);
        assertTrue(handover.toInbox);
        assertEquals("HANDOVER HINT", TelegramReplies.forMoney("r1", "🤲 سلّمت المسؤول", s).text);
        assertTrue(TelegramReplies.forMoney("r1", "كشفي", s).text.startsWith("R1 STATEMENT"));
        assertTrue(TelegramReplies.forMoney("r1", "اجهزتي", s).text.contains("@d_bot"));
        // 💰 money only: an activation request goes to the devices bot, and the device card has no ⚡ button
        assertTrue(TelegramReplies.forMoney("r1", "تفعيل مقهى", s).text.contains("@d_bot"));
        assertFalse(card.markup.contains("\"callback_data\":\"a:acc-1\""));
        assertEquals("acc-1", TelegramReplies.startDevice("/start d_acc-1"));
        assertNull(TelegramReplies.startDevice("/start"));
    }

    @Test
    public void stoppedAlertCarriesTheDMark() {
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "acc-1", menuSnapshot());
        e.hasD = true;
        e.stoppedUrl = "https://wa.me/stopped";
        String text = TelegramReplies.stoppedAlert(e, "suspended");
        assertTrue(text.contains(TelegramReplies.D_MARK_LINE));
        assertTrue(text.contains("موقوف بسبب الفوترة"));
        String markup = TelegramReplies.stoppedAlertMarkup(e);
        assertTrue(markup.contains("\"callback_data\":\"pq:acc-1\""));
        assertTrue(markup.contains("https://wa.me/stopped"));
        assertFalse(TelegramReplies.afterPayRequestMarkup(e).contains("pq:"));
        assertTrue(TelegramReplies.payRequestToOwner("سالم", e).contains("المندوب سالم يطلب منك الدفع"));
        assertTrue(TelegramReplies.ownerCopy("سالم", text).startsWith("🔔 نسخة من تنبيه المندوب سالم"));
        e.hasD = false;
        assertFalse(TelegramReplies.stoppedAlert(e, "canceled").contains(TelegramReplies.D_MARK_LINE));
    }

    @Test
    public void approvedActivationsAddUpPerMonth() {
        String[] first = TelegramText.addToTally(null, "MRU", 15000);
        String[] second = TelegramText.addToTally(first[0], "MRU", 5000);
        String[] third = TelegramText.addToTally(second[0], "USD", 50);
        assertEquals("3", third[1]);
        assertEquals("20,000 أوقية + 50 دولار", TelegramText.tallyLabel(third[0]));
        assertTrue(TelegramReplies.approvedActivation("ROM لـ مقهى بسعر 15,000 أوقية", "20,000 أوقية", "2").contains("مجموع تفعيلاتك الموافق عليها هذا الشهر (2): 20,000 أوقية"));
    }

    // ---- 💵 دفعة step by step ----

    @Test
    public void paymentAmountAndCurrencyParsing() {
        assertNull(TelegramReplies.explicitCurrency("15000"));
        assertEquals("SIFA", TelegramReplies.explicitCurrency("5000 سيفا"));
        assertEquals("USD", TelegramReplies.explicitCurrency("50 دولار"));
        assertEquals("MRU", TelegramReplies.explicitCurrency("٢٠٠٠ أوقية"));
        assertEquals("محمد", TelegramReplies.payQuery("5,000 سيفا عن محمد"));
        assertEquals("", TelegramReplies.payQuery("15000"));
        assertEquals(15000, TelegramReplies.parsePrice("15,000").amount, 0.001);
        assertEquals("💵 المبلغ: 15,000\n\nاختر العملة:", TelegramReplies.currencyQuestion(15000));
        String currencies = TelegramReplies.currencyMarkup();
        assertTrue(currencies.contains("\"callback_data\":\"payc:MRU\""));
        assertTrue(currencies.contains("\"callback_data\":\"payc:SIFA\""));
        // 💵 No دولار in the money bot (his Oct 11 2026 rule).
        assertFalse(currencies.contains("payc:USD"));
        assertFalse(TelegramReplies.bookCurrencyMarkup().contains("bkc:USD"));
        assertFalse(TelegramReplies.isPayCurrency("USD"));
        assertEquals(null, TelegramReplies.explicitMoneyCurrency("50 دولار"));
        assertEquals(null, TelegramReplies.explicitPayCurrency("50 دولار"));
        assertEquals("SIFA", TelegramReplies.explicitMoneyCurrency("2000 سيفا"));
        assertTrue(currencies.contains("\"callback_data\":\"payx\""));
        assertTrue(TelegramReplies.isPayCurrency("SIFA"));
        assertFalse(TelegramReplies.isPayCurrency("EUR"));
    }

    private static TelegramReplies.SearchEntry payEntry(String id, String device, String clientId, String client, boolean owes) {
        TelegramReplies.SearchEntry e = new TelegramReplies.SearchEntry(TelegramReplies.normalize(device + " " + client), "📡 " + device + (owes ? "\n💰 عليه: 3,000 أوقية" : ""),
            null, null, "", "• " + device, null, id);
        e.clientId = clientId;
        e.clientName = client;
        return e;
    }

    private static TelegramReplies.Snapshot paySnapshot() {
        TelegramReplies.Snapshot s = snapshot();
        java.util.List<TelegramReplies.SearchEntry> list = new java.util.ArrayList<>();
        list.add(payEntry("d1", "a@gmail.com", "c1", "محمد لمين", false));
        list.add(payEntry("d2", "b@outlook.com", "c2", "سالم", true));
        list.add(payEntry("d3", "c@outlook.com", "c1", "محمد لمين", false));
        list.add(payEntry("d4", "loose@gmail.com", "", "", false));
        s.repSearch.put("r1", list);
        return s;
    }

    @Test
    public void paymentListsCustomersFirstThenTheirDevices() {
        TelegramReplies.Snapshot s = paySnapshot();
        java.util.List<TelegramReplies.PayClient> clients = TelegramReplies.payClients("r1", s);
        assertEquals(3, clients.size());
        assertEquals("سالم", clients.get(0).name); // owes -> first
        assertEquals("محمد لمين", clients.get(1).name);
        assertEquals(2, clients.get(1).devices.size());
        TelegramReplies.Price price = new TelegramReplies.Price(5000, "SIFA");
        // 💼 His accounts only (his Oct 19 2026 rule «أزل عني زبائنه»): no customer, no device, no search buttons.
        TelegramReplies.Reply who = TelegramReplies.payWho("r1", price, "", "", 0, s);
        assertTrue(who.text.startsWith("💵 5,000 سيفا\n\n"));
        assertTrue(who.text.endsWith("تُسجَّل في حسابك 💼 - اضغط لتتابع:"));
        assertEquals("{\"inline_keyboard\":[[{\"text\":\"💼 في حسابي: 🟠 شخصي\",\"callback_data\":\"payt:me\"}],"
            + "[{\"text\":\"💱 سعر البديل - حساباتك بالأوقية\",\"callback_data\":\"payv\"}],[{\"text\":\"❌ إلغاء\",\"callback_data\":\"payx\"}]]}", who.markup);
        assertFalse(who.markup.contains("payl:") || who.markup.contains("payq:") || who.markup.contains("payt:d"));

        TelegramReplies.Reply devices = TelegramReplies.payClientDevices(price, TelegramReplies.findPayClient("r1", "c1", s));
        assertTrue(devices.text.contains("👤 الزبون: محمد لمين"));
        assertTrue(devices.text.contains("📡 a@gmail.com"));
        assertTrue(devices.text.contains("📡 c@outlook.com"));
        assertTrue(devices.markup.contains("{\"text\":\"📡 a@gmail.com\",\"callback_data\":\"payt:d1\"}"));
        assertTrue(devices.markup.contains("\"callback_data\":\"payw\""));
        assertNull(TelegramReplies.findPayClient("r1", "c9", s));
    }

    @Test
    public void paymentWhoIgnoresATypedNameAndShowsHisAccountsAgain() {
        TelegramReplies.Snapshot s = paySnapshot();
        TelegramReplies.Price price = new TelegramReplies.Price(100, "MRU");
        for (String typed : new String[] {"لمين", "outlook", "سالم"}) {
            TelegramReplies.Reply again = TelegramReplies.payWho("r1", price, typed, "", 0, s);
            assertTrue(again.markup.contains("payt:me"));
            assertFalse(again.markup.contains("payl:") || again.markup.contains("payt:d"));
        }
    }

    @Test
    public void paymentShowsWhatTheCustomerOwesOrHasAsCredit() {
        TelegramReplies.Snapshot s = paySnapshot();
        java.util.List<TelegramReplies.SearchEntry> list = s.repSearch.get("r1");
        list.get(0).balance = "عليه 3,000 أوقية";
        list.get(0).clientBalance = "عليه 3,000 أوقية · له 20 دولار";
        list.get(2).balance = "له 20 دولار";
        list.get(2).clientBalance = "عليه 3,000 أوقية · له 20 دولار";
        list.get(1).balance = "لا شيء عليه ولا له";
        list.get(1).clientBalance = "لا شيء عليه ولا له";
        TelegramReplies.Price price = new TelegramReplies.Price(5000, "SIFA");

        TelegramReplies.Reply devices = TelegramReplies.payClientDevices(price, TelegramReplies.findPayClient("r1", "c1", s));
        assertTrue(devices.text.contains("💰 حسابه (كل أجهزته): عليه 3,000 أوقية · له 20 دولار"));
        assertTrue(devices.text.contains("📡 a@gmail.com\n   💰 عليه 3,000 أوقية"));
        assertTrue(devices.text.contains("📡 c@outlook.com\n   💰 له 20 دولار"));

        String confirm = TelegramReplies.payConfirmText(price, list.get(2));
        assertTrue(confirm.contains("💰 قبل هذه الدفعة:\n• الجهاز: له 20 دولار\n• حساب الزبون كله: عليه 3,000 أوقية · له 20 دولار"));
        assertTrue(TelegramReplies.payConfirmText(price, list.get(1)).contains("• الجهاز: لا شيء عليه ولا له"));
        assertFalse(TelegramReplies.payConfirmText(price, list.get(1)).contains("حساب الزبون كله"));
    }

    @Test
    public void paymentCustomersPageByEight() {
        TelegramReplies.Snapshot s = snapshot();
        java.util.List<TelegramReplies.SearchEntry> list = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) list.add(payEntry("d" + i, "dev" + i, "c" + i, "زبون " + i, false));
        s.repSearch.put("r1", list);
        TelegramReplies.Price price = new TelegramReplies.Price(1, "MRU");
        // The customers never page in the payment any more (his Oct 19 2026 rule) - only his accounts.
        TelegramReplies.Reply first = TelegramReplies.payWho("r1", price, "", "", 1, s);
        assertFalse(first.markup.contains("payl:") || first.markup.contains("payp:"));
    }

    @Test
    public void paymentSummaryAndMessages() {
        TelegramReplies.Snapshot s = menuSnapshot();
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "acc-1", s);
        TelegramReplies.Price price = new TelegramReplies.Price(15000, "MRU");
        String confirm = TelegramReplies.payConfirmText(price, e);
        assertTrue(confirm.contains("💵 المبلغ: 15,000 أوقية"));
        assertTrue(confirm.contains("📡 الجهاز: مقهى"));
        assertTrue(TelegramReplies.payConfirmText(price, null).contains("💼 في: حسابي الشخصي - 🟢 حساب الأوقية (تُخصم مما عليّ للمسؤول)"));
        String buttons = TelegramReplies.payConfirmMarkup();
        assertTrue(buttons.contains("\"callback_data\":\"payok\""));
        assertTrue(buttons.contains("\"callback_data\":\"payw\""));
        assertTrue(buttons.contains("\"callback_data\":\"payx\""));
        assertTrue(TelegramReplies.paySent(price, e).startsWith("✅ أُرسلت الدفعة إلى المسؤول"));
        assertEquals("💵 دفعة من المندوب علي: 50 دولار\n💼 في حسابه الشخصي - 💵 حساب الدولار\nوافق عليها من صفحة المندوبين في التطبيق.",
            TelegramReplies.payToOwner("علي", new TelegramReplies.Price(50, "USD"), null));
    }

    // ---- 🏦 دين (سلفة) ----

    @Test
    public void loanAppsFollowTheCurrency() {
        String mru = TelegramReplies.loanAppMarkup("MRU");
        assertTrue(mru.contains("{\"text\":\"📲 بنكيلي\",\"callback_data\":\"lna:bankily\"}"));
        assertTrue(mru.contains("{\"text\":\"📲 سداد\",\"callback_data\":\"lna:sedad\"}"));
        assertTrue(mru.contains("{\"text\":\"📲 مصرفي\",\"callback_data\":\"lna:masrvi\"}"));
        assertFalse(mru.contains("orange"));
        String sifa = TelegramReplies.loanAppMarkup("SIFA");
        assertTrue(sifa.contains("{\"text\":\"📲 أورانج موني\",\"callback_data\":\"lna:orange\"}"));
        assertTrue(sifa.contains("{\"text\":\"📲 نيتا\",\"callback_data\":\"lna:nita\"}"));
        assertFalse(sifa.contains("bankily"));
        assertTrue(sifa.contains("\"callback_data\":\"lnx\""));
        assertEquals("بنكيلي", TelegramReplies.loanAppName("MRU", "bankily"));
        assertNull(TelegramReplies.loanAppName("SIFA", "bankily")); // not a سيفا app
        assertEquals(0, TelegramReplies.loanApps("USD").length);
        String currencies = TelegramReplies.loanCurrencyMarkup();
        assertTrue(currencies.contains("lnc:MRU") && currencies.contains("lnc:SIFA"));
        assertFalse(currencies.contains("USD"));
    }

    @Test
    public void loanRecipientNumberAndSummary() {
        assertEquals("22123456", TelegramReplies.parseLoanNumber("22 12 34 56"));
        assertEquals("22222123456", TelegramReplies.parseLoanNumber("+222 22123456"));
        assertEquals("22123456", TelegramReplies.parseLoanNumber("٢٢١٢٣٤٥٦"));
        assertNull(TelegramReplies.parseLoanNumber("1234"));
        assertNull(TelegramReplies.parseLoanNumber("محمد"));
        TelegramReplies.Price price = new TelegramReplies.Price(20000, "MRU");
        assertEquals("🏦 20,000 أوقية عبر بنكيلي\n\n📱 اكتب رقم المستلم في بنكيلي (أرقام فقط):", TelegramReplies.loanNumberQuestion(price, "بنكيلي"));
        String confirm = TelegramReplies.loanConfirmText(price, "بنكيلي", "22123456");
        assertTrue(confirm.contains("💵 المبلغ: 20,000 أوقية\n📲 التطبيق: بنكيلي\n📱 رقم المستلم: 22123456"));
        assertTrue(TelegramReplies.loanConfirmMarkup().contains("\"callback_data\":\"lnok\""));
        assertTrue(TelegramReplies.loanToOwner("علي", price, "بنكيلي", "22123456").startsWith("🏦 طلب سلفة من المندوب علي: 20,000 أوقية\n📲 عبر: بنكيلي\n📱 إلى الرقم: 22123456"));
        assertTrue(TelegramReplies.isMoneyKind("loan"));
    }

    // ---- 💵 دفعة: how it was paid + 📸 its photo ----

    @Test
    public void paymentMethodsFollowTheCurrency() {
        String mru = TelegramReplies.methodMarkup("MRU");
        assertTrue(mru.indexOf("paym:cash") < mru.indexOf("paym:bankily"));
        assertTrue(mru.indexOf("paym:bankily") < mru.indexOf("paym:masrvi"));
        assertTrue(mru.indexOf("paym:masrvi") < mru.indexOf("paym:sedad"));
        assertTrue(mru.contains("{\"text\":\"💵 كاش\",\"callback_data\":\"paym:cash\"}"));
        assertTrue(mru.contains("{\"text\":\"📲 بنكيلي\",\"callback_data\":\"paym:bankily\"}"));
        assertFalse(mru.contains("orange"));
        String sifa = TelegramReplies.methodMarkup("SIFA"); // «سيفا تدفع فقط كاش»
        assertTrue(sifa.contains("paym:cash"));
        assertFalse(sifa.contains("orange") || sifa.contains("nita") || sifa.contains("bankily"));
        String franc = TelegramReplies.methodMarkup(TelegramReplies.FRANC);
        assertTrue(franc.contains("paym:orange") && franc.contains("paym:nita") && !franc.contains("paym:cash"));
        assertEquals(1, TelegramReplies.payMethods("USD").length); // دولار: كاش only
        assertEquals("كاش", TelegramReplies.payMethodName("USD", "cash"));
        assertEquals("نيتا", TelegramReplies.payMethodName("SIFA", "nita"));
        assertNull(TelegramReplies.payMethodName("SIFA", "bankily"));
        assertNull(TelegramReplies.payMethodName("MRU", ""));
        // The loan's apps: the same banks, same order.
        assertTrue(TelegramReplies.loanAppMarkup("MRU").indexOf("masrvi") < TelegramReplies.loanAppMarkup("MRU").indexOf("sedad"));
    }

    @Test
    public void paymentInHisOwnAccountShowsHisAccounts() {
        TelegramReplies.Snapshot s = paySnapshot();
        java.util.Map<String, String> mine = new java.util.HashMap<>();
        mine.put("name", "سالم");
        mine.put("wallets", "📂 حساباتك:\n🟠 شخصي: عليك 44,000 سيفا\n💰 الربح: لك 6,000 أوقية\n🟢 الأوقية: متوازن ✓");
        mine.put("wallet:SIFA", "عليك 44,000 سيفا");
        mine.put("wallet:MRU", "متوازن ✓");
        s.reps.put("r1", mine);
        TelegramReplies.Reply sifa = TelegramReplies.payWho("r1", new TelegramReplies.Price(10000, "SIFA"), "", "", 0, s);
        assertTrue(sifa.text.startsWith("💵 10,000 سيفا\n\n📂 حساباتك:\n🟠 شخصي: عليك 44,000 سيفا\n💰 الربح: لك 6,000 أوقية\n🟢 الأوقية: متوازن ✓\n\nتُسجَّل في حسابك 💼"));
        assertTrue(sifa.markup.contains("{\"text\":\"💼 في حسابي: 🟠 شخصي · عليك 44,000 سيفا\",\"callback_data\":\"payt:me\"}"));
        // 🟠 فرانك (أورانج / نيتا) is سيفا: the same account
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(50000, TelegramReplies.FRANC), "", "", 0, s).markup.contains("💼 في حسابي: 🟠 شخصي"));
        TelegramReplies.Reply mru = TelegramReplies.payWho("r1", new TelegramReplies.Price(3000, "MRU"), "", "", 0, s);
        assertTrue(mru.markup.contains("{\"text\":\"💼 في حسابي: 🟢 الأوقية · متوازن ✓\",\"callback_data\":\"payt:me\"}"));
        // searching keeps the same 💼 button
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(10000, "SIFA"), "زيد", "c", 0, s).markup.contains("💼 في حسابي: 🟠 شخصي · عليك 44,000 سيفا"));
        String confirm = TelegramReplies.payConfirmText(new TelegramReplies.Price(10000, "SIFA"), null, "أورانج موني", false, "عليك 44,000 سيفا");
        assertTrue(confirm.contains("💼 في: حسابي الشخصي - 🟠 حساب شخصي (تُخصم مما عليّ للمسؤول)\n📂 قبل هذه الدفعة: عليك 44,000 سيفا"));
        assertTrue(confirm.contains("💳 طريقة الدفع: أورانج موني"));
        assertTrue(confirm.endsWith("هل المعلومات صحيحة؟"));
        assertTrue(TelegramReplies.paySent(new TelegramReplies.Price(10000, "SIFA"), null).contains("\n💼 في حسابي الشخصي - 🟠 حساب شخصي"));
        assertEquals("", TelegramReplies.walletBalance("r2", "SIFA", s));
    }

    @Test
    public void aNamedAccountInTwoCurrenciesShowsTheLineOfThePaymentsCurrency() {
        TelegramReplies.Snapshot s = paySnapshot();
        java.util.Map<String, String> mine = s.reps.get("r1");
        if (mine == null) {
            mine = new java.util.HashMap<>();
            s.reps.put("r1", mine);
        }
        // 💱 «اورانج» in سيفا + أوقية: one line per currency, the same id
        mine.put("ledgers", "lg1\t📒 اورانج\tSIFA\tلك 5,000 سيفا\nlg1\t📒 اورانج\tMRU\tعليك 20,000 أوقية");
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(3000, "MRU"), "", "", 0, s).markup.contains("📒 في حسابي: 📒 اورانج · عليك 20,000 أوقية"));
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(3000, "SIFA"), "", "", 0, s).markup.contains("📒 في حسابي: 📒 اورانج · لك 5,000 سيفا"));
        assertEquals("عليك 20,000 أوقية", TelegramReplies.namedTarget("r1", "L:lg1", "MRU", s).balance);
        assertEquals("لك 5,000 سيفا", TelegramReplies.namedTarget("r1", "L:lg1", TelegramReplies.FRANC, s).balance);
        assertNull(TelegramReplies.namedTarget("r1", "L:gone", "MRU", s));
    }

    @Test
    public void paymentIntoANamedAccountAfterTheNormalOne() {
        TelegramReplies.Snapshot s = paySnapshot();
        java.util.Map<String, String> mine = s.reps.get("r1");
        if (mine == null) {
            mine = new java.util.HashMap<>();
            s.reps.put("r1", mine);
        }
        mine.put("wallet:SIFA", "عليك 44,000 سيفا");
        mine.put("ledgers", "lg1\t🔒 تنزيل دبو\tSIFA\tعليك 880,000 سيفا\nlg2\t📒 شهر 10\tMRU\tعليك 207,025.65 أوقية");
        TelegramReplies.Price sifa = new TelegramReplies.Price(10000, "SIFA");
        TelegramReplies.Reply who = TelegramReplies.payWho("r1", sifa, "", "", 0, s);
        assertTrue(who.text.contains("في أي حساب؟ 💼 حسابك الشخصي أو أحد حساباتك 📒:"));
        // 💼 first, then 📒 only the سيفا account, then the customers
        int me = who.markup.indexOf("payt:me");
        int named = who.markup.indexOf("{\"text\":\"📒 في حسابي: 🔒 تنزيل دبو · عليك 880,000 سيفا\",\"callback_data\":\"payt:L:lg1\"}");
        assertTrue(me > 0 && named > me);
        assertFalse(who.markup.contains("payl:")); // no customers (his Oct 19 2026 rule)
        assertFalse(who.markup.contains("lg2"));
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(3000, "MRU"), "", "", 0, s).markup.contains("payt:L:lg2"));
        // فرانك (أورانج / نيتا) = سيفا
        assertTrue(TelegramReplies.payWho("r1", new TelegramReplies.Price(50000, TelegramReplies.FRANC), "", "", 0, s).markup.contains("payt:L:lg1"));

        assertTrue(TelegramReplies.isPersonalTarget("me"));
        assertTrue(TelegramReplies.isPersonalTarget("L:lg1"));
        assertFalse(TelegramReplies.isPersonalTarget("d1"));
        TelegramReplies.NamedAccount account = TelegramReplies.namedTarget("r1", "L:lg1", s);
        assertEquals("🔒 تنزيل دبو", account.label);
        assertNull(TelegramReplies.namedTarget("r1", "L:gone", s));
        assertNull(TelegramReplies.namedTarget("r1", "me", s));

        assertTrue(TelegramReplies.photoQuestion(sifa, null, false, account).contains("📒 في حسابي «🔒 تنزيل دبو» (لا يدخل في الربح ولا يسدد الأجهزة)"));
        String confirm = TelegramReplies.payConfirmText(sifa, null, "أورانج موني", false, account.balance, account);
        assertTrue(confirm.contains("💵 المبلغ: 10,000 سيفا\n📒 في حسابي «🔒 تنزيل دبو»"));
        assertTrue(confirm.contains("📂 قبل هذه الدفعة: عليك 880,000 سيفا"));
        assertTrue(confirm.contains("💳 طريقة الدفع: أورانج موني"));
        assertTrue(confirm.endsWith("هل المعلومات صحيحة؟"));
        assertTrue(TelegramReplies.paySent(sifa, null, "كاش", false, account).contains("\n📒 في حسابي «🔒 تنزيل دبو»"));
        assertTrue(TelegramReplies.payToOwner("علي", sifa, null, "كاش", false, account).contains("\n📒 في حسابه «🔒 تنزيل دبو»"));
        // no named accounts: as before
        mine.remove("ledgers");
        assertTrue(TelegramReplies.namedAccounts("r1", s).isEmpty());
    }

    @Test
    public void paymentPhotoStepAndSummary() {
        TelegramReplies.Snapshot s = paySnapshot();
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "d1", s);
        TelegramReplies.Price price = new TelegramReplies.Price(5000, "SIFA");
        assertTrue(TelegramReplies.photoQuestion(price, e, false).contains("📸 أرسل صورة إثبات الدفع"));
        assertTrue(TelegramReplies.photoQuestion(price, null, true).contains("💼 في حسابي الشخصي - 🟠 حساب شخصي"));
        assertTrue(TelegramReplies.photoMarkup(false).contains("{\"text\":\"⏭️ متابعة بدون صورة\",\"callback_data\":\"paynp\"}"));
        assertTrue(TelegramReplies.photoMarkup(true).contains("{\"text\":\"⏭️ متابعة\",\"callback_data\":\"paynp\"}"));
        String confirm = TelegramReplies.payConfirmText(price, e, "أورانج موني", true);
        assertTrue(confirm.contains("💳 طريقة الدفع: أورانج موني\n📸 صورة الدفع: مرفقة ✅"));
        assertTrue(confirm.endsWith("\n\nهل المعلومات صحيحة؟"));
        assertTrue(TelegramReplies.payConfirmText(price, e, "كاش", false).contains("📸 صورة الدفع: بدون صورة"));
        assertTrue(TelegramReplies.payToOwner("علي", price, e, "نيتا", true).contains("💳 طريقة الدفع: نيتا"));
        assertTrue(TelegramReplies.payToOwner("علي", price, e, "نيتا", true).endsWith("(الصورة تظهر هناك)."));
        assertTrue(TelegramReplies.paySent(price, null, "كاش", false).contains("💳 طريقة الدفع: كاش"));
    }

    // ---- 🔎 بحث in the money bot ----

    @Test
    public void moneySearchIsHisOperationsOnly() {
        TelegramReplies.Snapshot s = paySnapshot();
        s.repWords.put("بحث", "search");
        TelegramReplies.Reply start = TelegramReplies.forMoney("r1", "🔎 بحث", s);
        assertEquals(TelegramReplies.OPS_SEARCH_HINT, start.text);
        assertTrue(start.markup == null || !start.markup.contains("sl:"));
        // the old buttons of messages already sent still open (searchClientDevices stays)
        assertNotNull(TelegramReplies.findPayClient("r1", "c1", s));
    }

    @Test
    public void activationAsksWhetherTheCustomerPaid() {
        TelegramReplies.Snapshot s = paySnapshot();
        TelegramReplies.SearchEntry e = TelegramReplies.findEntry("r1", "d1", s);
        TelegramReplies.Price price = new TelegramReplies.Price(8000, "MRU");
        assertEquals("⚡ 100G - a@gmail.com بسعر 8,000 أوقية\n\n💵 هل دفع الزبون هذا المبلغ؟", TelegramReplies.activationPaidQuestion("100G", e, price));
        String markup = TelegramReplies.activationPaidMarkup("MRU");
        assertTrue(markup.contains("{\"text\":\"✅ دفع - كاش\",\"callback_data\":\"ap:cash\"}"));
        assertTrue(markup.contains("{\"text\":\"✅ دفع - بنكيلي\",\"callback_data\":\"ap:bankily\"}"));
        assertTrue(markup.contains("{\"text\":\"⏳ لم يدفع بعد\",\"callback_data\":\"ap:no\"}"));
        assertFalse(markup.contains("ap:orange"));
        assertEquals("دفع للمندوب (بنكيلي)", TelegramReplies.activationPaidLabel("MRU", "bankily"));
        assertEquals("لم يدفع بعد - يبقى ديناً عليه", TelegramReplies.activationPaidLabel("MRU", ""));
        String owner = TelegramReplies.activationToOwner("علي", "100G", e, price, "cash");
        assertTrue(owner.contains("💵 الزبون: دفع للمندوب (كاش)"));
        assertTrue(owner.contains("يُسجَّل تجديداً على الجهاز"));
        assertTrue(owner.endsWith("هل توافق على السعر؟"));
        assertTrue(TelegramReplies.activationSent("100G", e, price, "").endsWith("💵 لم يدفع بعد - يبقى ديناً عليه"));
    }

    @Test
    public void bookListsOnlyTheRepsOwnCustomers() {
        TelegramReplies.Snapshot s = paySnapshot();
        assertEquals(TelegramReplies.BOOK_NONE, TelegramReplies.bookStart("r1", 0, s).text);
        for (TelegramReplies.SearchEntry e : s.repSearch.get("r1")) if ("c1".equals(e.clientId)) {
            e.own = true;
            e.clientBalance = "عليه 1,500 أوقية";
        }
        java.util.List<TelegramReplies.PayClient> own = TelegramReplies.bookClients("r1", s);
        assertEquals(1, own.size());
        assertEquals("محمد لمين", own.get(0).name);
        TelegramReplies.Reply start = TelegramReplies.bookStart("r1", 0, s);
        assertTrue(start.markup.contains("\"callback_data\":\"bkl:c1\""));
        assertFalse(start.markup.contains("bkl:c2"));
        assertNull(TelegramReplies.findBookClient("r1", "c2", s));
        assertTrue(TelegramReplies.bookKindQuestion(own.get(0)).contains("في دفترك: عليه 1,500 أوقية"));
        assertTrue(TelegramReplies.bookKindMarkup().contains("\"callback_data\":\"bkk:c\""));
        assertTrue(TelegramReplies.bookKindMarkup().contains("\"callback_data\":\"bkk:r\""));
    }

    @Test
    public void bookEntrySavedCanBeUndoneWithin24Hours() {
        TelegramReplies.Price price = new TelegramReplies.Price(500, "MRU");
        String confirm = TelegramReplies.bookConfirmText("محمد", "c", price, "دين قديم");
        assertTrue(confirm.contains("➕ عليه 500 أوقية"));
        assertTrue(confirm.contains("📝 دين قديم"));
        String saved = TelegramReplies.bookSaved("محمد", "➕ عليه", price, "");
        assertTrue(saved.startsWith("✅ سُجّل في دفترك:"));
        String undo = TelegramReplies.bookUndoMarkup("0f8fad5b-d9cb-469f-a165-70867728950e", 1_800_000_000_000L);
        assertNotNull(undo);
        assertTrue(undo.contains("\"callback_data\":\"bku:0f8fad5b-d9cb-469f-a165-70867728950e:30000000\""));
        String undone = TelegramReplies.bookUndone(saved);
        assertTrue(undone.startsWith("↩️ أُلغي من دفترك:"));
        assertFalse(undone.contains("يمكنك التراجع"));
        assertEquals("سطر واحد فقط", TelegramReplies.oneLine("  سطر\nواحد   فقط "));
    }

    @Test
    public void orangeAndNitaCountInFrancs() {
        // His Oct 2026 rule: 5 فرانك = 1 سيفا - a rep's «10000» with أورانج is 2,000 سيفا.
        assertTrue(TelegramReplies.isFrancApp("orange"));
        assertTrue(TelegramReplies.isFrancApp("nita"));
        assertFalse(TelegramReplies.isFrancApp("cash"));
        assertFalse(TelegramReplies.isFrancApp(""));
        TelegramReplies.Price typed = new TelegramReplies.Price(10000, "SIFA");
        TelegramReplies.Price sifa = TelegramReplies.francToSifa(typed);
        assertEquals(2000, sifa.amount, 0.001);
        assertEquals("SIFA", sifa.currency);
        assertEquals("10,000 فرانك = 2,000 سيفا", TelegramReplies.francNote(typed, sifa));
    }

    @Test
    public void sifaIsCashOnlyAndFrancIsOrangeOrNita() {
        // «سيفا تدفع فقط كاش» - «أورانج موني لفرانك فقط».
        assertEquals(1, TelegramReplies.payMethods("SIFA").length);
        assertEquals(TelegramReplies.CASH, TelegramReplies.payMethods("SIFA")[0][0]);
        assertEquals(2, TelegramReplies.payMethods(TelegramReplies.FRANC).length);
        assertNull(TelegramReplies.payMethodName(TelegramReplies.FRANC, TelegramReplies.CASH));
        assertEquals("أورانج موني", TelegramReplies.payMethodName(TelegramReplies.FRANC, "orange"));
        // once converted the payment is سيفا and its app stays valid
        assertEquals("أورانج موني", TelegramReplies.payMethodName("SIFA", "orange"));
        assertEquals(TelegramReplies.FRANC, TelegramReplies.explicitPayCurrency("10000 فرنك"));
        assertEquals("SIFA", TelegramReplies.explicitPayCurrency("10000 سيفا"));
        assertTrue(TelegramReplies.currencyMarkup().contains("payc:FRANC"));
        // a loan still goes out through أورانج / نيتا
        assertEquals(2, TelegramReplies.loanApps("SIFA").length);
    }

    @Test
    public void francHintWhereverOrangeOrNitaCarriesSifa() {
        TelegramReplies.Price sifa = new TelegramReplies.Price(8000, "SIFA");
        assertEquals("\n🟠 أورانج / نيتا بالفرانك: 8,000 سيفا = 40,000 فرانك", TelegramReplies.francLine(sifa, true));
        assertEquals("", TelegramReplies.francLine(sifa, false));
        assertEquals("", TelegramReplies.francLine(new TelegramReplies.Price(8000, "MRU"), true));
        assertTrue(TelegramReplies.isFrancAppName("أورانج موني") && TelegramReplies.isFrancAppName("نيتا") && !TelegramReplies.isFrancAppName("بنكيلي"));
        assertTrue(TelegramReplies.loanConfirmText(sifa, "أورانج موني", "74646158").contains("= 40,000 فرانك"));
        assertTrue(TelegramReplies.loanToOwner("علي", sifa, "نيتا", "22227268").contains("= 40,000 فرانك"));
        assertTrue(TelegramReplies.activationPaidMarkup("SIFA").contains("✅ دفع - أورانج موني (بالفرانك)"));
    }

    @Test
    public void moneyBotStatementPagesAndOperationSearch() {
        TelegramReplies.Snapshot s = moneySnapshot();
        // Not prepared yet: the old device search still answers.
        assertNull(TelegramReplies.opSearch("r1", "5000", s));
        assertNull(TelegramReplies.preparedPage("r1", "a0:0", s));
        Map<String, String> r1 = s.reps.get("r1");
        r1.put("ks:a0:0", "PERSONAL PAGE");
        r1.put("ks:a0:0#kb", "{\"inline_keyboard\":[]}");
        r1.put("ks:s", "SEARCH START");
        r1.put("ks:s#kb", "SEARCH KB");
        r1.put("ops", "دفعه 5000 سيفا 2026-10-17 17/10\t• 17/10 💵 دفعة 5,000 سيفا\nدين 3000 اوقيه 2026-10-16 16/10\t• 16/10 🧾 عليك 3,000 أوقية");
        TelegramReplies.Reply page = TelegramReplies.preparedPage("r1", "a0:0", s);
        assertTrue(page.text.startsWith("PERSONAL PAGE"));
        assertEquals("{\"inline_keyboard\":[]}", page.markup);
        assertNull(TelegramReplies.preparedPage("r2", "a0:0", s));
        TelegramReplies.Reply found = TelegramReplies.forMoney("r1", "5,000", s);
        assertTrue(found.text.contains("💵 دفعة 5,000 سيفا"));
        assertFalse(found.text.contains("أوقية"));
        assertEquals("SEARCH KB", found.markup);
        assertTrue(TelegramReplies.forMoney("r1", "دين ١٦/١٠", s).text.contains("عليك 3,000 أوقية"));
        assertTrue(TelegramReplies.forMoney("r1", "سلفة", s).text.startsWith("🔎 لم أجد"));
    }

    @Test
    public void aQuestionKeepsTheRepsBottomButtons() {
        String kept = "{\"keyboard\":[[{\"text\":\"💵 دفعة\"}]],\"is_persistent\":true}";
        assertEquals(kept, TelegramReplies.keepKeyboard(TelegramReplies.FORCE_REPLY, kept));
        assertEquals(kept, TelegramReplies.keepKeyboard(TelegramReplies.NOTE_REPLY, kept));
        String inline = "{\"inline_keyboard\":[]}";
        assertEquals(inline, TelegramReplies.keepKeyboard(inline, kept));
        assertEquals(TelegramReplies.FORCE_REPLY, TelegramReplies.keepKeyboard(TelegramReplies.FORCE_REPLY, ""));
        // a plain reply brings the buttons back
        assertEquals(kept, TelegramReplies.keepKeyboard(null, kept));
        assertEquals(null, TelegramReplies.keepKeyboard(null, ""));
    }

    // ---- 💱 «سعر البديل» ----

    private static TelegramReplies.Snapshot swapSnapshot() {
        TelegramReplies.Snapshot s = snapshot();
        Map<String, String> rep = new HashMap<>();
        rep.put("name", "حسين");
        rep.put("pairRate", "3600");
        rep.put("wallet:SIFA", "عليك 536,861.47 سيفا");
        rep.put("wallet:MRU", "متوازن ✓");
        rep.put("ledgers", "L1\t🟠 ORANJ MONEY\tSIFA\tعليك 1,330.4 سيفا\nL2\t📒 MRO\tMRU\tمتوازن ✓");
        s.reps.put("r1", rep);
        return s;
    }

    @Test
    public void swapConvertsAtTheRateHeSays() {
        assertEquals(1000.0, TelegramReplies.convertByRate(3600, "MRU", 3600), 0.001);
        assertEquals(3600.0, TelegramReplies.convertByRate(1000, "SIFA", 3600), 0.001);
        assertEquals("SIFA", TelegramReplies.otherCurrency("MRU"));
        assertNull(TelegramReplies.otherCurrency("USD"));
        assertEquals(3600.0, TelegramReplies.pairRate("r1", swapSnapshot()), 0.001);
        assertEquals(3642.5, TelegramReplies.parseRate("3,642.5"), 0.001);
    }

    @Test
    public void swapTargetRoundTripsAndStaysHisAccount() {
        String t = TelegramReplies.swapTarget("SIFA", 3600, TelegramReplies.PAY_ME);
        assertEquals("~SIFA~3600~me", t);
        TelegramReplies.Swap swap = TelegramReplies.parseSwap(t);
        assertNotNull(swap);
        assertEquals("SIFA", swap.to);
        assertEquals(TelegramReplies.PAY_ME, swap.inner);
        assertTrue(TelegramReplies.isPersonalTarget(t));
        assertFalse(TelegramReplies.isLedgerTarget(t));
        String named = TelegramReplies.swapTarget("SIFA", 3642.5, "L:L1");
        assertTrue(TelegramReplies.isLedgerTarget(named));
        assertEquals("L1", TelegramReplies.namedTarget("r1", named, "SIFA", swapSnapshot()).id);
        assertNull(TelegramReplies.parseSwap("~USD~1~me"));
        assertNull(TelegramReplies.parseSwap("~SIFA~0~me"));
        assertNull(TelegramReplies.parseSwap("me"));
    }

    @Test
    public void accountPriceCarriesWhatWasPaid() {
        TelegramReplies.Price paid = new TelegramReplies.Price(3600, "MRU");
        TelegramReplies.Price into = TelegramReplies.accountPrice(paid, "~SIFA~3600~me");
        assertEquals(1000.0, into.amount, 0.001);
        assertEquals("SIFA", into.currency);
        assertEquals("3,600 أوقية", into.money().label());
        assertTrue(into.label().contains("3,600 أوقية ← 1,000 سيفا"));
        assertTrue(into.label().contains("1,000 سيفا = 3,600 أوقية"));
        assertTrue(TelegramReplies.accountPrice(paid, "me") == paid);
    }

    @Test
    public void whoStepOffersTheSwapAndItsAccounts() {
        TelegramReplies.Snapshot s = swapSnapshot();
        TelegramReplies.Price paid = new TelegramReplies.Price(3600, "MRU");
        TelegramReplies.Reply who = TelegramReplies.payWho("r1", paid, "", "", 0, s);
        assertTrue(who.markup.contains("payv"));
        assertTrue(who.markup.contains("سعر البديل"));
        TelegramReplies.Reply swap = TelegramReplies.paySwapWho("r1", paid, 3600, s);
        assertTrue(swap.text.contains("3,600 أوقية = 1,000 سيفا"));
        assertTrue(swap.markup.contains("payt:~SIFA~3600~me"));
        assertTrue(swap.markup.contains("payt:~SIFA~3600~L:L1"));
        assertFalse(swap.markup.contains("L:L2"));
        assertTrue(swap.markup.contains("payve"));
        assertFalse(TelegramReplies.payWho("r1", new TelegramReplies.Price(50, "USD"), "", "", 0, s).markup.contains("payv"));
    }
}
