package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;

public class SyncStateStoreTest {

    @Test
    public void roundTripsEveryDevice() {
        Map<String, SyncStateStore.State> states = new LinkedHashMap<>();
        states.put("acc-1", new SyncStateStore.State(1000L, "suspended", "2026/09/27"));
        states.put("acc-2", new SyncStateStore.State(2000L, null, null));
        Map<String, SyncStateStore.State> back = SyncStateStore.decode(SyncStateStore.encode(states));
        assertEquals(2, back.size());
        assertEquals(1000L, back.get("acc-1").visitedAt);
        assertEquals("suspended", back.get("acc-1").serviceStatus);
        assertEquals("2026/09/27", back.get("acc-1").renewalDate);
        assertNull(back.get("acc-2").serviceStatus);
        assertNull(back.get("acc-2").renewalDate);
    }

    @Test
    public void unreadableStorageReadsAsNothingKnown() {
        assertTrue(SyncStateStore.decode(null).isEmpty());
        assertTrue(SyncStateStore.decode("garbage").isEmpty());
        assertEquals(1, SyncStateStore.decode("x\tnot-a-number\ta\tb\nok\t5\t\t\n").size());
    }

    @Test
    public void aVisitKeepsKnownValuesThePageDidNotShow() {
        SyncStateStore.State before = new SyncStateStore.State(1L, "active", "2026/10/01");
        SyncStateStore.State empty = SyncStateStore.afterVisit(before, 9L, null, "");
        assertEquals(9L, empty.visitedAt);
        assertEquals("active", empty.serviceStatus);
        assertEquals("2026/10/01", empty.renewalDate);
        SyncStateStore.State stopped = SyncStateStore.afterVisit(before, 10L, "suspended", null);
        assertEquals("suspended", stopped.serviceStatus);
        assertEquals("2026/10/01", stopped.renewalDate);
        assertNull(SyncStateStore.afterVisit(null, 1L, null, null).serviceStatus);
    }
}
