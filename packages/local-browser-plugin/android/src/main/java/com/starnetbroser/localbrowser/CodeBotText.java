package com.starnetbroser.localbrowser;

/**
 * 🔑 «بوت الأكواد» (his Oct 22 2026 ask «أرسل كل رمز إلى بوت التيليغرام معه تفاصيل الجهاز»): the message
 * for one code the app read from a mailbox - what it was for, the code, and the device it belongs to
 * (name, customer, email, KIT). Pure, unit-tested.
 */
final class CodeBotText {

    private CodeBotText() {}

    static String kindLabel(String kind) {
        if ("mail".equals(kind)) return "📧 دخول البريد";
        if ("card".equals(kind)) return "💳 دفع البطاقة";
        return "🛰️ دخول Starlink";
    }

    private static boolean has(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /** `name`, `client`, `email`, `kit` may be null (a card code has no device). */
    static String message(String kind, String code, String name, String client, String email, String kit, String time) {
        StringBuilder out = new StringBuilder();
        out.append("🔑 رمز ").append(kindLabel(kind)).append(": ").append(code);
        if (has(name)) out.append("\n📡 الجهاز: ").append(name.trim());
        if (has(client)) out.append("\n👤 الزبون: ").append(client.trim());
        if (has(email)) out.append("\n✉️ ").append(email.trim());
        if (has(kit)) out.append("\n🔢 ").append(kit.trim());
        if (has(time)) out.append("\n🕒 ").append(time.trim());
        out.append("\n⏳ الرمز يعمل دقائق فقط.");
        return out.toString();
    }

    static final String CONNECTED = "✅ تم ربط «🔑 بوت الأكواد» بـ STAR NET.\nكل رمز تحقق يقرؤه التطبيق من البريد يصلك هنا مع تفاصيل جهازه.";
}
