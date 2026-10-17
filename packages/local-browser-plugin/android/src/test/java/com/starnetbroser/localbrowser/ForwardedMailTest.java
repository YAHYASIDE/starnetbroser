package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ForwardedMailTest {

    @Test
    public void normalizesWhatHeTyped() {
        assertEquals("demo-shop.com", ForwardedMail.normalizeDomain(" @Demo-Shop.com "));
        assertEquals("demo-shop.com", ForwardedMail.normalizeDomain("https://demo-shop.com/"));
        assertEquals("", ForwardedMail.normalizeDomain("not a domain"));
        assertEquals("", ForwardedMail.normalizeDomain(null));
    }

    @Test
    public void knowsTheAddressesOnTheDomain() {
        assertTrue(ForwardedMail.onDomain("Ahmed.Salem427@demo-shop.com", "demo-shop.com"));
        assertFalse(ForwardedMail.onDomain("ahmed@outlook.com", "demo-shop.com"));
        assertFalse(ForwardedMail.onDomain("ahmed@notdemo-shop.com", "demo-shop.com"));
        assertFalse(ForwardedMail.onDomain("ahmed@demo-shop.com", ""));
    }
}
