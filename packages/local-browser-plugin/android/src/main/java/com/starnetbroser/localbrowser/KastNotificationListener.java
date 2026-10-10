package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 💳 The KAST app's own notifications - the only place a successful card payment shows (KAST mails
 * nothing for it; real, confirmed) - and 🏦 the operator's bank / wallet apps' (BankNotice:
 * بنكيلي، سداد، نيتا، بينانس…). Every other app's notification is ignored at once and never read
 * further. The operator turns this on in Android's «Notification access» (from «ستارلينك
 * والبطاقة» or «حسابي»). A KAST event goes to KastWatch.handle: a refusal → Telegram, a Starlink
 * payment or dollars received → waits for the app to suggest it. A bank one is stored
 * (BankNoticeStore) for «حسابي» to suggest. 💳 While a device's browser adds a card, the card
 * company's code from his mail notification goes to it (PaymentCodeInbox). Nothing is logged.
 */
public class KastNotificationListener extends NotificationListenerService {

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    /** The connected listener (null while Android has it disconnected) - for rescan(). */
    private static volatile KastNotificationListener connected;

    /** KAST's own app (its package name carries "kast"). */
    static boolean isKast(String packageName) {
        return packageName != null && packageName.toLowerCase(Locale.ROOT).contains("kast");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        if (isKast(sbn.getPackageName())) {
            handleKast(sbn);
        } else {
            offerPaymentCode(sbn);
            keepBankNotice(sbn);
        }
    }

    /** Bank notifications posted while access was off are still on the screen: kept once (the same
     * posted notification is never stored twice). */
    @Override
    public void onListenerConnected() {
        connected = this;
        keepActiveBankNotices(this);
        // 🏦 The permanent «يقرأ إشعارات البنوك» notification that keeps it running.
        BankWatchService.refresh(this);
    }

    /** Some phones (HONOR, Huawei…) drop the reader to save battery - ask Android to reconnect it. */
    @Override
    public void onListenerDisconnected() {
        if (connected == this) connected = null;
        ensureConnected(this);
    }

    private static void keepActiveBankNotices(KastNotificationListener listener) {
        try {
            StatusBarNotification[] active = listener.getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification sbn : active) if (sbn != null && !isKast(sbn.getPackageName())) listener.keepBankNotice(sbn, true);
        } catch (RuntimeException ignored) {
            // not allowed right now - the next ones still arrive one by one
        }
    }

    /** 🏦 Re-reads the bank notifications still on the screen (one missed while the reader was
     * down is kept now; the same posted notification is never stored twice). Synchronous, so the
     * app reading the store right after sees them. */
    static void rescan(Context context) {
        KastNotificationListener listener = connected;
        if (listener != null) keepActiveBankNotices(listener);
        else ensureConnected(context);
    }

    /** Asks Android to reconnect the reader when access is on but it isn't connected. */
    static void ensureConnected(Context context) {
        if (context == null || connected != null || Build.VERSION.SDK_INT < 24 || !isEnabled(context)) return;
        try {
            requestRebind(new ComponentName(context.getApplicationContext(), KastNotificationListener.class));
        } catch (RuntimeException ignored) {
            // not allowed right now - the next check tries again
        }
    }

    /** {title, text} - the expanded text when the app gives one (a cut line ends with «…»). */
    private static String[] titleAndText(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return null;
        Bundle extras = n.extras;
        if (extras == null) return null;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        StringBuilder body = new StringBuilder(text == null ? "" : text.toString());
        // 🏦 InboxStyle: several lines (Bankily's «Montant : … MRU» / «Beneficiaire : …») that
        // aren't in EXTRA_TEXT; without them a bank notice carries no amount and would be dropped.
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) if (line != null && line.length() > 0) body.append('\n').append(line);
        }
        CharSequence sub = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        if (sub != null && sub.length() > 0) body.append('\n').append(sub);
        return new String[] {title == null ? "" : title.toString(), body.toString()};
    }

    /** 💳 Only while a device's browser is adding a card and waits for the card company's code
     * (no-reply's mail «STARLINK INTERNET … code: ######») - otherwise nothing here is read. */
    private void offerPaymentCode(StatusBarNotification sbn) {
        if (!PaymentCodeInbox.isWaiting()) return;
        String[] tt = titleAndText(sbn);
        if (tt != null) PaymentCodeInbox.offer(tt[0], tt[1], sbn.getPostTime());
    }

    private void keepBankNotice(StatusBarNotification sbn) {
        keepBankNotice(sbn, false);
    }

    /** `now`: store on this thread (a rescan the app waits for) instead of the background one. */
    private void keepBankNotice(StatusBarNotification sbn, boolean now) {
        final String[] tt = titleAndText(sbn);
        if (tt == null) return;
        final String app = BankNotice.keep(sbn.getPackageName(), tt[0], tt[1]);
        if (app == null) return;
        final Context context = getApplicationContext();
        final String pkg = sbn.getPackageName();
        final long at = sbn.getPostTime();
        if (now) BankNoticeStore.add(context, app, pkg, tt[0], tt[1], at);
        else WORK.execute(() -> BankNoticeStore.add(context, app, pkg, tt[0], tt[1], at));
    }

    private void handleKast(StatusBarNotification sbn) {
        String[] tt = titleAndText(sbn);
        if (tt == null) return;
        final KastMail.Message m = KastMail.fromNotification(tt[0], tt[1], sbn.getPostTime());
        if (m == null) return;
        final Context context = getApplicationContext();
        WORK.execute(() -> {
            try {
                KastWatch.handle(context, m);
            } catch (Exception ignored) {
                // no network for Telegram right now - the alert is lost, the app still shows the rest
            }
        });
    }

    /** Whether the operator gave STAR NET «Notification access». */
    static boolean isEnabled(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        String mine = new ComponentName(context, KastNotificationListener.class).flattenToString();
        for (String entry : enabled.split(":")) if (mine.equalsIgnoreCase(entry)) return true;
        return false;
    }
}
