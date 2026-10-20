package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

// Fake codes only.
public class PaymentCodeInboxTest {

    private static final String TITLE = "STARLINK INTERNET";
    private static String text(String code) {
        return "Please confirm your payment of $0.00 to STARLINK INTERNET using the following code: " + code;
    }

    @Test
    public void anOldOrAlreadyTypedCodeIsNeverHandedBack() {
        List<String> got = new ArrayList<>();
        PaymentCodeInbox.Listener l = got::add;
        PaymentCodeInbox.await(1000, Collections.singleton("111111"), l);
        assertFalse("mailed before the code screen", PaymentCodeInbox.offer(TITLE, text("222222"), 500));
        assertFalse("already typed and refused", PaymentCodeInbox.offer(TITLE, text("111111"), 2000));
        assertTrue(PaymentCodeInbox.offer(TITLE, text("333333"), 2000));
        assertEquals(Collections.singletonList("333333"), got);
        assertFalse("one code per wait", PaymentCodeInbox.isWaiting());
    }
}
