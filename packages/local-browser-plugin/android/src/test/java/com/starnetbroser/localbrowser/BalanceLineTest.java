package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BalanceLineTest {

    @Test
    public void theBalanceIsWrittenWithItsCurrency() {
        assertEquals("💰 عليه ⁦ARS 140,000.00⁩", BalanceLine.text("140000.00", "ARS"));
        assertEquals("💰 عليه ⁦USD 65.50⁩", BalanceLine.text("65.5", "usd"));
        assertEquals("💰 عليه ⁦1,234.00⁩", BalanceLine.text("1,234.00", null));
        assertEquals("💰 له ⁦USD 5.00⁩", BalanceLine.text("-5.00", "USD"));
    }

    @Test
    public void zeroAndUnreadable() {
        assertEquals("✓ لا شيء عليه", BalanceLine.text("0.00", "ARS"));
        assertEquals("", BalanceLine.text("", "ARS"));
        assertEquals("", BalanceLine.text(null, "ARS"));
        assertEquals("", BalanceLine.text("abc", "ARS"));
        assertNull(BalanceLine.amount("NaN"));
    }

    @Test
    public void owesOnlyAboveZero() {
        assertTrue(BalanceLine.owes("140000.00"));
        assertFalse(BalanceLine.owes("0.00"));
        assertFalse(BalanceLine.owes("-3"));
        assertFalse(BalanceLine.owes(null));
    }

    @Test
    public void theBalanceInOuguiyaAndSifa() {
        java.util.Map<String, Double> rates = new java.util.HashMap<>();
        rates.put("MRU", 400.0);
        rates.put("SIFA", 600.0);
        rates.put("ARS", 1400.0);
        assertEquals("\u206640,000\u2069 أوقية · \u206660,000\u2069 سيفا", BalanceLine.local("140000.00", "ARS", rates));
        assertEquals("\u206640,000\u2069 أوقية · \u206660,000\u2069 سيفا", BalanceLine.local("100", "USD", rates));
        assertEquals("", BalanceLine.local("100", "EUR", rates)); // its rate unknown
        assertEquals("", BalanceLine.local("0.00", "ARS", rates));
        rates.remove("SIFA");
        assertEquals("\u206640,000\u2069 أوقية", BalanceLine.local("100", "USD", rates));
    }
}
