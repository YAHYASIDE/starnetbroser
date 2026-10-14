package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PinRequestTest {

    @Test
    public void theNoteSaysTheChargeIsStillToRecordWithD() {
        assertTrue(PinRequest.NOTE.startsWith("⏳ لم يُسجَّل الشحن بعد"));
        assertTrue(PinRequest.NOTE.contains("مع D"));
        assertTrue(PinRequest.NOTE.length() <= 300); // the app's note limit
        assertEquals("pinRequest", PinRequest.FIELD);
    }
}
