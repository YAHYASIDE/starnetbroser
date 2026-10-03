package com.starnetbroser.localbrowser;

/**
 * 🛑 «إلغاء الاشتراك»: keeps count of the answers of cancelSubscription.ts's step (one per poll)
 * and decides when the run must stop - the same press that doesn't move the page on, a page that
 * keeps waiting, or a page it doesn't know. Pure, unit-tested. Never decides to press anything.
 */
final class CancelProgress {

    static final int MAX_SAME_PRESS = 3;
    static final int MAX_WAITS = 15;
    static final int MAX_UNKNOWN = 6;

    private String lastPress;
    private int samePress;
    private int waits;
    private int unknowns;

    /** The subscription's end date once an answer said "done:<date>" ("" when unreadable). */
    static String doneDate(String answer) {
        return answer != null && answer.startsWith("done:") ? answer.substring(5) : null;
    }

    /** null = keep going (or done - see doneDate); otherwise why the run stops (Arabic). */
    String onAnswer(String answer) {
        if (answer == null || answer.isEmpty() || "unknown".equals(answer)) {
            waits = 0;
            return ++unknowns >= MAX_UNKNOWN ? "صفحة غير متوقعة في Starlink" : null;
        }
        if (doneDate(answer) != null) return null;
        unknowns = 0;
        if ("wait".equals(answer)) return ++waits >= MAX_WAITS ? "الصفحة لا تتقدم" : null;
        waits = 0;
        if (answer.equals(lastPress)) samePress++;
        else {
            lastPress = answer;
            samePress = 1;
        }
        return samePress > MAX_SAME_PRESS ? "الضغط لا يتقدم (" + answer + ")" : null;
    }
}
