package com.starnetbroser.localbrowser;

/**
 * 💬 Which WhatsApp opens a customer's link (his Nov 27 2026 «أريد أن تظهر لي حسابات واتساب الأعمال… أختار من داخل
 * التطبيق»): he has WhatsApp AND WhatsApp Business installed, and Android's «فتح بواسطة» showed two identical «واتساب».
 * The app asks him once (by name) and then opens that one directly. Only the two known packages and only wa.me /
 * api.whatsapp.com links are accepted. Pure (no android.*), JUnit: WhatsAppLinkTest.
 */
final class WhatsAppLink {

    private WhatsAppLink() {}

    static final String PERSONAL = "com.whatsapp";
    static final String BUSINESS = "com.whatsapp.w4b";

    /** "personal" / "business" → the package; null for anything else. */
    static String packageFor(String app) {
        if ("personal".equals(app)) return PERSONAL;
        if ("business".equals(app)) return BUSINESS;
        return null;
    }

    /** Only a WhatsApp chat link may be opened this way. */
    static boolean isAllowedUrl(String url) {
        if (url == null) return false;
        return url.startsWith("https://wa.me/") || url.startsWith("https://wa.me?") || url.startsWith("https://api.whatsapp.com/");
    }
}
