package com.starnetbroser.localbrowser;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;

/**
 * 🔔 A light sound with each «it couldn't finish» message of the automatic sign-in and code
 * reading (a refused password, a page that doesn't move on, no code arrived): the phone's own
 * notification tone, at its notification volume (silent mode stays silent). At most once every few
 * seconds, so two messages together ring once. Never throws.
 */
final class AlertSound {

    private AlertSound() {}

    private static final long MIN_GAP_MS = 3000;
    private static long lastAt;

    static synchronized void play(Context context) {
        long now = System.currentTimeMillis();
        if (now - lastAt < MIN_GAP_MS) return;
        lastAt = now;
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone tone = uri == null ? null : RingtoneManager.getRingtone(context.getApplicationContext(), uri);
            if (tone == null) return;
            tone.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            tone.play();
        } catch (RuntimeException ignored) {
            // no tone on this phone - the message itself is still shown
        }
    }
}
