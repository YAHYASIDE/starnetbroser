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

    /** Where a sender's number was read from - shown in the agent's 🔍 line. */
    static final String FROM_CHAT = "المحادثة";
    static final String FROM_TITLE = "العنوان";
    static final String FROM_SENDER = "اسم المرسل";
    static final String FROM_PERSON = "جهة الاتصال";

    /** A sender's number and where it came from (both null = not found). */
    static final class Found {
        final String phone;
        final String from;

        Found(String phone, String from) {
            this.phone = phone;
            this.from = from;
        }
    }

    /**
     * The sender's number (his Nov 21 2026 report: the agent never answered). Read, in order, from: the chat's id only
     * when it IS a phone («22220000001@s.whatsapp.net» - never «…@lid», WhatsApp's hidden id whose digits are not a
     * number); the notification's title («+223 74 64 61 58», with WhatsApp's invisible direction marks and a «(3
     * رسائل)» tail removed); the last message's sender; its sender_person (uri «tel:…» or key). Same order for the
     * agent, the fixed answer and «📧 إيميل من واتساب».
     */
    static Found find(String conversationId, String title, String sender, String personUri, String personKey) {
        String p = chatPhone(conversationId);
        if (p != null) return new Found(p, FROM_CHAT);
        p = numberText(title);
        if (p != null) return new Found(p, FROM_TITLE);
        p = numberText(sender);
        if (p != null) return new Found(p, FROM_SENDER);
        p = personUri != null && personUri.startsWith("tel:") ? numberText(personUri.substring(4)) : chatPhone(personUri);
        if (p == null) p = chatPhone(personKey);
        if (p == null && personKey != null && !personKey.contains("@")) p = numberText(personKey);
        if (p != null) return new Found(p, FROM_PERSON);
        return new Found(null, null);
    }

    /** The sender's number from the chat's id and the title only (kept for callers with nothing more). */
    static String phoneOf(String conversationId, String title) {
        return find(conversationId, title, null, null, null).phone;
    }

    /** WhatsApp's hidden chat id («…@lid») - its digits are not the sender's phone. */
    static boolean isHiddenId(String conversationId) {
        return conversationId != null && conversationId.endsWith("@lid");
    }

    /** A chat id that is a phone: «<digits>@s.whatsapp.net» / «@c.us», or bare digits. */
    static String chatPhone(String id) {
        if (id == null) return null;
        int at = id.indexOf('@');
        String head = at >= 0 ? id.substring(0, at) : id;
        if (at >= 0) {
            String server = id.substring(at + 1);
            if (!server.equals("s.whatsapp.net") && !server.equals("c.us")) return null;
        }
        if (!head.matches("\\+?[0-9][0-9\\- ]*")) return null;
        String digits = head.replaceAll("[^0-9]", "");
        return digits.length() >= 8 ? digits : null;
    }

    /** WhatsApp's invisible direction marks / no-break spaces, and a «(3 رسائل)» / «(3 messages)» tail. */
    static String clean(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "").replace('\u00A0', ' ').replace('\u202F', ' ');
        t = t.replaceAll("\\s*[(（][^()（）]*[)）]\\s*$", "");
        return t.trim();
    }

    /** A text that is just a phone number → its digits (no leading 00), else null. */
    static String numberText(String s) {
        String t = clean(s);
        if (t == null || !t.matches("\\+?[0-9][0-9 \\-().]{6,}")) return null;
        String digits = t.replaceAll("[^0-9]", "");
        if (digits.startsWith("00")) digits = digits.substring(2);
        return digits.length() >= 8 ? digits : null;
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
