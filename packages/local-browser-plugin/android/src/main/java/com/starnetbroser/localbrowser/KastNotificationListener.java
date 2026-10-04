package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
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
 * (BankNoticeStore) for «حسابي» to suggest. Nothing is logged.
 */
public class KastNotificationListener extends NotificationListenerService {

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

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
            keepBankNotice(sbn);
        }
    }

    /** Bank notifications posted while access was off are still on the screen: kept once (the same
     * posted notification is never stored twice). */
    @Override
    public void onListenerConnected() {
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification sbn : active) if (sbn != null && !isKast(sbn.getPackageName())) keepBankNotice(sbn);
        } catch (RuntimeException ignored) {
            // not allowed right now - the next ones still arrive one by one
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
        return new String[] {title == null ? "" : title.toString(), text == null ? "" : text.toString()};
    }

    private void keepBankNotice(StatusBarNotification sbn) {
        final String[] tt = titleAndText(sbn);
        if (tt == null) return;
        final String app = BankNotice.keep(sbn.getPackageName(), tt[0], tt[1]);
        if (app == null) return;
        final Context context = getApplicationContext();
        final String pkg = sbn.getPackageName();
        final long at = sbn.getPostTime();
        WORK.execute(() -> BankNoticeStore.add(context, app, pkg, tt[0], tt[1], at));
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
