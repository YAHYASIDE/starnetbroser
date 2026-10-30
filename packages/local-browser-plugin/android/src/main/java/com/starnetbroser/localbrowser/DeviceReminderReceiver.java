package com.starnetbroser.localbrowser;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;

/**
 * ⏰ Rings a device's reminder: a notification with sound (AppEventNotifier's high channel) that opens the app's home
 * searched on that device, and it shows in the app («⏰ تذكيراتي», the device's card) until he taps «تم». Alarms are
 * set again after a restart / an update (TelegramBootReceiver → rescheduleAll).
 */
public class DeviceReminderReceiver extends BroadcastReceiver {

    private static final String EXTRA_ID = "com.starnetbroser.localbrowser.REMINDER_ID";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent == null ? null : intent.getStringExtra(EXTRA_ID);
        JSONObject r = DeviceReminderStore.find(context, id);
        if (r == null || r.optLong("done", 0) > 0 || r.optLong("fired", 0) > 0) return;
        String device = r.optString("device");
        AppEventNotifier.post(context, DeviceReminderTime.notificationText(device, r.optString("note")), DeviceReminderTime.route(device));
        DeviceReminderStore.mark(context, id, "fired");
    }

    static void schedule(Context context, String id, long at) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = pending(context, id);
        long when = Math.max(at, System.currentTimeMillis() + 1000);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
            } else {
                alarms.setExact(AlarmManager.RTC_WAKEUP, when, pending);
            }
        } catch (SecurityException e) {
            alarms.set(AlarmManager.RTC_WAKEUP, when, pending);
        }
    }

    static void cancel(Context context, String id) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pending(context, id));
    }

    /** After a restart: every reminder not rung yet (a late one rings at once). */
    static void rescheduleAll(Context context) {
        for (JSONObject r : DeviceReminderStore.list(context)) {
            if (r.optLong("done", 0) > 0 || r.optLong("fired", 0) > 0) continue;
            schedule(context, r.optString("id"), r.optLong("at", 0));
        }
    }

    private static PendingIntent pending(Context context, String id) {
        Intent intent = new Intent(context, DeviceReminderReceiver.class);
        intent.putExtra(EXTRA_ID, id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(context, id == null ? 0 : id.hashCode(), intent, flags);
    }
}
