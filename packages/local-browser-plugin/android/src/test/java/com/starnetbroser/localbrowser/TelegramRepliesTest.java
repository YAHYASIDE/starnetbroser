package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
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
        s.repWords.put("أجهزتي", "devices");
        s.repWords.put("ديون", "debts");
        s.repWords.put("start", "help");
        Map<String, String> r1 = new HashMap<>();
        r1.put("devices", "R1 DEVICES");
        r1.put("debts", "R1 DEBTS");
        s.reps.put("r1", r1);
        Map<String, String> r2 = new HashMap<>();
        r2.put("devices", "R2 DEVICES");
        s.reps.put("r2", r2);
        return s;
    }

    @Test
    public void commandWordStripsSlashBotNameAndCase() {
        assertEquals("stopped", TelegramReplies.commandWord("/Stopped@starnet_bot"));
        assertEquals("ديون", TelegramReplies.commandWord("  ديون زبائني "));
        assertEquals("كشف", TelegramReplies.commandWord("كشف محمد"));
        assertEquals("", TelegramReplies.commandWord("   "));
        assertEquals("", TelegramReplies.commandWord(null));
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
        // Owner-only words mean nothing to a rep.
        assertEquals("لم أفهم «الصندوق».\n\nREP HELP", TelegramReplies.forRep("r1", "الصندوق", snapshot()).text);
        assertEquals("REP HELP", TelegramReplies.forRep("r1", "/start", snapshot()).text);
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
}
