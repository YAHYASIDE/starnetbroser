package com.starnetbroser.localbrowser;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * 📞 The in-app voice call on the phone itself (his Nov 8 2026 report «الاتصال لا يوجد له رنّات، يظهر كإشعار فقط» and
 * «أضف مكبّر الصوت»): an incoming call rings with the phone's ringtone and vibrates, with a call notification that can
 * open the app over the lock screen; and during the call the voice goes to the earpiece or the loudspeaker. The ring
 * stops by itself after 45 s (the call's own limit).
 */
final class CallRinger {

    private static final String CHANNEL_ID = "starnet_calls_v1";
    private static final int NOTIFICATION_ID = 1010;
    private static final long RING_MS = 45_000;

    private static Ringtone ringtone;
    /** The app's context of the last ring (the 45 s timer stops the vibration and the notification with it). */
    private static Context lastContext;
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static final Runnable STOP = () -> stop(lastContext);

    private CallRinger() {}

    static synchronized void ring(Context context, String title, String body) {
        Context app = context.getApplicationContext();
        stop(app);
        lastContext = app;
        try {
            Uri uri = RingtoneManager.getActualDefaultRingtoneUri(app, RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(app, uri);
            if (ringtone != null) {
                if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                if (Build.VERSION.SDK_INT >= 21) {
                    ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                }
                ringtone.play();
            }
        } catch (RuntimeException ignored) {
            ringtone = null;
        }
        try {
            Vibrator v = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            long[] pattern = {0, 800, 600, 800, 600};
            if (v != null) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, 1));
                else v.vibrate(pattern, 1);
            }
        } catch (RuntimeException ignored) {
            // no vibrator
        }
        notifyCall(app, title, body);
        HANDLER.removeCallbacks(STOP);
        HANDLER.postDelayed(STOP, RING_MS);
    }

    static synchronized void stop(Context context) {
        HANDLER.removeCallbacks(STOP);
        try {
            if (ringtone != null) ringtone.stop();
        } catch (RuntimeException ignored) {
            // already stopped
        }
        ringtone = null;
        if (context == null) return;
        try {
            Vibrator v = (Vibrator) context.getApplicationContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        } catch (RuntimeException ignored) {
            // no vibrator
        }
        NotificationManagerCompat.from(context.getApplicationContext()).cancel(NOTIFICATION_ID);
    }

    /** During a call (`active`): the voice to the loudspeaker (`speaker`) or the earpiece; after it, back to normal. */
    static void audio(Context context, boolean active, boolean speaker) {
        try {
            AudioManager am = (AudioManager) context.getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (!active) {
                am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
                return;
            }
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            am.setSpeakerphoneOn(speaker);
        } catch (RuntimeException ignored) {
            // the phone refused - the voice stays where it is
        }
    }

    private static void notifyCall(Context app, String title, String body) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager manager = app.getSystemService(NotificationManager.class);
                if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "المكالمات", NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription("مكالمة صوتية واردة من الفريق أو مندوب");
                    channel.setSound(null, null); // the ringtone plays by itself (looping)
                    manager.createNotificationChannel(channel);
                }
            }
            Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
            NotificationCompat.Builder b = new NotificationCompat.Builder(app, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_phone_call)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(true)
                .setTimeoutAfter(RING_MS);
            if (launch != null) {
                launch.setAction(Intent.ACTION_MAIN);
                launch.putExtra(PhoneShortcuts.EXTRA_ROUTE, "/chat");
                launch.putExtra(RouteOnce.EXTRA_ID, "call-" + System.currentTimeMillis());
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
                PendingIntent pi = PendingIntent.getActivity(app, NOTIFICATION_ID, launch, flags);
                b.setContentIntent(pi);
                b.setFullScreenIntent(pi, true);
            }
            NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException | IllegalArgumentException ignored) {
            // notifications off - the ringtone still rings
        }
    }
}
