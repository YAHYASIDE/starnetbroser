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

    @Test
    public void theCustomersPriceAsHeTypesIt() {
        assertEquals(20000, PinRequest.parseAmount("20,000"), 0);
        assertEquals(13500, PinRequest.parseAmount("١٣٥٠٠"), 0);
        assertEquals(12.5, PinRequest.parseAmount(" 12.5 "), 0);
        assertEquals(-1, PinRequest.parseAmount(""), 0);
        assertEquals(-1, PinRequest.parseAmount("0"), 0);
        assertEquals(-1, PinRequest.parseAmount("abc"), 0);
        assertEquals(-1, PinRequest.parseAmount(null), 0);
    }

    @Test
    public void theCurrencyHeUsedLastTime() {
        assertEquals(1, PinRequest.currencyIndex("SIFA"));
        assertEquals(0, PinRequest.currencyIndex(null));
        assertEquals("MRU", PinRequest.CURRENCIES[0]);
    }
}
