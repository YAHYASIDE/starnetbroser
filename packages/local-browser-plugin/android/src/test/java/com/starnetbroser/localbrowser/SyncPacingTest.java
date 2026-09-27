package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Random;
import org.junit.Test;

public class SyncPacingTest {

    @Test
    public void gapIsAlwaysBetweenFifteenAndTwentyFiveSeconds() {
        Random random = new Random(42);
        for (int i = 0; i < 200; i++) {
            long gap = SyncPacing.gapMs(random);
            assertTrue(gap >= 15_000 && gap < 25_000);
        }
    }

    @Test
    public void cooldownLastsTwentyMinutesAfterA429() {
        long at = 1_000_000L;
        assertFalse(SyncPacing.inCooldown(0, at));
        assertTrue(SyncPacing.inCooldown(at, at + 60_000));
        assertTrue(SyncPacing.inCooldown(at, at + 19 * 60_000));
        assertFalse(SyncPacing.inCooldown(at, at + 20 * 60_000));
        // A clock that went backwards never locks syncing forever.
        assertFalse(SyncPacing.inCooldown(at, at - 5_000));
    }

    @Test
    public void runStopsStartingAccountsAfterEightMinutes() {
        assertTrue(SyncPacing.hasTimeForAnother(0, 7 * 60_000));
        assertFalse(SyncPacing.hasTimeForAnother(0, 8 * 60_000));
    }

    @Test
    public void rotatesToContinueAfterTheLastSyncedAccount() {
        List<String> ids = Arrays.asList("a", "b", "c", "d");
        assertEquals(Arrays.asList("c", "d", "a", "b"), SyncPacing.rotate(ids, ids, "b"));
        assertEquals(Arrays.asList("a", "b", "c", "d"), SyncPacing.rotate(ids, ids, "d"));
        assertEquals(Arrays.asList("a", "b", "c", "d"), SyncPacing.rotate(ids, ids, null));
        assertEquals(Arrays.asList("a", "b", "c", "d"), SyncPacing.rotate(ids, ids, "gone"));
    }
}
