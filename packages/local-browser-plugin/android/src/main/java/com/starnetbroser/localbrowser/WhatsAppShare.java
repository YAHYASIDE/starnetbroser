package com.starnetbroser.localbrowser;

/**
 * 🖼️ A picture straight into one customer's WhatsApp chat (his Nov 3 2026 ask «عندما أضغط على إرسال صورة الدين تفتح
 * واتساب الشخص تلقائيًا إن كان مسجّلًا»): WhatsApp opens that chat with the picture attached when the share carries
 * `jid` = «<digits>@s.whatsapp.net». Pure (no android.*), JUnit: WhatsAppShareTest.
 */
final class WhatsAppShare {

    private WhatsAppShare() {}

    static final String[] PACKAGES = {"com.whatsapp", "com.whatsapp.w4b"};

    /** "+222 27 58 08 36" / "0022227580836" → "22227580836@s.whatsapp.net"; null when it isn't a usable number. */
    static String jid(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("00")) digits = digits.substring(2);
        if (digits.length() < 8 || digits.length() > 15) return null;
        return digits + "@s.whatsapp.net";
    }

    /** A safe cache file name (letters, digits, - _ .), ".png" kept. */
    static String fileName(String name) {
        String clean = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (clean.isEmpty() || clean.startsWith(".")) clean = "statement" + clean;
        if (!clean.toLowerCase().endsWith(".png")) clean = clean + ".png";
        return clean.length() > 80 ? clean.substring(clean.length() - 80) : clean;
    }
}
