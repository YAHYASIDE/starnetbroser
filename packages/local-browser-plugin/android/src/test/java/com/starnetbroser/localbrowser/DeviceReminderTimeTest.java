package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

public class DeviceReminderTimeTest {

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    private static long at(int year, int month0, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(UTC);
        c.clear();
        c.set(year, month0, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    @Test
    public void quickTimes() {
        long now = at(2026, 9, 30, 21, 13);
        assertEquals(now + 3_600_000L, DeviceReminderTime.quick(0, now, UTC));
        assertEquals(now + 3 * 3_600_000L, DeviceReminderTime.quick(1, now, UTC));
        assertEquals(at(2026, 9, 31, 9, 0), DeviceReminderTime.quick(2, now, UTC));
        assertEquals(at(2026, 10, 1, 9, 0), DeviceReminderTime.quick(3, now, UTC));
    }

    @Test
    public void aPickedTimeMustBeLater() {
        long now = at(2026, 9, 30, 21, 13);
        assertEquals(Long.valueOf(at(2026, 10, 2, 8, 30)), DeviceReminderTime.picked(now, UTC, 2026, 10, 2, 8, 30));
        assertNull(DeviceReminderTime.picked(now, UTC, 2026, 9, 30, 21, 0));
    }

    @Test
    public void theNotificationAndWhereItOpens() {
        assertEquals("⏰ DEMO 3\nادفع الفاتورة", DeviceReminderTime.notificationText(" DEMO 3 ", " ادفع الفاتورة "));
        assertEquals("⏰ جهاز\nتذكير بهذا الجهاز", DeviceReminderTime.notificationText("", null));
        assertEquals("/?q=DEMO%203", DeviceReminderTime.route("DEMO 3"));
        assertEquals("/", DeviceReminderTime.route(" "));
    }
}
