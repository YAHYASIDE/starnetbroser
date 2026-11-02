package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DeviceCardRouteTest {

    @Test
    public void theEmailFirstThenTheName() {
        assertEquals("/?q=fake.user%40outlook.com", DeviceCardRoute.of(" fake.user@outlook.com ", "Roof"));
        assertEquals("/?q=Roof%20house", DeviceCardRoute.of("", "Roof house"));
        assertEquals("/", DeviceCardRoute.of(null, null));
    }

    @Test
    public void anArabicNameIsEncodedAndTheRouteStaysShort() {
        String route = DeviceCardRoute.of(null, "منزل");
        assertTrue(route.startsWith("/?q=%D9%85"));
        StringBuilder long_ = new StringBuilder();
        for (int i = 0; i < 300; i++) long_.append('a');
        assertTrue(DeviceCardRoute.of(long_.toString(), null).length() <= 200);
    }
}
