package com.starnetbroser.localbrowser;

/**
 * 📸 «لقطة ذكية» in a device's browser (his Nov 7 2026 ask: like Alibaba's screenshot pop-up, with buttons for the
 * customer): the ready messages that go with the picture to the customer's WhatsApp. Pure (no android.*), JUnit:
 * ShotMessagesTest.
 */
final class ShotMessages {

    private ShotMessages() {}

    static final int TRAVEL_DONE = 0;
    static final int WORKING = 1;
    static final int BILL = 2;
    static final int RENEWAL = 3;

    /** The ready messages' buttons, in order (TRAVEL_DONE has its own button). */
    static final String[] READY_LABELS = {"✅ جهازك يعمل", "💳 فاتورة الجهاز", "📅 تجديد الاشتراك"};
    static final int[] READY_KINDS = {WORKING, BILL, RENEWAL};

    /** The message for this kind: his customer's name greeted when known, the device named. */
    static String text(int kind, String customerName, String deviceName) {
        String name = customerName == null ? "" : customerName.trim();
        String device = deviceName == null || deviceName.trim().isEmpty() ? "" : " (" + deviceName.trim() + ")";
        String hello = name.isEmpty() ? "مرحبًا،\n" : "مرحبًا " + name + "،\n";
        String body;
        switch (kind) {
            case TRAVEL_DONE:
                body = "✅ تم توثيق جهاز Starlink الخاص بك" + device + " بنجاح.";
                break;
            case WORKING:
                body = "✅ جهاز Starlink الخاص بك" + device + " يعمل بشكل طبيعي.";
                break;
            case BILL:
                body = "💳 هذه فاتورة جهاز Starlink الخاص بك" + device + ".";
                break;
            case RENEWAL:
                body = "📅 هذه تفاصيل تجديد اشتراك جهاز Starlink الخاص بك" + device + ".";
                break;
            default:
                body = "📸 جهاز Starlink الخاص بك" + device + ".";
        }
        return hello + body + "\n⭐ STAR NET";
    }
}
