package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class CancelProgressTest {

    @Test
    public void theConfirmedStepsRunThroughWithoutStopping() {
        CancelProgress p = new CancelProgress();
        for (String a : new String[] {"manage", "wait", "cancel-service", "open-reason", "pick-reason", "type-reason", "continue",
            "continue-plans", "confirm", "wait", "done:2026/10/09"}) {
            assertNull(a, p.onAnswer(a));
        }
        assertEquals("2026/10/09", CancelProgress.doneDate("done:2026/10/09"));
        assertEquals("", CancelProgress.doneDate("done:"));
        assertNull(CancelProgress.doneDate("confirm"));
    }

    @Test
    public void theSamePressThatDoesNotMoveThePageOnStops() {
        CancelProgress p = new CancelProgress();
        for (int i = 0; i < CancelProgress.MAX_SAME_PRESS; i++) assertNull(p.onAnswer("confirm"));
        assertNotNull(p.onAnswer("confirm"));
    }

    @Test
    public void anUnknownPageOrEndlessWaitingStops() {
        CancelProgress p = new CancelProgress();
        for (int i = 1; i < CancelProgress.MAX_UNKNOWN; i++) assertNull(p.onAnswer("unknown"));
        assertNotNull(p.onAnswer("unknown"));
        CancelProgress w = new CancelProgress();
        for (int i = 1; i < CancelProgress.MAX_WAITS; i++) assertNull(w.onAnswer("wait"));
        assertNotNull(w.onAnswer("wait"));
        // A press in between starts the count again.
        CancelProgress r = new CancelProgress();
        for (int i = 1; i < CancelProgress.MAX_UNKNOWN; i++) assertNull(r.onAnswer("unknown"));
        assertNull(r.onAnswer("manage"));
        assertNull(r.onAnswer("unknown"));
    }
}
