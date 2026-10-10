package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class SyncPriorityTest {

    private static final long TODAY = SyncPriority.epochDay(2026, 9, 27);

    private static String inDays(int days) {
        // Builds the date string for TODAY + days by walking the calendar the slow, obvious way.
        for (int y = 2026; y <= 2027; y++) {
            for (int m = 1; m <= 12; m++) {
                for (int d = 1; d <= 31; d++) {
                    if (SyncPriority.epochDay(y, m, d) == TODAY + days) {
                        return String.format("%d/%02d/%02d", y, m, d);
                    }
                }
            }
        }
        throw new AssertionError();
    }

    @Test
    public void epochDayMatchesKnownDates() {
        assertEquals(0, SyncPriority.epochDay(1970, 1, 1));
        assertEquals(20723, SyncPriority.epochDay(2026, 9, 27));
        assertEquals(SyncPriority.epochDay(2026, 3, 1) - 1, SyncPriority.epochDay(2026, 2, 28));
        assertEquals(SyncPriority.epochDay(2028, 3, 1) - 2, SyncPriority.epochDay(2028, 2, 28));
    }

    @Test
    public void parsesBothDateFormatsAndRejectsJunk() {
        assertEquals(Long.valueOf(TODAY), SyncPriority.parseEpochDay("2026/09/27"));
        assertEquals(Long.valueOf(TODAY), SyncPriority.parseEpochDay("2026-09-27"));
        assertNull(SyncPriority.parseEpochDay(""));
        assertNull(SyncPriority.parseEpochDay(null));
        assertNull(SyncPriority.parseEpochDay("قريباً"));
        assertNull(SyncPriority.parseEpochDay("2026/13/01"));
    }

    @Test
    public void refreshFollowsTheSevenThreeOneDayWindows() {
        assertEquals(0, SyncPriority.refreshHours(inDays(8), "active", TODAY));
        assertEquals(24, SyncPriority.refreshHours(inDays(7), "active", TODAY));
        assertEquals(24, SyncPriority.refreshHours(inDays(4), "active", TODAY));
        assertEquals(12, SyncPriority.refreshHours(inDays(3), "active", TODAY));
        assertEquals(12, SyncPriority.refreshHours(inDays(2), "active", TODAY));
        assertEquals(6, SyncPriority.refreshHours(inDays(1), "active", TODAY));
        assertEquals(2, SyncPriority.refreshHours(inDays(0), "active", TODAY));
        assertEquals(2, SyncPriority.refreshHours(inDays(-3), null, TODAY));
        assertEquals(0, SyncPriority.refreshHours(inDays(-4), "active", TODAY));
        assertEquals(0, SyncPriority.refreshHours(null, "active", TODAY));
    }

    @Test
    public void aStoppedDeviceIsCheckedDailyForAWeekThenLeftAlone() {
        assertTrue(SyncPriority.isStopped("suspended"));
        assertTrue(SyncPriority.isStopped("canceled"));
        assertFalse(SyncPriority.isStopped("active"));
        assertEquals(24, SyncPriority.refreshHours(inDays(0), "suspended", TODAY));
        assertEquals(24, SyncPriority.refreshHours(inDays(-7), "canceled", TODAY));
        assertEquals(0, SyncPriority.refreshHours(inDays(-8), "suspended", TODAY));
    }

    @Test
    public void theLaterRenewalDateAndTheNewerStatusWin() {
        assertEquals("2026/10/27", SyncPriority.laterDate("2026/09/27", "2026/10/27"));
        assertEquals("2026/10/27", SyncPriority.laterDate("2026/10/27", "2026-09-27"));
        assertEquals("2026/09/27", SyncPriority.laterDate(null, "2026/09/27"));
        assertEquals("2026/09/27", SyncPriority.laterDate("2026/09/27", "junk"));
        assertNull(SyncPriority.laterDate(null, null));
        assertEquals("suspended", SyncPriority.currentStatus("active", "suspended", 200, 100));
        assertEquals("active", SyncPriority.currentStatus("active", "suspended", 50, 100));
        assertEquals("suspended", SyncPriority.currentStatus(null, "suspended", 50, 100));
    }

    @Test
    public void ordersMostUrgentFirstAndSkipsWhatIsNotDue() {
        long now = 100 * SyncPriority.HOUR_MS;
        List<SyncPriority.Candidate> list = Arrays.asList(
            new SyncPriority.Candidate("weekly-stale", 24, now - 30 * SyncPriority.HOUR_MS),
            new SyncPriority.Candidate("urgent-fresh", 2, now - SyncPriority.HOUR_MS),
            new SyncPriority.Candidate("urgent-old", 2, now - 5 * SyncPriority.HOUR_MS),
            new SyncPriority.Candidate("urgent-older", 2, 0),
            new SyncPriority.Candidate("manual-only", 0, 0),
            new SyncPriority.Candidate("tomorrow-nearly-due", 6, now - 6 * SyncPriority.HOUR_MS + 5 * 60_000)
        );
        assertEquals(
            Arrays.asList("urgent-older", "urgent-old", "tomorrow-nearly-due", "weekly-stale"),
            SyncPriority.order(list, now, true)
        );
        assertEquals(
            Arrays.asList("urgent-older", "urgent-old", "urgent-fresh", "tomorrow-nearly-due", "weekly-stale"),
            SyncPriority.order(list, now, false)
        );
    }
}
