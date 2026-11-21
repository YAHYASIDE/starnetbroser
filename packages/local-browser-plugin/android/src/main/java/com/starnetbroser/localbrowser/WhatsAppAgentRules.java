package com.starnetbroser.localbrowser;

import java.util.Collection;
import java.util.List;

/**
 * 🤖 «وكيل واتساب» (his Nov 15 2026 ask, agent 5): Claude answers WhatsApp customers by itself. His choices: first only on
 * the numbers he sets for a test, later «كل من يراسلني»; it talks about the device and its renewal, the debt, prices and
 * how to pay, and internet checks. The app (apps/web lib/whatsappAgent.ts) writes each answer with his Claude key; the
 * phone keeps the message's notification to send it. Pure, no android.* - JUnit: WhatsAppAgentRulesTest.
 */
final class WhatsAppAgentRules {

    private WhatsAppAgentRules() {}

    /** A message older than this when the app reads it is not answered (the chat moved on). */
    static final long FRESH_MS = 15L * 60L * 1000L;
    /** At most this many answers to one number in an hour. */
    static final int MAX_PER_HOUR = 20;
    static final long HOUR_MS = 60L * 60L * 1000L;

    /** The agent answers this number (its last 8 digits `key`): agent on; never a rep; his test numbers, or everyone. */
    static boolean answers(String key, boolean on, boolean everyone, Collection<String> testNumbers, Collection<String> repKeys) {
        if (!on || key == null) return false;
        if (repKeys != null && repKeys.contains(key)) return false;
        if (everyone) return true;
        return testNumbers != null && testNumbers.contains(key);
    }

    /** 🔍 Why the agent took / left a message - the agent section's «آخر رسالة رآها القارئ» (his Nov 21 2026 ask).
     * `savedName`: the title is a contact's name, not a number. */
    static String reason(String key, boolean savedName, boolean on, boolean everyone, Collection<String> testNumbers, Collection<String> repKeys) {
        if (key == null) return savedName ? "محفوظ باسم - لم يُقرأ رقمه" : "لم يُقرأ رقم المرسل";
        if (!on) return "الوكيل متوقف (أو لا مفتاح Claude)";
        if (repKeys != null && repKeys.contains(key)) return "رقم مندوب - لا يرد عليه الوكيل";
        if (everyone || (testNumbers != null && testNumbers.contains(key))) return "✓ دخلت للوكيل";
        return "ليس من أرقام التجربة";
    }

    static boolean fresh(long messageAt, long now) {
        return messageAt > 0 && now - messageAt <= FRESH_MS;
    }

    /** `sentAt`: when this number was answered before (ms). */
    static boolean underHourlyLimit(List<Long> sentAt, long now) {
        int recent = 0;
        if (sentAt != null) for (Long t : sentAt) if (t != null && now - t < HOUR_MS) recent++;
        return recent < MAX_PER_HOUR;
    }
}
