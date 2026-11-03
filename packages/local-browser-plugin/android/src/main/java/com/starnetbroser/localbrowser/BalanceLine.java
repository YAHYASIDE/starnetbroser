package com.starnetbroser.localbrowser;

import java.util.Locale;

/**
 * 💰 The line under the device's name in its browser (his Nov 3 2026 ask: «عندما ادخل اي جهاز يقرأ
 * تلقائي رصيد الذي عليه ويكتبه فوق»). BalancePeek reads Billing's «Balance Due» behind the page; this
 * says it in words. Pure (no android.*), JUnit: BalanceLineTest.
 */
final class BalanceLine {

    private BalanceLine() {}

    static final String READING = "💰 يقرأ الرصيد…";
    static final String NOT_READ = "💰 لم يظهر الرصيد - افتح Billing";
    static final String LIMITED = "💰 بريد محدود - لا يظهر فيه الرصيد";

    /** The amount from `balanceDue` ("140000.00"), or null when it isn't a number. */
    static Double amount(String balanceDue) {
        if (balanceDue == null) return null;
        String s = balanceDue.replace(",", "").trim();
        if (s.isEmpty()) return null;
        try {
            double v = Double.parseDouble(s);
            return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** «💰 عليه ARS 140,000.00» / «✓ لا شيء عليه» / «💰 له USD 5.00» (a credit); "" when unreadable. */
    static String text(String balanceDue, String currency) {
        Double v = amount(balanceDue);
        if (v == null) return "";
        String cur = currency == null || currency.trim().isEmpty() ? "" : currency.trim().toUpperCase(Locale.ROOT) + " ";
        String money = "⁦" + cur + String.format(Locale.US, "%,.2f", Math.abs(v)) + "⁩";
        if (Math.abs(v) < 0.005) return "✓ لا شيء عليه";
        return v > 0 ? "💰 عليه " + money : "💰 له " + money;
    }

    /** Red when he owes, green otherwise. */
    static boolean owes(String balanceDue) {
        Double v = amount(balanceDue);
        return v != null && v >= 0.005;
    }
}
