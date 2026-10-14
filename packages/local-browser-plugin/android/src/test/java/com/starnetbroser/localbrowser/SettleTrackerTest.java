package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SettleTrackerTest {
    @Test
    public void stopsAsSoonAsTheSameReadComesBackTwice() {
        SettleTracker t = new SettleTracker(0, 6000, 2);
        assertFalse(t.offer("", true, 0)); // page still empty
        assertFalse(t.offer("{\"plan\":\"A\"}", true, 500)); // first content
        assertTrue(t.offer("{\"plan\":\"A\"}", true, 1000)); // same again: settled at 1s, not 6s
        assertEquals("{\"plan\":\"A\"}", t.best());
    }

    @Test
    public void aChangingPageKeepsBeingRead() {
        SettleTracker t = new SettleTracker(0, 6000, 2);
        assertFalse(t.offer("{\"a\":1}", true, 500));
        assertFalse(t.offer("{\"a\":1,\"b\":2}", true, 1000)); // more fields arrived
        assertTrue(t.offer("{\"a\":1,\"b\":2}", true, 1500));
        assertEquals("{\"a\":1,\"b\":2}", t.best());
    }

    @Test
    public void waitsForTheMinimumAndForAGoodRead() {
        SettleTracker home = new SettleTracker(3000, 8000, 2);
        assertFalse(home.offer("{\"x\":1}", true, 500));
        assertFalse(home.offer("{\"x\":1}", true, 1000)); // stable but before the minimum (banners)
        assertTrue(home.offer("{\"x\":1}", true, 3000));

        SettleTracker dots = new SettleTracker(0, 6000, 2);
        assertFalse(dots.offer("{\"dish\":\"unknown\"}", false, 500));
        assertFalse(dots.offer("{\"dish\":\"unknown\"}", false, 1000)); // gray dot: not good yet
        assertTrue(dots.offer("{\"dish\":\"online\"}", true, 1500) || dots.offer("{\"dish\":\"online\"}", true, 2000));
    }

    @Test
    public void givesUpAtTheMaximumKeepingTheLastContent() {
        SettleTracker t = new SettleTracker(0, 2000, 2);
        assertFalse(t.offer("{\"a\":1}", false, 500));
        assertFalse(t.offer("", false, 1500)); // page went blank (navigating)
        assertTrue(t.offer("", false, 2000));
        assertEquals("{\"a\":1}", t.best());
    }
}
