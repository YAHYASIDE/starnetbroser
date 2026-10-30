package com.starnetbroser.localbrowser;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * ⏰ «تذكير» in a device's browser (his Oct 30 2026 ask, beside 📌): the quick times, the ready notes and the
 * notification's words. Pure (no android.*) so it is JUnit-tested.
 */
final class DeviceReminderTime {

    private DeviceReminderTime() {}

    /** The quick choices, in order. */
    static final String[] QUICK_LABELS = {"بعد ساعة", "بعد 3 ساعات", "غدًا 9 صباحًا", "بعد يومين"};

    /** His ready notes (tapped into the note field). */
    static final String[] READY_NOTES = {"ادفع الفاتورة", "تأكد من الدفع", "تابع الزبون", "زامن الجهاز"};

    /** When quick choice `index` rings, from `now`. */
    static long quick(int index, long now, TimeZone zone) {
        switch (index) {
            case 0:
                return now + 60L * 60_000L;
            case 1:
                return now + 3L * 60L * 60_000L;
            case 2:
                return dayAt(now, zone, 1, 9, 0);
            default:
                return dayAt(now, zone, 2, 9, 0);
        }
    }

    /** `days` days from today at hour:minute. */
    static long dayAt(long now, TimeZone zone, int days, int hour, int minute) {
        Calendar c = Calendar.getInstance(zone);
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_MONTH, days);
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** A picked date + time; null when it is not in the future. */
    static Long picked(long now, TimeZone zone, int year, int month0, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(zone);
        c.clear();
        c.set(year, month0, day, hour, minute, 0);
        long at = c.getTimeInMillis();
        return at > now ? at : null;
    }

    /** «⏰ <device>» then the note (or a plain line) - first line = the notification's title. */
    static String notificationText(String device, String note) {
        String name = device == null || device.trim().isEmpty() ? "جهاز" : device.trim();
        String body = note == null || note.trim().isEmpty() ? "تذكير بهذا الجهاز" : note.trim();
        return "⏰ " + name + "\n" + body;
    }

    /** The app's home searched on the device (a tap on the notification). */
    static String route(String device) {
        if (device == null || device.trim().isEmpty()) return "/";
        try {
            return "/?q=" + java.net.URLEncoder.encode(device.trim(), "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return "/";
        }
    }
}
