package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CardFillMessageTest {

    @Test
    public void readsTheType() {
        assertEquals("ready", CardFillMessage.type("{\"type\":\"ready\",\"kinds\":[\"number\"]}"));
        assertEquals("focus", CardFillMessage.type("{\"type\": \"focus\",\"kind\":\"cvc\"}"));
        assertEquals("filled", CardFillMessage.type("{\"type\":\"filled\",\"count\":3}"));
        assertNull(CardFillMessage.type("{\"type\":\"steal\"}"));
        assertNull(CardFillMessage.type(null));
    }

    @Test
    public void readsTheCount() {
        assertEquals(3, CardFillMessage.count("{\"type\":\"filled\",\"count\":3}"));
        assertEquals(0, CardFillMessage.count("{\"type\":\"filled\"}"));
    }

    @Test
    public void onlySecureFrames() {
        assertTrue(CardFillMessage.isSecureOrigin("https"));
        assertFalse(CardFillMessage.isSecureOrigin("http"));
        assertFalse(CardFillMessage.isSecureOrigin(null));
    }
}
