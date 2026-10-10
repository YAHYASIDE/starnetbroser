package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * 🏦 Keeps STAR NET reading the bank / wallet notifications all the time (his Oct 10 2026 request:
 * «نجعل استار نيت شي ك اشعار ثابت … يكون دايما فاتح» - a Sedad transfer was missed while the
 * app was closed). A foreground service with a small permanent notification is what stops phones
 * like HONOR / Huawei from freezing the app; every few minutes it makes sure Android's
 * notification reader (KastNotificationListener) is still connected - reconnecting it if the phone
 * dropped it - and re-reads the bank notifications still on the screen, so one missed while it was
 * down is still kept. Runs only while «Notification access» is on; nothing is logged.
 */
public class BankWatchService extends Service {

    private static final String CHANNEL_ID = "starnet_bank_watch_v1";
    private static final int NOTIFICATION_ID = 1005;
    private static final long CHECK_EVERY_MS = 5 * 60 * 1000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable check = new Runnable() {
        @Override
        public void run() {
            if (!KastNotificationListener.isEnabled(BankWatchService.this)) {
                stopSelf();
                return;
            }
            KastNotificationListener.ensureConnected(BankWatchService.this);
            KastNotificationListener.rescan(BankWatchService.this);
            handler.postDelayed(this, CHECK_EVERY_MS);
        }
    };

    /** Starts it while «Notification access» is on, stops it otherwise - safe to call any time. */
    static void refresh(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        Intent intent = new Intent(app, BankWatchService.class);
        try {
            if (KastNotificationListener.isEnabled(app)) ContextCompat.startForegroundService(app, intent);
            else app.stopService(intent);
        } catch (RuntimeException notAllowedNow) {
            // Android refuses a foreground start from the background right now - the next app open
            // (or a reboot) starts it.
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException refused) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!KastNotificationListener.isEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(check);
        handler.post(check);
        return START_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            // Low (not "min"): some phones freeze services whose notification is minimized.
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "قراءة إشعارات البنوك", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("يبقي STAR NET يقرأ إشعارات بنكيلي وسداد والمحافظ حتى والتطبيق مغلق");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("🏦 STAR NET يقرأ إشعارات البنوك")
            .setContentText("بنكيلي، سداد، والمحافظ - تظهر في «حسابي» ← «عمليات البنوك»")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
            builder.setContentIntent(PendingIntent.getActivity(this, NOTIFICATION_ID, open, flags));
        }
        return builder.build();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(check);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
