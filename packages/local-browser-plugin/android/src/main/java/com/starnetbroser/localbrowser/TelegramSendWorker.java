package com.starnetbroser.localbrowser;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * Sends one text message to the operator's Telegram chat - queued through WorkManager so it goes
 * out even if the phone is offline right now (retried with backoff once there's a network) and
 * even if the app is closed. Also delivers the scheduled morning/evening summaries: the app
 * schedules them with their text fixed (like the phone notifications), replacing the previous one.
 */
public class TelegramSendWorker extends Worker {

    static final String INPUT_TEXT = "text";
    private static final String SCHEDULED_PREFIX = "starnet_telegram_";

    public TelegramSendWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String text = getInputData().getString(INPUT_TEXT);
        if (text == null || text.trim().isEmpty() || !TelegramStore.isConfigured(context)) {
            return Result.success();
        }
        try {
            TelegramClient.sendMessage(TelegramStore.token(context), TelegramStore.chatId(context), text);
            return Result.success();
        } catch (IOException offline) {
            return getRunAttemptCount() < 8 ? Result.retry() : Result.failure();
        } catch (TelegramClient.TelegramError rejected) {
            // Bad token / chat gone - retrying can't fix it; Settings shows the connection state.
            return Result.failure();
        }
    }

    private static OneTimeWorkRequest.Builder request(String text) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        return new OneTimeWorkRequest.Builder(TelegramSendWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInputData(new Data.Builder().putString(INPUT_TEXT, TelegramText.truncate(text, TelegramText.MAX_MESSAGE_CHARS)).build());
    }

    /** Sends as soon as there's a network. */
    static void enqueue(Context context, String text) {
        if (!TelegramStore.isConfigured(context)) return;
        WorkManager.getInstance(context).enqueue(request(text).build());
    }

    /** Sends at `atMillis` (or right away if that's past), replacing whatever was scheduled under
     * the same key ("morning", "evening"). */
    static void schedule(Context context, String key, long atMillis, String text) {
        long delay = Math.max(0, atMillis - System.currentTimeMillis());
        WorkManager.getInstance(context).enqueueUniqueWork(
            SCHEDULED_PREFIX + key,
            ExistingWorkPolicy.REPLACE,
            request(text).setInitialDelay(delay, TimeUnit.MILLISECONDS).build()
        );
    }

    static void cancel(Context context, String key) {
        WorkManager.getInstance(context).cancelUniqueWork(SCHEDULED_PREFIX + key);
    }
}
