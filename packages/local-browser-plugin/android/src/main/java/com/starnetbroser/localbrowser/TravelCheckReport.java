package com.starnetbroser.localbrowser;

import java.util.List;

/**
 * 🛂 The owner-bot message of a «كشف توثيق» run in the background (BackgroundSyncService + SyncRunner
 * in Home-only mode). Each device ends as one of: needs registration (with Starlink's deadline as
 * printed), clear, or not checked (signed out / stuck / Home never loaded / closed) - a device whose
 * Home never showed its account line or the banner is NEVER counted as clear (his rule: «لكي لا
 * يرتكب الأخطاء»). The app shows the same run with its WhatsApp buttons when it is opened. Pure Java.
 */
final class TravelCheckReport {

    private TravelCheckReport() {}

    /** A device's result: "needs" (+ due), "clear", or the run outcome that kept it unchecked. */
    static String result(String outcome, Boolean required) {
        if (!"ok".equals(outcome) || required == null) return outcome == null || "ok".equals(outcome) ? "nothing" : outcome;
        return required ? "needs" : "clear";
    }

    static String skippedLabel(String result) {
        if (result == null) return "❔ لم يُفحص";
        switch (result) {
            case "signedOut": return "🔒 غير مسجّل في Starlink";
            case "stuck": return "⏳ تعلّق - تُخطّي";
            case "closed": return "⏹ لم يُفحص (أُوقف)";
            case "saveFailed": return "❌ تعذّر الحفظ";
            default: return "⚠️ لم تظهر الصفحة الرئيسية - لم يُفحص";
        }
    }

    /** "🛂 انتهى كشف التوثيق في الخلفية (label)\nفُحص M · يحتاج توثيق N · لم يُفحص K" + the lists. */
    static String report(String runLabel, List<String> names, List<String> results, List<String> dues, boolean stopped) {
        int needs = 0;
        int clear = 0;
        StringBuilder needLines = new StringBuilder();
        StringBuilder skipLines = new StringBuilder();
        for (int i = 0; i < results.size(); i++) {
            String result = results.get(i);
            String name = i < names.size() && names.get(i) != null && !names.get(i).isEmpty() ? names.get(i) : "جهاز";
            if ("needs".equals(result)) {
                needs++;
                String due = i < dues.size() && dues.get(i) != null && !dues.get(i).trim().isEmpty() ? dues.get(i).trim() : "";
                needLines.append("\n").append(needs).append(") ").append(name).append(due.isEmpty() ? "" : " · ⏰ قبل " + due);
            } else if ("clear".equals(result)) {
                clear++;
            } else {
                skipLines.append("\n").append(skippedLabel(result)).append(" · ").append(name);
            }
        }
        int skipped = results.size() - needs - clear;
        StringBuilder text = new StringBuilder();
        text.append(stopped ? "⏹ أُوقف" : "🛂 انتهى").append(" كشف التوثيق في الخلفية");
        if (runLabel != null && !runLabel.isEmpty()) text.append(" (").append(runLabel).append(")");
        text.append("\nفُحص ").append(needs + clear).append(" جهاز · يحتاج توثيق: ").append(needs);
        if (skipped > 0) text.append(" · لم يُفحص ").append(skipped);
        if (needs == 0) text.append("\n\n✅ لا جهاز يحتاج توثيقًا.");
        else text.append("\n").append(needLines);
        if (skipped > 0) text.append("\n\nلم يُفحص:").append(skipLines);
        if (needs > 0) text.append("\n\nافتح التطبيق: أزرار الواتساب جاهزة للزبائن.");
        return text.toString();
    }

    /** The progress notification's line. */
    static String progress(int index, int total, String name) {
        return "🛂 كشف توثيق في الخلفية · " + BackgroundSyncReport.progress(index, total, name);
    }
}
