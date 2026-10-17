package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * ⏰ «مزامنات مجدولة» (his Oct 17 2026 choices): which devices a scheduled run takes, and when it
 * runs. Pure (no Android) so it's unit-tested.
 *  - 🌅 «صباح أجهزة اليوم»: every morning at his hour (8:00), the devices renewing today and
 *    tomorrow.
 *  - 💳 «فحص الدفع بعد التجديد»: in the same morning run, the devices that renewed yesterday - did
 *    Starlink take the payment, or did the device stop?
 * A faulty device or a limited (non-main) email is never taken (they sync only from their own
 * choice), and each device is taken once - the payment check first.
 */
final class ScheduledSyncPlan {

    static final String PAYMENT = "payment";
    static final String TODAY = "today";
    static final String TOMORROW = "tomorrow";

    private ScheduledSyncPlan() {
    }

    /** What the plan knows of one device. */
    static final class Device {
        final String accountId;
        final String accountName;
        /** The later of the app's date and the last read (SyncPriority.laterDate). */
        final String renewalDate;
        /** A limited (non-main) email - never in a scheduled run. */
        final boolean limited;

        Device(String accountId, String accountName, String renewalDate, boolean limited) {
            this.accountId = accountId;
            this.accountName = accountName != null ? accountName : "";
            this.renewalDate = renewalDate;
            this.limited = limited;
        }
    }

    static final class Pick {
        final String accountId;
        final String accountName;
        /** PAYMENT / TODAY / TOMORROW */
        final String reason;

        Pick(String accountId, String accountName, String reason) {
            this.accountId = accountId;
            this.accountName = accountName;
            this.reason = reason;
        }
    }

    /**
     * The morning run's devices for the day `today` (epoch day): the payment checks first, then
     * today's, then tomorrow's. A device that renewed yesterday still shows yesterday's date until
     * a sync reads the next one - or already shows next month's (same day, 27-32 days later): both
     * are checked.
     */
    static List<Pick> morning(List<Device> devices, long today, boolean renewals, boolean payment) {
        List<Pick> payments = new ArrayList<>();
        List<Pick> todays = new ArrayList<>();
        List<Pick> tomorrows = new ArrayList<>();
        int yesterdayDay = dayOfMonth(today - 1);
        for (Device device : devices) {
            if (device.limited) continue;
            Long date = SyncPriority.parseEpochDay(device.renewalDate);
            if (date == null) continue;
            long ahead = date - (today - 1);
            if (payment && (ahead == 0 || (ahead >= 27 && ahead <= 32 && dayOfMonth(date) == yesterdayDay))) {
                payments.add(new Pick(device.accountId, device.accountName, PAYMENT));
            } else if (renewals && date == today) {
                todays.add(new Pick(device.accountId, device.accountName, TODAY));
            } else if (renewals && date == today + 1) {
                tomorrows.add(new Pick(device.accountId, device.accountName, TOMORROW));
            }
        }
        List<Pick> all = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (List<Pick> group : Arrays.asList(payments, todays, tomorrows)) {
            for (Pick pick : group) {
                if (seen.add(pick.accountId)) all.add(pick);
            }
        }
        return all;
    }

    /** Day of the month (1-31) of an epoch day. */
    static int dayOfMonth(long epochDay) {
        // Inverse of SyncPriority.epochDay (civil-from-days).
        long z = epochDay + 719468;
        long era = (z >= 0 ? z : z - 146096) / 146097;
        long doe = z - era * 146097;
        long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        long mp = (5 * doy + 2) / 153;
        return (int) (doy - (153 * mp + 2) / 5 + 1);
    }

    /** Milliseconds from `now` until the next `hour`:00 (today if still ahead, else tomorrow). */
    static long delayUntilHour(Calendar now, int hour) {
        Calendar at = (Calendar) now.clone();
        at.set(Calendar.HOUR_OF_DAY, hour);
        at.set(Calendar.MINUTE, 0);
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        if (!at.after(now)) at.add(Calendar.DAY_OF_MONTH, 1);
        return at.getTimeInMillis() - now.getTimeInMillis();
    }

    /** 🔁 «إكمال بعد 429»: at most this many automatic retries in a row (then he decides). */
    static final int MAX_RETRIES = 2;
    /** The retry waits out Starlink's cooldown plus a minute. */
    static final long RETRY_DELAY_MS = SyncPacing.COOLDOWN_MS + 60_000;

    static boolean mayRetry(int retriesSoFar) {
        return retriesSoFar < MAX_RETRIES;
    }
}
