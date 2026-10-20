package com.starnetbroser.localbrowser;

/**
 * ⏳ The result of one invoice check after a charge (ScheduledSyncWorker KIND_BILL, web
 * lib/awaitingBill.ts) - only the result, never «✅ تمت» (his Oct 20 2026 choice: the «تمت» of each check
 * read as if something had happened). The run's label carries the wait until the next check:
 * "LABEL|ms". Pure, no android.* - JUnit: BillCheckTextTest.
 */
final class BillCheckText {

    static final String LABEL = "⏳ فحص الفاتورة بعد الشحن";

    private BillCheckText() {}

    /** The run label of a check followed by another one `nextMs` later (-1 = the last check). */
    static String label(long nextMs) {
        return LABEL + "|" + nextMs;
    }

    static boolean isBillLabel(String label) {
        return label != null && label.startsWith(LABEL);
    }

    static long nextMs(String label) {
        if (label == null) return -1;
        int bar = label.lastIndexOf('|');
        if (bar < 0) return -1;
        try {
            return Long.parseLong(label.substring(bar + 1).trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** Starlink asks money now (the invoice came down). */
    static boolean billCame(String outcome, String balanceDue) {
        if (!"ok".equals(outcome) || balanceDue == null) return false;
        String digits = balanceDue.replace(",", "").replaceAll("[^0-9.]", "");
        if (digits.isEmpty()) return false;
        try {
            return Double.parseDouble(digits) > 0.004;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** One device's line. */
    static String line(String name, String outcome, String balanceDue, long nextMs) {
        String who = "«" + (name == null || name.isEmpty() ? "جهاز" : name) + "»";
        if (billCame(outcome, balanceDue)) {
            return "⏳ نزلت فاتورة " + who + ": " + balanceDue.trim() + " - افتح STAR NET لتُسجَّل D";
        }
        String head = "ok".equals(outcome)
            ? "⏳ " + who + ": الفاتورة لم تنزل بعد"
            : "⏳ " + who + ": لم يُفحص (" + BackgroundSyncReport.label(outcome) + ")";
        return head + (nextMs > 0 ? " - الفحص التالي بعد " + duration(nextMs) : " - انتهت الفحوص؛ يُملأ D في أي مزامنة عادية");
    }

    /** «30 دقيقة» / «ساعة» / «ساعتين» / «4 ساعات» / «12 ساعة». */
    static String duration(long ms) {
        long minutes = Math.round(ms / 60_000.0);
        if (minutes < 60) return minutes + " دقيقة";
        long hours = Math.round(minutes / 60.0);
        if (hours == 1) return "ساعة";
        if (hours == 2) return "ساعتين";
        if (hours <= 10) return hours + " ساعات";
        return hours + " ساعة";
    }
}
