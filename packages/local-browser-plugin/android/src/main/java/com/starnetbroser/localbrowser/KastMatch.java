package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 💳 «رُفض دفع Starlink 9.99$ بالبطاقة 9000» - which device it probably was: the devices whose
 * expected Starlink amount (pushed by the app: the amount due in dollars, else the last Starlink
 * cost) is close to the refused amount, the devices paid with that card first (confirmed by the
 * operator). Only a guess, said as one - nothing is recorded on a device. Pure, unit-tested.
 */
final class KastMatch {

    private KastMatch() {}

    static final class Device {
        final String name;
        final double expectedUsd;
        final String cardLast4;

        Device(String name, double expectedUsd, String cardLast4) {
            this.name = name;
            this.expectedUsd = expectedUsd;
            this.cardLast4 = cardLast4 == null ? "" : cardLast4;
        }
    }

    /** The app's snapshot: [{"name","expectedUsd","cardLast4"}]. Unreadable rows are skipped. */
    static List<Device> parseDevices(String json) {
        List<Device> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray rows = new JSONArray(json);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                double usd = row.optDouble("expectedUsd", Double.NaN);
                String name = row.optString("name", "").trim();
                if (name.isEmpty() || Double.isNaN(usd) || usd <= 0) continue;
                out.add(new Device(name, usd, row.optString("cardLast4", "").trim()));
            }
        } catch (JSONException ignored) {
            // an unreadable snapshot matches nothing
        }
        return out;
    }

    /** Close enough: KAST converts at its own rate, the app at the registered one. */
    static boolean close(double expected, double amount) {
        return Math.abs(expected - amount) <= Math.max(0.5, amount * 0.06);
    }

    /** Up to 3 likely devices - the card's own first, then the nearest amount. */
    static List<Device> candidates(List<Device> devices, double amount, String cardLast4) {
        List<Device> out = new ArrayList<>();
        for (Device d : devices) if (close(d.expectedUsd, amount)) out.add(d);
        String card = cardLast4 == null ? "" : cardLast4;
        out.sort(Comparator
            .comparingInt((Device d) -> !card.isEmpty() && card.equals(d.cardLast4) ? 0 : 1)
            .thenComparingDouble(d -> Math.abs(d.expectedUsd - amount)));
        return out.size() > 3 ? new ArrayList<>(out.subList(0, 3)) : out;
    }

    static String usd(double v) {
        return String.format(Locale.ROOT, "%.2f$", v);
    }

    /** The Telegram alert (Arabic). */
    static String alert(KastMail.Message m, List<Device> devices) {
        StringBuilder text = new StringBuilder("❌ رُفض دفع ")
            .append(m.isStarlink() ? "Starlink" : m.merchant.isEmpty() ? "بالبطاقة" : m.merchant)
            .append(' ').append(usd(m.amount));
        if (!m.cardLast4.isEmpty()) text.append(" بالبطاقة ").append(m.cardLast4);
        if (!m.isStarlink()) return text.toString(); // not a device's subscription
        List<Device> likely = candidates(devices, m.amount, m.cardLast4);
        if (likely.isEmpty()) {
            text.append("\nلم أجد جهازاً عليه هذا المبلغ");
        } else {
            for (int i = 0; i < likely.size(); i++) {
                Device d = likely.get(i);
                text.append(i == 0 ? "\nالأرجح: «" : "\nأو: «").append(d.name).append("» (عليه ").append(usd(d.expectedUsd)).append(')');
            }
        }
        return text.append("\nافتح KAST وتحقق من البطاقة").toString();
    }
}
