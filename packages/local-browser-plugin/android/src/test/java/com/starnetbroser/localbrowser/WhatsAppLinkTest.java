package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WhatsAppLinkTest {
    @Test
    public void onlyTheTwoWhatsAppPackages() {
        assertEquals("com.whatsapp", WhatsAppLink.packageFor("personal"));
        assertEquals("com.whatsapp.w4b", WhatsAppLink.packageFor("business"));
        assertNull(WhatsAppLink.packageFor("com.evil.app"));
        assertNull(WhatsAppLink.packageFor(null));
        assertNull(WhatsAppLink.packageFor(""));
    }

    @Test
    public void onlyWhatsAppChatLinks() {
        assertTrue(WhatsAppLink.isAllowedUrl("https://wa.me/22227268?text=hi"));
        assertTrue(WhatsAppLink.isAllowedUrl("https://wa.me/?text=hi"));
        assertTrue(WhatsAppLink.isAllowedUrl("https://wa.me?text=hi"));
        assertTrue(WhatsAppLink.isAllowedUrl("https://api.whatsapp.com/send?phone=1"));
        assertFalse(WhatsAppLink.isAllowedUrl("http://wa.me/1"));
        assertFalse(WhatsAppLink.isAllowedUrl("https://wa.me.evil.com/1"));
        assertFalse(WhatsAppLink.isAllowedUrl("intent://send#Intent;package=com.x;end"));
        assertFalse(WhatsAppLink.isAllowedUrl("file:///sdcard/a"));
        assertFalse(WhatsAppLink.isAllowedUrl(null));
    }
}
