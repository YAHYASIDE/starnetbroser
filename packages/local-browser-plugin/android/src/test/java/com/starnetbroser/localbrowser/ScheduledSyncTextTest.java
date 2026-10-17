package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class ScheduledSyncTextTest {

    @Test
    public void paymentResultFromWhatWasRead() {
        assertEquals(ScheduledSyncText.UNPAID, ScheduledSyncText.paymentResult("ok", true, false, null));
        assertEquals(ScheduledSyncText.UNPAID, ScheduledSyncText.paymentResult("ok", false, true, "HNL 266.25"));
        assertEquals(ScheduledSyncText.PAID, ScheduledSyncText.paymentResult("ok", false, true, "0.00"));
        assertEquals(ScheduledSyncText.PAID, ScheduledSyncText.paymentResult("ok", false, true, null));
        assertEquals(ScheduledSyncText.UNKNOWN, ScheduledSyncText.paymentResult("ok", false, false, null));
        assertEquals(ScheduledSyncText.UNKNOWN, ScheduledSyncText.paymentResult("signedOut", true, false, null));
    }

    @Test
    public void paymentReportListsTheUnpaidFirst() {
        String text = ScheduledSyncText.paymentReport(
            Arrays.asList("A", "B", "C"),
            Arrays.asList(ScheduledSyncText.PAID, ScheduledSyncText.UNPAID, ScheduledSyncText.UNKNOWN),
            Arrays.asList("ok", "ok", "signedOut"));
        assertTrue(text, text.contains("✓ دُفع: 1 · ⛔ لم يُدفع: 1 · ❔ لم يُعرف: 1"));
        assertTrue(text, text.indexOf("⛔ B") < text.indexOf("❔ C") && text.indexOf("❔ C") < text.indexOf("✓ A"));
        assertTrue(text, text.contains("ادفع"));
    }

    @Test
    public void nightSummaryCountsEachDevicesLastTry() {
        String text = ScheduledSyncText.nightSummary(
            Arrays.asList("A", "B", "A", "C", "D", "B"),
            Arrays.asList("stuck", "signedOut", "ok", "rateLimited", "nothing", "closed"),
            Collections.singletonList("E"));
        assertTrue(text, text.contains("✓ تمت مزامنة 1 من 4 جهاز"));
        assertTrue(text, text.contains("🔑 خرجت جلسته - افتحه وسجّل الدخول (1): B"));
        assertTrue(text, text.contains("⚠️ لم يُقرأ (1): D"));
        assertTrue(text, text.contains("⏸ أوقفته ستارلينك (429) (1): C"));
        assertTrue(text, text.contains("⛔ متوقف الآن (1): E"));
    }

    @Test
    public void aQuietDay() {
        String text = ScheduledSyncText.nightSummary(Collections.emptyList(), Collections.emptyList(), null);
        assertTrue(text, text.contains("لم تتم أي مزامنة اليوم"));
    }

    @Test
    public void retryNoteInMinutes() {
        assertEquals("🔁 سأكمل الأجهزة الباقية (3) وحدي بعد 21 دقيقة.", ScheduledSyncText.retryNote(3, 21 * 60_000L));
    }
}
