package com.starnetbroser.localbrowser;

/**
 * 📸 «لقطة ذكية» in a device's browser (his Nov 7 2026 ask: like Alibaba's screenshot pop-up, with buttons for the
 * customer): the ready messages that go with the picture to the customer's WhatsApp - his own words, in two lists:
 * the device's state and the activations (his second Nov 7 2026 message «نظّم كل شيء»). Pure (no android.*), JUnit:
 * ShotMessagesTest.
 */
final class ShotMessages {

    private ShotMessages() {}

    /** ✅ «تم التوثيق» (its own button - it also marks the device). */
    static final String TRAVEL_DONE = "✅ تم توثيق جهاز Starlink الخاص بك بنجاح.";

    /** 📨 The device's state - button label, then the message. */
    static final String[][] STATUS = {
        {"✅ يعمل جيدًا", "✅ جهازك يعمل بشكل طبيعي وجيد، بدون أي أعطال."},
        {"🔌 يعمل - الكهرباء غير واصلة", "🔌 جهازك يعمل بشكل طبيعي، لكن الكهرباء غير واصلة إليه."},
        {"⛔ الاشتراك منتهٍ", "⛔ انتهى اشتراك جهازك والخدمة موقوفة."},
        {"🐢 خطة ضعيفة جدًا", "🐢 جهازك يعمل بخطة ضعيفة جدًا."},
        {"🌍 موقوف خارج البلد", "🌍 جهازك موقوف لأنه خارج البلد، ولا يمكن أن يعمل في الوقت الحالي."},
        {"⏸️ إطفاء 3 أيام", "⏸️ يجب إطفاء جهازك لمدة 3 أيام متتالية.\n⚠️ تحذير: أي تشغيل للجهاز قبل اكتمال 3 أيام قد يؤدي إلى إطفائه مرة ثانية لـ 3 أيام."},
        {"🔥 نظن أنه محروق", "🔥 نظن أن جهازك محروق."},
        {"⚡ ضعف في الأسلاك أو الكهرباء", "⚡ في جهازك ضعف في الأسلاك أو الكهرباء."},
        {"💵 تم الدفع - الحساب 0", "💵 تم استلام دفعتك وتم تصفير حسابك - المتبقي عليك 0."},
    };

    /** ⚡ The activations - button label, then the message. */
    static final String[][] ACTIVATION = {
        {"📶 100 جيجا", "📶 تم تفعيل 100 جيجا لجهازك."},
        {"🌐 تجوال غير محدود", "🌐 تم تفعيل تجوال غير محدود لجهازك."},
        {"📶 50 جيجا", "📶 تم تفعيل 50 جيجا لجهازك."},
        {"🐢 تفعيل - الخدمة ضعيفة", "🐢 تم تفعيل جهازك، والخدمة ضعيفة."},
        {"❌ لا يمكن التفعيل", "❌ لا يمكن تفعيل خدمة لجهازك في الوقت الحالي."},
    };

    static String[] labels(String[][] list) {
        String[] out = new String[list.length];
        for (int i = 0; i < list.length; i++) out[i] = list[i][0];
        return out;
    }

    /** The whole message: his customer greeted by name when known, the body, the device named, the signature. */
    static String text(String body, String customerName, String deviceName) {
        String name = customerName == null ? "" : customerName.trim();
        String device = deviceName == null ? "" : deviceName.trim();
        String hello = name.isEmpty() ? "مرحبًا،\n" : "مرحبًا " + name + "،\n";
        return hello + (body == null ? "" : body.trim()) + (device.isEmpty() ? "" : "\n📡 الجهاز: " + device) + "\n⭐ STAR NET";
    }
}
