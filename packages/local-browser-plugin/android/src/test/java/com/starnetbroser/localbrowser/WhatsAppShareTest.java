package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WhatsAppShareTest {

    @Test
    public void aSavedNumberBecomesItsChat() {
        assertEquals("22227580836@s.whatsapp.net", WhatsAppShare.jid("+222 27 58 08 36"));
        assertEquals("22227580836@s.whatsapp.net", WhatsAppShare.jid("0022227580836"));
        assertEquals("213669582198@s.whatsapp.net", WhatsAppShare.jid("213669582198"));
        assertNull(WhatsAppShare.jid(""));
        assertNull(WhatsAppShare.jid("1234"));
        assertNull(WhatsAppShare.jid(null));
    }

    @Test
    public void theFileNameIsSafe() {
        assertEquals("starnet-statement-2026-11-03-1130.png", WhatsAppShare.fileName("starnet-statement-2026-11-03-1130.png"));
        assertEquals("statement.._.._x.png", WhatsAppShare.fileName("../../x"));
        assertTrue(WhatsAppShare.fileName(null).endsWith(".png"));
    }
}
