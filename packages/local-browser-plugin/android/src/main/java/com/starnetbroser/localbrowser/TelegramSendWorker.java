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
    static final String INPUT_BOT = "bot";
    static final String INPUT_CHAT_ID = "chatId";
    private static final String SCHEDULED_PREFIX = "starnet_telegram_";

    public TelegramSendWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String text = getInputData().getString(INPUT_TEXT);
        String bot = getInputData().getString(INPUT_BOT);
        boolean reps = TelegramStore.REPS.equals(bot);
        // The reps bot only ever writes to a rep the operator linked (checked again at send time,
        // so unlinking a rep also stops anything still queued for him).
        String chatId = reps ? getInputData().getString(INPUT_CHAT_ID) : TelegramStore.chatId(context);
        String token = TelegramStore.tokenFor(context, bot);
        if (text == null || text.trim().isEmpty() || token == null || chatId == null) {
            return Result.success();
        }
        if (reps && !TelegramStore.isLinkedRepChat(context, chatId)) {
            return Result.success();
        }
        try {
            TelegramClient.sendMessage(token, chatId, text);
            return Result.success();
        } catch (IOException offline) {
            return getRunAttemptCount() < 8 ? Result.retry() : Result.failure();
        } catch (TelegramClient.TelegramError rejected) {
            // Bad token / chat gone - retrying can't fix it; Settings shows the connection state.
            return Result.failure();
        }
    }

    private static OneTimeWorkRequest.Builder request(String text, String bot, String chatId) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        Data.Builder data = new Data.Builder()
            .putString(INPUT_TEXT, TelegramText.truncate(text, TelegramText.MAX_MESSAGE_CHARS))
            .putString(INPUT_BOT, bot == null ? TelegramStore.OWNER : bot);
        if (chatId != null) data.putString(INPUT_CHAT_ID, chatId);
        return new OneTimeWorkRequest.Builder(TelegramSendWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInputData(data.build());
    }

    /** To the operator, as soon as there's a network. */
    static void enqueue(Context context, String text) {
        if (!TelegramStore.isConfigured(context)) return;
        WorkManager.getInstance(context).enqueue(request(text, TelegramStore.OWNER, null).build());
    }

    /** To one linked rep through the reps bot. */
    static void enqueueToRep(Context context, String chatId, String text) {
        if (!TelegramStore.isRepsConfigured(context) || !TelegramStore.isLinkedRepChat(context, chatId)) return;
        WorkManager.getInstance(context).enqueue(request(text, TelegramStore.REPS, chatId).build());
    }

    /** Sends at `atMillis` (or right away if that's past), replacing whatever was scheduled under
     * the same key ("morning", "evening", "rep_<id>"). */
    static void schedule(Context context, String key, long atMillis, String text, String bot, String chatId) {
        long delay = Math.max(0, atMillis - System.currentTimeMillis());
        WorkManager.getInstance(context).enqueueUniqueWork(
            SCHEDULED_PREFIX + key,
            ExistingWorkPolicy.REPLACE,
            request(text, bot, chatId).setInitialDelay(delay, TimeUnit.MILLISECONDS).build()
        );
    }

    static void cancel(Context context, String key) {
        WorkManager.getInstance(context).cancelUniqueWork(SCHEDULED_PREFIX + key);
    }
}
