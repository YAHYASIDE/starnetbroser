package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class RouteOnceTest {

    @Test
    public void aNotificationsPageOpensOnceNeverAgainAfterTheAppIsRebuilt() {
        List<String> opened = new ArrayList<>();
        assertTrue(RouteOnce.shouldOpen("/starlink", "n7-1", false, opened));
        opened = RouteOnce.remember(opened, "n7-1");
        // Android killed the app; he came back: the same launch intent → nothing opens.
        assertFalse(RouteOnce.shouldOpen("/starlink", "n7-1", false, opened));
        // A new notification of the same page opens it.
        assertTrue(RouteOnce.shouldOpen("/starlink", "n8-2", false, opened));
    }

    @Test
    public void neverFromTheRecentsListAndAPinnedShortcutStillWorks() {
        assertFalse(RouteOnce.shouldOpen("/starlink", "n1", true, Collections.emptyList()));
        assertFalse(RouteOnce.shouldOpen("/reports", null, true, Collections.emptyList()));
        assertTrue("a 📌 shortcut has no id", RouteOnce.shouldOpen("/reports", null, false, Arrays.asList("x")));
        assertFalse(RouteOnce.shouldOpen(null, "n1", false, Collections.emptyList()));
    }

    @Test
    public void keepsTheLastFortyIds() {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 45; i++) ids = RouteOnce.remember(ids, "n" + i);
        assertEquals(RouteOnce.KEEP, ids.size());
        assertEquals("n5", ids.get(0));
        assertEquals(ids, RouteOnce.decode(RouteOnce.encode(ids)));
        assertEquals(Collections.emptyList(), RouteOnce.decode(null));
    }
}
