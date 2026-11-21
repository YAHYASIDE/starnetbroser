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
    public void aHiddenLidChatIsReadFromItsTitle() {
        // his Nov 21 2026 report: «…@lid» digits are not the phone - the title is (with WhatsApp's direction marks)
        assertNull(WhatsAppMessage.chatPhone("123456789012345@lid"));
        WhatsAppMessage.Found f = WhatsAppMessage.find("123456789012345@lid", "\u202A+223 70 00 00 01\u202C", null, null, null);
        assertEquals("22370000001", f.phone);
        assertEquals(WhatsAppMessage.FROM_TITLE, f.from);
        assertEquals("70000001", WhatsAppMessage.key(f.phone));
        assertEquals("22370000001", WhatsAppMessage.phoneOf("123456789012345@lid", "+223 70 00 00 01"));
        assertTrue(WhatsAppMessage.isHiddenId("123456789012345@lid"));
        assertFalse(WhatsAppMessage.isHiddenId("22220000001@s.whatsapp.net"));
    }

    @Test
    public void severalMessagesAndOtherMarks() {
        assertEquals("22370000001", WhatsAppMessage.numberText("+223\u00A070 00 00 01 (3 رسائل)"));
        assertEquals("22370000001", WhatsAppMessage.numberText("\u200F+223 70 00 00 01\u200F (3 messages)"));
        assertEquals("22370000001", WhatsAppMessage.numberText("0022370000001"));
        assertNull(WhatsAppMessage.numberText("زبون (2)"));
    }

    @Test
    public void aSavedContactByItsSenderPerson() {
        // a name in the title, the number only in sender_person
        WhatsAppMessage.Found uri = WhatsAppMessage.find("123456789012345@lid", "زبون محفوظ", "زبون محفوظ", "tel:+22370000001", null);
        assertEquals("22370000001", uri.phone);
        assertEquals(WhatsAppMessage.FROM_PERSON, uri.from);
        WhatsAppMessage.Found key = WhatsAppMessage.find("123456789012345@lid", "زبون محفوظ", null, null, "22370000001@s.whatsapp.net");
        assertEquals("22370000001", key.phone);
        // a hidden id as the person's key is not a number either
        assertNull(WhatsAppMessage.find("123456789012345@lid", "زبون محفوظ", "زبون محفوظ", null, "123456789012345@lid").phone);
        // the sender's line can be the number when the title is not
        assertEquals("22370000001", WhatsAppMessage.find(null, "زبون محفوظ", "+223 70 00 00 01", null, null).phone);
    }

    @Test
    public void aCustomerAnsweredBeforeStillIs() {
        // a saved customer (a name like «الحسين») whose chat id is his phone - as before the fix
        WhatsAppMessage.Found f = WhatsAppMessage.find("22220000009@s.whatsapp.net", "زبون باسم", "زبون باسم", null, null);
        assertEquals("22220000009", f.phone);
        assertEquals(WhatsAppMessage.FROM_CHAT, f.from);
        assertEquals("20000009", WhatsAppMessage.key(f.phone));
        assertEquals("22220000009", WhatsAppMessage.chatPhone("22220000009@c.us"));
        assertEquals("22220000009", WhatsAppMessage.chatPhone("22220000009"));
        assertNull(WhatsAppMessage.chatPhone("120363000000000000@g.us"));
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
