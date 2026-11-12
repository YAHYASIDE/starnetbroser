package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 💬 WhatsApp Business messages read from their notifications (his Nov 12 2026 ask: customers send their emails there,
 * and ask about their device there). His choices: no server and no Meta account - the phone's own notifications; an
 * email → a new device in the app; a question about the device → answered by itself, only to a customer whose number
 * is registered, never in a group, once per REPLY_GAP_MS. Pure, no android.* - JUnit: WhatsAppMessageTest.
 */
final class WhatsAppMessage {

    private WhatsAppMessage() {}

    /** WhatsApp Business first (his), the ordinary one too. */
    static final String[] PACKAGES = {"com.whatsapp.w4b", "com.whatsapp"};

    /** One answer per customer at most every 30 minutes (a chat going on is never flooded). */
    static final long REPLY_GAP_MS = 30L * 60L * 1000L;

    static boolean isWhatsApp(String pkg) {
        if (pkg == null) return false;
        for (String p : PACKAGES) if (p.equals(pkg)) return true;
        return false;
    }

    /** A group chat (its id ends with @g.us) - never read, never answered. */
    static boolean isGroup(String conversationId, boolean groupFlag) {
        return groupFlag || (conversationId != null && conversationId.endsWith("@g.us"));
    }

    /** The sender's number: the chat's id «22220000001@s.whatsapp.net», else a title that is a number. */
    static String phoneOf(String conversationId, String title) {
        if (conversationId != null) {
            int at = conversationId.indexOf('@');
            String head = at > 0 ? conversationId.substring(0, at) : conversationId;
            String digits = head.replaceAll("[^0-9]", "");
            if (digits.length() >= 8 && head.matches("[0-9+\\- ]+")) return digits;
        }
        if (title != null && title.trim().matches("\\+?[0-9][0-9 \\-]{6,}")) {
            String digits = title.replaceAll("[^0-9]", "");
            if (digits.startsWith("00")) digits = digits.substring(2);
            if (digits.length() >= 8) return digits;
        }
        return null;
    }

    /** The last 8 digits - how the app keys a customer's answer. */
    static String key(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("00")) digits = digits.substring(2);
        return digits.length() >= 8 ? digits.substring(digits.length() - 8) : null;
    }

    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");

    static List<String> emails(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        Matcher m = EMAIL.matcher(text);
        while (m.find()) {
            String e = m.group().toLowerCase(Locale.ROOT);
            if (!out.contains(e)) out.add(e);
        }
        return out;
    }

    private static final String[] QUESTION_WORDS = {
        "جهاز", "اشتراك", "ينتهي", "متى", "تجديد", "جدد", "حالة", "رصيد", "كم علي", "كم عليا", "دين", "انترنت", "الانترنت",
        "ستارلينك", "starlink", "abonnement", "internet", "kit"
    };

    /** A message that asks about his device / subscription / what he owes. */
    static boolean asksAboutDevice(String text) {
        if (text == null || text.trim().isEmpty()) return false;
        String t = fold(text);
        for (String w : QUESTION_WORDS) if (t.contains(fold(w))) return true;
        return false;
    }

    private static String fold(String s) {
        return s.toLowerCase(Locale.ROOT).replace('إ', 'ا').replace('أ', 'ا').replace('آ', 'ا').replace('ى', 'ي');
    }

    /** May this customer be answered now (the last answer `lastAt` ms, 0 = never). */
    static boolean mayAnswer(long lastAt, long now) {
        return lastAt <= 0 || now - lastAt >= REPLY_GAP_MS;
    }

    /** One message's id (a re-posted notification carrying the same message is the same one). */
    static String id(String pkg, String phone, String title, String text, long messageAt) {
        return Integer.toHexString((pkg + "|" + phone + "|" + title + "|" + text + "|" + messageAt).hashCode()) + Long.toString(messageAt, 36);
    }
}
