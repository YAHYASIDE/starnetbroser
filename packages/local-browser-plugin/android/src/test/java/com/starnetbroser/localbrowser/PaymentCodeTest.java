package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

// Shaped like his real mails / notifications - fake codes only.
public class PaymentCodeTest {

    @Test
    public void readsTheNoReplyPaymentCode() {
        assertEquals("123456", PaymentCode.fromNotification("no-reply",
            "STARLINK INTERNET\nPlease confirm the following payment Please confirm your payment of €0.00 to STARLINK INTERNET using the following code: 123456"));
        // Gmail's line: subject + snippet
        assertEquals("654321", PaymentCode.fromNotification("no-reply", "STARLINK INTERNET Please confirm your payment of €0.00 to STARLINK INTERNET using the following code: 654321"));
    }

    @Test
    public void neverKastsOwnCodes() {
        assertNull(PaymentCode.fromNotification("KAST", "Your KAST verification code 123456"));
        assertNull(PaymentCode.fromNotification("KAST", "123456 is your verification code."));
    }

    @Test
    public void notAPaymentOrNoCode() {
        assertNull(PaymentCode.fromNotification("no-reply", "STARLINK INTERNET"));
        assertNull(PaymentCode.fromNotification("Starlink", "Your Starlink verification code is 123456"));
        assertNull(PaymentCode.fromNotification("Bank", "Payment of 4600 MRU"));
    }

    @Test
    public void whatHeCopied() {
        assertEquals("123456", PaymentCode.fromClipboard(" 123456 "));
        assertEquals("123456", PaymentCode.fromClipboard("١٢٣٤٥٦"));
        assertNull(PaymentCode.fromClipboard("code 123456"));
        assertNull(PaymentCode.fromClipboard("4111111111111111"));
        assertNull(PaymentCode.fromClipboard(null));
    }

    @Test
    public void lastFourOfTheSavedCard() {
        assertEquals("1111", PaymentCode.last4OfPayload("{\"number\":\"4111 1111 1111 1111\",\"cvc\":\"123\"}"));
        assertNull(PaymentCode.last4OfPayload("{\"name\":\"DEMO\"}"));
    }

    @Test
    public void theInboxReadsOnlyWhileWaitingAndOnlyNewCodes() {
        List<String> got = new ArrayList<>();
        String mail = "Please confirm your payment of €0.00 to STARLINK INTERNET using the following code: 123456";
        assertFalse(PaymentCodeInbox.offer("no-reply", mail, 100));
        PaymentCodeInbox.Listener l = got::add;
        PaymentCodeInbox.await(1000, l);
        assertTrue(PaymentCodeInbox.isWaiting());
        assertFalse(PaymentCodeInbox.offer("no-reply", mail, 999));
        assertFalse(PaymentCodeInbox.offer("KAST", "Your KAST verification code 999999", 2000));
        assertTrue(PaymentCodeInbox.offer("no-reply", mail, 2000));
        assertEquals(1, got.size());
        assertEquals("123456", got.get(0));
        assertFalse(PaymentCodeInbox.isWaiting());
        assertFalse(PaymentCodeInbox.offer("no-reply", mail, 3000));
        PaymentCodeInbox.stop(l);
    }
}
