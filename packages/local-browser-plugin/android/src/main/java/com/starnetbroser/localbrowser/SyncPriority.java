package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Which devices the background sync visits, and how often - with ~200 devices a full pass takes
 * hours (SyncPacing keeps the pace polite), so only the devices that matter are synced
 * automatically, by how close they are to their renewal date:
 *
 *   up to 3 days past the date, not yet seen stopped   every 2 hours  (did it stop? was it renewed?)
 *   1 day left                                         every 6 hours
 *   2-3 days left                                      every 12 hours
 *   4-7 days left                                      once a day
 *   already stopped (suspended/canceled), within 7 days past the date   once a day
 *   everything else, or no known date                  never automatically (card "تحديث" only)
 *
 * Pure logic (no Android types) - unit-tested in SyncPriorityTest.
 */
final class SyncPriority {

    static final long HOUR_MS = 3_600_000L;
    /** A device counts as due slightly early, so a run that starts a few minutes before the mark
     * doesn't skip it until the next one. */
    static final long DUE_SLACK_MS = 10 * 60_000L;

    private SyncPriority() {
    }

    static boolean isStopped(String serviceStatus) {
        return "suspended".equals(serviceStatus) || "canceled".equals(serviceStatus);
    }

    /** Days from the civil date to 1970-01-01 (proleptic Gregorian) - no java.time needed. */
    static long epochDay(int year, int month, int day) {
        long y = month <= 2 ? year - 1 : year;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long mp = (month + 9) % 12;
        long doy = (153 * mp + 2) / 5 + day - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    /** "2026/09/28" or "2026-09-28" (as the app and Starlink sync store them); null when missing
     * or unreadable. */
    static Long parseEpochDay(String date) {
        if (date == null) return null;
        String[] parts = date.trim().split("[/-]");
        if (parts.length != 3) return null;
        try {
            int y = Integer.parseInt(parts[0].trim());
            int m = Integer.parseInt(parts[1].trim());
            int d = Integer.parseInt(parts[2].trim());
            if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
            return epochDay(y, m, d);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** How often (hours) this device is synced automatically; 0 = never automatically. */
    static int refreshHours(String renewalDate, String serviceStatus, long todayEpochDay) {
        Long date = parseEpochDay(renewalDate);
        if (date == null) return 0;
        long days = date - todayEpochDay;
        if (isStopped(serviceStatus)) return days >= -7 ? 24 : 0;
        if (days < -3) return 0;
        if (days <= 0) return 2;
        if (days == 1) return 6;
        if (days <= 3) return 12;
        if (days <= 7) return 24;
        return 0;
    }

    /** Renewal dates only move forward (a renewal, in the app or on Starlink) - the later of the
     * app's date and the date the last visit read wins; either alone when the other is unknown. */
    static String laterDate(String appDate, String pageDate) {
        Long a = parseEpochDay(appDate);
        Long p = parseEpochDay(pageDate);
        if (a == null) return p == null ? null : pageDate;
        if (p == null) return appDate;
        return p > a ? pageDate : appDate;
    }

    /** The status the last visit read, when that visit came after the app last sent its list;
     * otherwise the app's own. */
    static String currentStatus(String appStatus, String pageStatus, long visitedAt, long listPushedAt) {
        if (pageStatus != null && visitedAt > listPushedAt) return pageStatus;
        return appStatus != null ? appStatus : pageStatus;
    }

    static final class Candidate {
        final String accountId;
        final int refreshHours;
        final long lastSyncedAt;

        Candidate(String accountId, int refreshHours, long lastSyncedAt) {
            this.accountId = accountId;
            this.refreshHours = refreshHours;
            this.lastSyncedAt = lastSyncedAt;
        }
    }

    /**
     * The devices to visit, most urgent first (shortest refresh interval, then longest since its
     * last visit). A scheduled run takes only the ones that are due; "مزامنة الآن" takes every
     * important device, due or not.
     */
    static List<String> order(List<Candidate> candidates, long now, boolean onlyDue) {
        List<Candidate> picked = new ArrayList<>();
        for (Candidate c : candidates) {
            if (c.refreshHours <= 0) continue;
            boolean due = now - c.lastSyncedAt >= c.refreshHours * HOUR_MS - DUE_SLACK_MS;
            if (!onlyDue || due) picked.add(c);
        }
        Collections.sort(picked, (a, b) -> {
            if (a.refreshHours != b.refreshHours) return Integer.compare(a.refreshHours, b.refreshHours);
            return Long.compare(a.lastSyncedAt, b.lastSyncedAt);
        });
        List<String> ids = new ArrayList<>();
        for (Candidate c : picked) ids.add(c.accountId);
        return ids;
    }
}
