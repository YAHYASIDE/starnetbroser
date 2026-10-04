package com.starnetbroser.localbrowser;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The app's events in the phone's notification bar - a rep's request, a sync's report, money on
 * KAST, ... - each one its own notification that opens the app on that event's page (the same
 * EXTRA_ROUTE a 📌 shortcut uses, read by LocalBrowserPlugin). Best effort: notifications turned
 * off never break the event itself.
 */
final class AppEventNotifier {

    private static final String CHANNEL_ID = "starnet_events";
    private static final String PREFS = "starnet_app_events";
    private static final String KEY_NEXT = "next";
    /** Own id range, clear of SyncNotifier (1001/1002) and the services' ongoing ones. */
    private static final int ID_BASE = 20000;
    private static final int ID_SPAN = 5000;

    private AppEventNotifier() {
    }

    /** Posts the text (first line = title) and returns whether it was shown. */
    static boolean post(Context context, String text, String route) {
        if (text == null || text.trim().isEmpty()) return false;
        Context app = context.getApplicationContext();
        ensureChannel(app);
        if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return false;
        String[] parts = AppEventText.titleAndBody(text);
        int id = nextId(app);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(parts[0])
            .setContentText(parts[1])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(parts[1]))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);
        Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (launch != null) {
            launch.setAction(Intent.ACTION_MAIN);
            launch.putExtra(PhoneShortcuts.EXTRA_ROUTE, AppEventText.safeRoute(route));
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            // Its own request code: every notification keeps its own page.
            builder.setContentIntent(PendingIntent.getActivity(app, id, launch, flags));
        }
        try {
            NotificationManagerCompat.from(app).notify(id, builder.build());
            return true;
        } catch (SecurityException e) {
            return false; // permission revoked meanwhile
        }
    }

    private static synchronized int nextId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int next = prefs.getInt(KEY_NEXT, 0);
        prefs.edit().putInt(KEY_NEXT, (next + 1) % ID_SPAN).apply();
        return ID_BASE + next;
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "أحداث التطبيق", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("طلبات المندوبين، نتائج المزامنة، أموال KAST - اضغط الإشعار لفتح مكانه");
        manager.createNotificationChannel(channel);
    }
}
