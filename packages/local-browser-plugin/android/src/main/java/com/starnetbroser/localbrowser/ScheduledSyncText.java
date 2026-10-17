package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ⏰ The bot messages of the scheduled syncs (ScheduledSyncPlan): the 💳 payment check's report,
 * the 🔁 retry note after a 429 and the 🌙 night summary of the day's syncs. Pure (no Android).
 */
final class ScheduledSyncText {

    static final String PAID = "paid";
    static final String UNPAID = "unpaid";
    static final String UNKNOWN = "unknown";

    private static final int MAX_NAMES = 25;

    private ScheduledSyncText() {
    }

    /** A payment check's result from what the sync read: a stopped device or money still due on
     * Billing = not paid; an active device with nothing due = paid; anything else isn't known. */
    static String paymentResult(String outcome, boolean sawStopped, boolean sawActive, String balanceDue) {
        if (!"ok".equals(outcome)) return UNKNOWN;
        if (sawStopped) return UNPAID;
        Double due = parseAmount(balanceDue);
        if (due != null && due > 0.004) return UNPAID;
        if (sawActive) return PAID;
        return UNKNOWN;
    }

    private static Double parseAmount(String value) {
        if (value == null) return null;
        String digits = value.replaceAll("[^0-9.]", "");
        if (digits.isEmpty()) return null;
        try {
            return Double.parseDouble(digits);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** «💳 فحص الدفع بعد التجديد»: one line per device, the unpaid ones first. */
    static String paymentReport(List<String> names, List<String> results, List<String> outcomes) {
        List<String> unpaid = new ArrayList<>();
        List<String> paid = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i) == null || names.get(i).isEmpty() ? "جهاز" : names.get(i);
            String result = i < results.size() ? results.get(i) : UNKNOWN;
            if (UNPAID.equals(result)) unpaid.add("⛔ " + name + " - لم يُدفع (متوقف أو عليه رصيد)");
            else if (PAID.equals(result)) paid.add("✓ " + name + " - تمّ الدفع");
            else unknown.add("❔ " + name + " - " + BackgroundSyncReport.label(i < outcomes.size() ? outcomes.get(i) : "nothing"));
        }
        StringBuilder text = new StringBuilder("💳 فحص الدفع بعد التجديد (أجهزة الأمس)");
        text.append("\n✓ دُفع: ").append(paid.size()).append(" · ⛔ لم يُدفع: ").append(unpaid.size());
        if (!unknown.isEmpty()) text.append(" · ❔ لم يُعرف: ").append(unknown.size());
        for (List<String> group : java.util.Arrays.asList(unpaid, unknown, paid)) {
            for (String line : group) text.append("\n").append(line);
        }
        if (!unpaid.isEmpty()) text.append("\n\nادفع للأجهزة ⛔ أو تواصل مع أصحابها.");
        return text.toString();
    }

    /** 🔁 Added to a run's report when the rest is retried by itself after the cooldown. */
    static String retryNote(int devices, long delayMs) {
        long minutes = Math.max(1, (delayMs + 59_999) / 60_000);
        return "🔁 سأكمل الأجهزة الباقية (" + devices + ") وحدي بعد " + minutes + " دقيقة.";
    }

    /** 🔁 The retries were used up: he decides. */
    static final String RETRIES_USED = "⏸ ستارلينك ما زالت تطلب التمهّل - أوقفت الإكمال التلقائي. أعد «مزامنة الآن» لاحقًا.";

    /**
     * 🌙 «ملخص المزامنة آخر الليل»: every device synced today, by how its last try ended.
     * `names` / `outcomes` are the day's log, oldest first (a device may appear several times - its
     * last try counts).
     */
    static String nightSummary(List<String> names, List<String> outcomes, List<String> stoppedNow) {
        Map<String, String> last = new LinkedHashMap<>();
        for (int i = 0; i < names.size() && i < outcomes.size(); i++) {
            String outcome = outcomes.get(i);
            // A device closed by hand keeps an earlier real result.
            if ("closed".equals(outcome) && last.containsKey(names.get(i))) continue;
            last.remove(names.get(i));
            last.put(names.get(i), outcome);
        }
        StringBuilder text = new StringBuilder("🌙 ملخص المزامنة اليوم - STAR NET");
        if (last.isEmpty()) {
            text.append("\nلم تتم أي مزامنة اليوم.");
        } else {
            List<String> ok = new ArrayList<>();
            List<String> signedOut = new ArrayList<>();
            List<String> unread = new ArrayList<>();
            List<String> limited = new ArrayList<>();
            for (Map.Entry<String, String> entry : last.entrySet()) {
                String outcome = entry.getValue();
                if ("ok".equals(outcome)) ok.add(entry.getKey());
                else if ("signedOut".equals(outcome)) signedOut.add(entry.getKey());
                else if ("rateLimited".equals(outcome)) limited.add(entry.getKey());
                else if (!"closed".equals(outcome)) unread.add(entry.getKey());
            }
            text.append("\n✓ تمت مزامنة ").append(ok.size()).append(" من ").append(last.size()).append(" جهاز");
            appendNames(text, "🔑 خرجت جلسته - افتحه وسجّل الدخول", signedOut);
            appendNames(text, "⚠️ لم يُقرأ", unread);
            appendNames(text, "⏸ أوقفته ستارلينك (429)", limited);
        }
        if (stoppedNow != null && !stoppedNow.isEmpty()) appendNames(text, "⛔ متوقف الآن", stoppedNow);
        return text.toString();
    }

    private static void appendNames(StringBuilder text, String title, List<String> names) {
        if (names.isEmpty()) return;
        text.append("\n").append(title).append(" (").append(names.size()).append("): ");
        int shown = Math.min(names.size(), MAX_NAMES);
        text.append(String.join("، ", names.subList(0, shown)));
        if (names.size() > shown) text.append(" و").append(names.size() - shown).append(" غيرها");
    }
}
