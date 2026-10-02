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
 * nothing for it; real, confirmed). Every other app's notification is ignored at once and never
 * read further. The operator turns this on in Android's «Notification access» (from «ستارلينك
 * والبطاقة»). Each event goes to KastWatch.handle: a refusal → Telegram, a Starlink payment or
 * dollars received → waits for the app to suggest it. Nothing is logged.
 */
public class KastNotificationListener extends NotificationListenerService {

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    /** KAST's own app (its package name carries "kast"). */
    static boolean isKast(String packageName) {
        return packageName != null && packageName.toLowerCase(Locale.ROOT).contains("kast");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !isKast(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = n.extras;
        if (extras == null) return;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        final KastMail.Message m = KastMail.fromNotification(title == null ? "" : title.toString(), text == null ? "" : text.toString(), sbn.getPostTime());
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
