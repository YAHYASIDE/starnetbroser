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
        connected = this;
        markSeen(System.currentTimeMillis());
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
        rebindAskedAt = 0;
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

    /** When the reader last asked Android to reconnect (ms) - a second ask that finds it still down
     * restarts it (forceRebind). */
    private static volatile long rebindAskedAt;

    /** Asks Android to reconnect the reader when access is on but it isn't connected; if an earlier
     * ask (20 s+ ago) didn't bring it back, restarts it. */
    static void ensureConnected(Context context) {
        if (context == null || connected != null || Build.VERSION.SDK_INT < 24 || !isEnabled(context)) return;
        long now = System.currentTimeMillis();
        if (rebindAskedAt > 0 && now - rebindAskedAt > 20_000L) {
            forceRebind(context);
            return;
        }
        rebindAskedAt = now;
        try {
            requestRebind(new ComponentName(context.getApplicationContext(), KastNotificationListener.class));
        } catch (RuntimeException ignored) {
            // not allowed right now - the next check tries again
        }
    }

    /**
     * 🔄 After an app update some phones (HONOR, Huawei…) never bind the reader again although
     * «Notification access» still shows on - nothing was read from 15:21 on Oct 10 2026 (his
     * report). Turning our own reader component off and on makes Android bind it afresh (the same
     * as him switching access off and on), then it's asked to reconnect.
     */
    static void forceRebind(Context context) {
        if (context == null || !isEnabled(context)) return;
        Context app = context.getApplicationContext();
        ComponentName me = new ComponentName(app, KastNotificationListener.class);
        rebindAskedAt = System.currentTimeMillis();
        try {
            android.content.pm.PackageManager pm = app.getPackageManager();
            pm.setComponentEnabledSetting(me, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(me, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP);
        } catch (RuntimeException ignored) {
            // not allowed on this phone - the rebind below still tries
        }
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                requestRebind(me);
            } catch (RuntimeException ignored) {
                // the next check tries again
            }
        }
    }

    /** Whether the reader is bound right now (access on is not enough - see forceRebind). */
    static boolean isConnected() {
        return connected != null;
    }

    private static final String SEEN_PREFS = "starnet_bank_reader";

    /** When the reader last received any notification (ms, 0 = never) - shown in «حسابي». */
    static long lastSeenAt(Context context) {
        return context.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE).getLong("lastSeenAt", 0L);
    }

    private void markSeen(long at) {
        getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE).edit().putLong("lastSeenAt", at).apply();
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
        // MessagingStyle: the words are only in EXTRA_MESSAGES (each a Bundle with its "text").
        if (body.length() == 0) {
            android.os.Parcelable[] messages = extras.getParcelableArray("android.messages");
            if (messages != null) {
                for (android.os.Parcelable m : messages) {
                    if (!(m instanceof Bundle)) continue;
                    CharSequence line = ((Bundle) m).getCharSequence("text");
                    if (line != null && line.length() > 0) body.append(body.length() > 0 ? "\n" : "").append(line);
                }
            }
        }
        if (title == null) title = extras.getCharSequence(Notification.EXTRA_TITLE_BIG);
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
