package com.starnetbroser.localbrowser;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.List;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Posts a single best-effort "تمت المزامنة" notification whenever a sync run - manual "مزامنة
 * الآن" or the periodic AutoSyncWorker, both go through the same Worker class - actually found
 * something worth reporting. This is never required for the sync itself: the synced data is
 * already safely in PendingSyncStore regardless of whether this notification shows, so a denied
 * or disabled notification permission must never be treated as a sync failure.
 */
final class SyncNotifier {

    private static final String CHANNEL_ID = "starnet_sync";
    private static final int NOTIFICATION_ID = 1001;
    private static final int STOPPED_NOTIFICATION_ID = 1002;

    /** Pure: the text of the "stopped" notification - up to 5 names, then "و N آخر". */
    static String stoppedText(List<String> names) {
        StringBuilder out = new StringBuilder();
        int shown = Math.min(5, names.size());
        for (int i = 0; i < shown; i++) {
            if (i > 0) out.append("، ");
            out.append(names.get(i));
        }
        if (names.size() > shown) out.append(" و").append(names.size() - shown).append(" آخر");
        return out.toString();
    }

    /**
     * One grouped notification for every device the sync just found stopped (Starlink suspended
     * or canceled the subscription) - the one thing the operator asked to be told about right
     * away. Tapping it opens the app, where the device shows as stopped.
     */
    static void notifyStopped(Context context, List<String> names) {
        if (names == null || names.isEmpty()) {
            return;
        }
        ensureChannel(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return;
        }
        String title = names.size() == 1 ? "⛔ توقف جهاز: " + names.get(0) : "⛔ توقف " + names.size() + " أجهزة";
        String body = "أوقفت Starlink الاشتراك: " + stoppedText(names);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            builder.setContentIntent(
                PendingIntent.getActivity(context, STOPPED_NOTIFICATION_ID, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
            );
        }
        try {
            NotificationManagerCompat.from(context).notify(STOPPED_NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Permission revoked meanwhile - the stopped status still shows in the app.
        }
    }

    private SyncNotifier() {
    }

    static void notifySyncCompleted(Context context, int syncedAccountCount) {
        if (syncedAccountCount <= 0) {
            // Nothing new was actually found this run (offline, no logged-in accounts yet, or
            // simply nothing changed) - a notification with nothing to report would just be noise.
            return;
        }
        ensureChannel(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return;
        }

        String body = syncedAccountCount == 1
            ? "تم تحديث بيانات حساب واحد من Starlink"
            : "تم تحديث بيانات " + syncedAccountCount + " حسابات من Starlink";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("STAR NET")
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Permission revoked between the areNotificationsEnabled() check above and this call -
            // never crash a sync run over a missing notification.
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "مزامنة Starlink",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("إشعار عند تحديث بيانات الحسابات تلقائيًا من Starlink");
        manager.createNotificationChannel(channel);
    }
}
