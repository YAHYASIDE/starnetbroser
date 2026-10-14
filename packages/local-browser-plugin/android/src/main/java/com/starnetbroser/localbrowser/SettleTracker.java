package com.starnetbroser.localbrowser;

/**
 * "Read until the page has settled" for a sync step, instead of one read after a fixed wait.
 *
 * Starlink's pages are rendered in the browser: right after a tap the page is still empty or
 * half-filled, and a fixed wait is either too long (slow sync) or too short (a field missing, a dot
 * still gray). So the step reads the page every poll and stops as soon as the same non-empty result
 * came back {@code stableReads} times in a row - and it is "good" (e.g. a dot has its color) - but
 * never before {@code minMs} (Home's banners appear a moment after the page) and never after
 * {@code maxMs} (then the last non-empty read is kept). Pure, so it is unit-tested.
 */
final class SettleTracker {
    private final long minMs;
    private final long maxMs;
    private final int stableReads;
    private String last = "";
    private int streak = 0;
    private String best = "";

    SettleTracker(long minMs, long maxMs, int stableReads) {
        this.minMs = minMs;
        this.maxMs = Math.max(minMs, maxMs);
        this.stableReads = Math.max(1, stableReads);
    }

    /**
     * One read of the page. {@code key} is the read's comparable form ("" when nothing was found),
     * {@code good} whether it is complete enough to stop on. Returns true when the step is done.
     */
    boolean offer(String key, boolean good, long elapsedMs) {
        String value = key == null ? "" : key;
        if (value.isEmpty()) {
            streak = 0;
        } else {
            streak = value.equals(last) ? streak + 1 : 1;
            best = value;
        }
        last = value;
        if (elapsedMs >= maxMs) return true;
        return elapsedMs >= minMs && good && streak >= stableReads;
    }

    /** The read to keep: the last non-empty one ("" when the page never showed anything). */
    String best() {
        return best;
    }
}
