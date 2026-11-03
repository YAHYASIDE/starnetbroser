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
}
