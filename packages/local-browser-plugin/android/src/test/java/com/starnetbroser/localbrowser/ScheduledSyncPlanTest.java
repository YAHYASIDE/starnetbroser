package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;
import org.junit.Test;

public class ScheduledSyncPlanTest {

    /** Oct 17 2026 */
    private static final long TODAY = SyncPriority.epochDay(2026, 10, 17);

    private static ScheduledSyncPlan.Device device(String id, String date) {
        return new ScheduledSyncPlan.Device(id, "جهاز " + id, date, false);
    }

    private static List<String> ids(List<ScheduledSyncPlan.Pick> picks) {
        List<String> out = new ArrayList<>();
        for (ScheduledSyncPlan.Pick pick : picks) out.add(pick.accountId + ":" + pick.reason);
        return out;
    }

    @Test
    public void morningTakesYesterdaysPaymentsFirstThenTodayThenTomorrow() {
        List<ScheduledSyncPlan.Device> devices = Arrays.asList(
            device("t1", "2026/10/18"),
            device("a", "2026/10/17"),
            device("p1", "2026/10/16"),
            device("p2", "2026/11/16"),
            device("far", "2026/10/25"),
            device("old", "2026/09/16"),
            device("none", null)
        );
        assertEquals(
            Arrays.asList("p1:payment", "p2:payment", "a:today", "t1:tomorrow"),
            ids(ScheduledSyncPlan.morning(devices, TODAY, true, true))
        );
    }

    @Test
    public void eachChoiceAlone() {
        List<ScheduledSyncPlan.Device> devices = Arrays.asList(device("a", "2026/10/17"), device("p", "2026/10/16"));
        assertEquals(Arrays.asList("a:today"), ids(ScheduledSyncPlan.morning(devices, TODAY, true, false)));
        assertEquals(Arrays.asList("p:payment"), ids(ScheduledSyncPlan.morning(devices, TODAY, false, true)));
        assertTrue(ScheduledSyncPlan.morning(devices, TODAY, false, false).isEmpty());
    }

    @Test
    public void aLimitedEmailIsNeverScheduled() {
        List<ScheduledSyncPlan.Device> devices = Arrays.asList(new ScheduledSyncPlan.Device("x", "", "2026/10/17", true));
        assertTrue(ScheduledSyncPlan.morning(devices, TODAY, true, true).isEmpty());
    }

    @Test
    public void dayOfMonthInvertsEpochDay() {
        assertEquals(17, ScheduledSyncPlan.dayOfMonth(TODAY));
        assertEquals(1, ScheduledSyncPlan.dayOfMonth(SyncPriority.epochDay(2026, 11, 1)));
        assertEquals(29, ScheduledSyncPlan.dayOfMonth(SyncPriority.epochDay(2028, 2, 29)));
        assertEquals(31, ScheduledSyncPlan.dayOfMonth(SyncPriority.epochDay(2026, 12, 31)));
    }

    @Test
    public void delayUntilTheNextHour() {
        Calendar now = Calendar.getInstance();
        now.set(2026, Calendar.OCTOBER, 17, 7, 30, 0);
        now.set(Calendar.MILLISECOND, 0);
        assertEquals(30 * 60_000L, ScheduledSyncPlan.delayUntilHour(now, 8));
        now.set(Calendar.HOUR_OF_DAY, 8);
        now.set(Calendar.MINUTE, 0);
        assertEquals(24 * 3_600_000L, ScheduledSyncPlan.delayUntilHour(now, 8));
    }

    @Test
    public void twoRetriesThenHeDecides() {
        assertTrue(ScheduledSyncPlan.mayRetry(0));
        assertTrue(ScheduledSyncPlan.mayRetry(1));
        assertFalse(ScheduledSyncPlan.mayRetry(2));
        assertEquals(21 * 60_000L, ScheduledSyncPlan.RETRY_DELAY_MS);
    }
}
