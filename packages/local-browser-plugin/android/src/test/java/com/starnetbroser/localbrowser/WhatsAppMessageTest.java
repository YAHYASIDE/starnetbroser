package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

/** Fake numbers and emails only. */
public class WhatsAppMessageTest {

    @Test
    public void onlyWhatsAppAndNeverAGroup() {
        assertTrue(WhatsAppMessage.isWhatsApp("com.whatsapp.w4b"));
        assertTrue(WhatsAppMessage.isWhatsApp("com.whatsapp"));
        assertFalse(WhatsAppMessage.isWhatsApp("com.kast.app"));
        assertTrue(WhatsAppMessage.isGroup("120363000000000000@g.us", false));
        assertTrue(WhatsAppMessage.isGroup(null, true));
        assertFalse(WhatsAppMessage.isGroup("22220000001@s.whatsapp.net", false));
    }

    @Test
    public void theSendersNumber() {
        assertEquals("22220000001", WhatsAppMessage.phoneOf("22220000001@s.whatsapp.net", "زبون تجريبي"));
        assertEquals("22220000001", WhatsAppMessage.phoneOf(null, "+222 2000 0001"));
        assertNull(WhatsAppMessage.phoneOf(null, "زبون تجريبي"));
        assertEquals("20000001", WhatsAppMessage.key("+222 2000 0001"));
        assertNull(WhatsAppMessage.key("123"));
    }

    @Test
    public void emailsAndQuestions() {
        assertEquals(Arrays.asList("fake.user@example.com"), WhatsAppMessage.emails("ايميلي Fake.User@Example.com و fake.user@example.com"));
        assertTrue(WhatsAppMessage.emails("السلام عليكم").isEmpty());
        assertTrue(WhatsAppMessage.asksAboutDevice("متى ينتهي اشتراكي؟"));
        assertTrue(WhatsAppMessage.asksAboutDevice("كم عليا"));
        assertTrue(WhatsAppMessage.asksAboutDevice("Mon abonnement Starlink"));
        assertFalse(WhatsAppMessage.asksAboutDevice("السلام عليكم"));
        assertFalse(WhatsAppMessage.asksAboutDevice(""));
    }

    @Test
    public void oneAnswerEveryHalfHour() {
        assertTrue(WhatsAppMessage.mayAnswer(0, 1000));
        assertFalse(WhatsAppMessage.mayAnswer(1000, 1000 + 10 * 60_000L));
        assertTrue(WhatsAppMessage.mayAnswer(1000, 1000 + 31 * 60_000L));
    }
}
