package com.starnetbroser.localbrowser;

import java.util.List;

/**
 * 🔄 The owner-bot messages of a background «مزامنة الآن» (BackgroundSyncService) - the same wording
 * as the app's own report (apps/web/src/lib/syncReport.ts). Pure Java, tested without Android.
 */
final class BackgroundSyncReport {

    private BackgroundSyncReport() {}

    static String label(String outcome) {
        if (outcome == null) return "❔ بلا نتيجة";
        switch (outcome) {
            case "ok": return "✅ تمت";
            case "nothing": return "⚠️ لم تُقرأ بيانات";
            case "saveFailed": return "❌ تعذّر الحفظ";
            case "signedOut": return "🔒 غير مسجّل في Starlink";
            case "stuck": return "⏳ تعلّقت - تُخطّيت";
            default: return "❔ بلا نتيجة";
        }
    }

    static String signedOutAlert(String name) {
        return "⚠️ الجهاز «" + (name == null || name.isEmpty() ? "؟" : name) + "» غير مسجّل في Starlink - تخطّيته في المزامنة. افتحه وسجّل الدخول.";
    }

    /** "🔄 انتهت المزامنة (label): تمت N من M" then one line per device tried. */
    static String report(String runLabel, List<String> names, List<String> outcomes, boolean stopped) {
        int done = 0;
        for (String outcome : outcomes) if ("ok".equals(outcome)) done++;
        StringBuilder text = new StringBuilder();
        text.append(stopped ? "⏹ أُوقفت" : "🔄 انتهت").append(" المزامنة في الخلفية");
        if (runLabel != null && !runLabel.isEmpty()) text.append(" (").append(runLabel).append(")");
        text.append(": تمت ").append(done).append(" من ").append(outcomes.size());
        for (int i = 0; i < outcomes.size(); i++) {
            String name = i < names.size() && names.get(i) != null && !names.get(i).isEmpty() ? names.get(i) : "جهاز";
            text.append("\n").append(label(outcomes.get(i))).append(" · ").append(name);
        }
        return text.toString();
    }

    /** The progress notification's line: "3 / 10 · zizo". */
    static String progress(int index, int total, String name) {
        return (index + 1) + " / " + total + (name == null || name.isEmpty() ? "" : " · " + name);
    }
}
