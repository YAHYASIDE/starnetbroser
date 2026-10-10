package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ⏳ Keeps STAR NET running while a task the operator started is still at work on Starlink's
 * pages - a card's «تحديث من Starlink», «إلغاء الاشتراك» - so it carries on when the operator
 * switches to another app or the screen turns off (real report: it stopped until the app was
 * opened again, and sometimes failed). A foreground service with a small notification naming
 * the task is what stops Android from freezing the app in the background; it also keeps the CPU
 * awake. It ends by itself when the last task ends (or after MAX_HOLD_MS, whatever happens).
 */
public class BusyService extends Service {

    private static final String CHANNEL_ID = "starnet_busy_v1";
    private static final int NOTIFICATION_ID = 1004;
    /** Never held longer than this, even if a task forgot to say it ended. */
    private static final long MAX_HOLD_MS = 15 * 60 * 1000L;

    /** Running tasks: key → what the notification says. */
    private static final Map<String, String> TASKS = new LinkedHashMap<>();
    private static final android.os.Handler MAIN = new android.os.Handler(android.os.Looper.getMainLooper());
    /** The started service, touched on the main thread only. */
    private static BusyService running;
    private PowerManager.WakeLock wakeLock;
    private final android.os.Handler handler = MAIN;
    private final Runnable giveUp = () -> {
        synchronized (TASKS) {
            TASKS.clear();
        }
        stopSelf();
    };

    /** A task starts (or is renamed). Safe to call any time - when Android refuses a foreground
     * service right now, the task simply runs as before. */
    static void start(Context context, String key, String label) {
        if (context == null || key == null) return;
        synchronized (TASKS) {
            TASKS.put(key, label == null ? "" : label);
        }
        Context app = context.getApplicationContext();
        try {
            ContextCompat.startForegroundService(app, new Intent(app, BusyService.class));
        } catch (RuntimeException notAllowedNow) {
            // Started from the background on a phone that forbids it: nothing to keep alive with.
        }
    }

    /** A task ended; the service goes away with the last one. Never starts the service again (a
     * start Android may refuse from the background): it talks to the running one directly, and a
     * service still starting sees the empty list in onStartCommand and stops there. */
    static void stop(Context context, String key) {
        if (key == null) return;
        boolean empty;
        String body;
        synchronized (TASKS) {
            if (TASKS.remove(key) == null) return;
            empty = TASKS.isEmpty();
            body = text(TASKS);
        }
        MAIN.post(() -> {
            BusyService service = running;
            if (service == null) return;
            if (empty) {
                service.stopSelf();
            } else {
                NotificationManager manager = (NotificationManager) service.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) manager.notify(NOTIFICATION_ID, service.buildNotification(body));
            }
        });
    }

    static String text(Map<String, String> tasks) {
        StringBuilder out = new StringBuilder();
        for (String label : tasks.values()) {
            if (label.isEmpty()) continue;
            if (out.length() > 0) out.append(" • ");
            out.append(label);
        }
        return out.length() > 0 ? out.toString() : "يعمل على Starlink";
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String body;
        boolean empty;
        synchronized (TASKS) {
            empty = TASKS.isEmpty();
            body = text(TASKS);
        }
        try {
            Notification notification = buildNotification(body);
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException refused) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (empty) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = this;
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power != null) {
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "starnet:busy");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(MAX_HOLD_MS);
            }
            handler.postDelayed(giveUp, MAX_HOLD_MS);
        }
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String body) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "مهام STAR NET الجارية", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("يظهر أثناء التحديث أو إلغاء الاشتراك ليكملا عند الخروج من التطبيق");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("⏳ STAR NET يعمل")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (running == this) running = null;
        handler.removeCallbacks(giveUp);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
