package com.starnetbroser.localbrowser;

/**
 * 💳 While a device's browser is adding a card (CardFillController), the phone's notifications
 * (KastNotificationListener, already allowed for KAST and the banks) hand it the card company's
 * code (PaymentCode). Nobody waiting → nothing is read at all. In memory only, never stored or
 * logged; one code per wait. Pure Java (no android.*), JUnit-tested.
 */
final class PaymentCodeInbox {

    private PaymentCodeInbox() {}

    interface Listener {
        void onCode(String code);
    }

    private static Listener listener;
    private static long since;
    private static java.util.Set<String> used = java.util.Collections.emptySet();

    /** Wait for a code posted at/after {@code sinceMillis}. Replaces any earlier wait. */
    static synchronized void await(long sinceMillis, Listener l) {
        await(sinceMillis, java.util.Collections.emptySet(), l);
    }

    /** …never one of {@code alreadySent} (a code already typed in this run was refused / replaced). */
    static synchronized void await(long sinceMillis, java.util.Set<String> alreadySent, Listener l) {
        since = sinceMillis;
        used = new java.util.HashSet<>(alreadySent);
        listener = l;
    }

    static synchronized void stop(Listener l) {
        if (listener == l) listener = null;
    }

    static synchronized boolean isWaiting() {
        return listener != null;
    }

    /** A notification from any app; true when it carried the awaited code. */
    static boolean offer(String title, String text, long postedAt) {
        Listener l;
        synchronized (PaymentCodeInbox.class) {
            if (listener == null || postedAt < since) return false;
            l = listener;
        }
        String code = PaymentCode.fromNotification(title, text);
        if (code == null) return false;
        synchronized (PaymentCodeInbox.class) {
            if (listener != l || used.contains(code)) return false;
            listener = null;
        }
        l.onCode(code);
        return true;
    }
}
