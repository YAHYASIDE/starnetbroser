package com.starnetbroser.localbrowser;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Brings the Telegram replies back after the phone restarts or the app is updated. */
public class TelegramBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            TelegramReplyService.refresh(context);
        }
    }
}
