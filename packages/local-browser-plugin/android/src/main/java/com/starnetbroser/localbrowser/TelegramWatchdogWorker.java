package com.starnetbroser.localbrowser;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

/**
 * Every 15 minutes (the shortest WorkManager allows): if the phone killed TelegramReplyService
 * (some brands do when the app is swiped away), start it again - and if Android won't let us
 * right now, answer whatever is waiting in the bots ourselves. So a rep is never left unanswered
 * for more than a quarter of an hour, even on the strictest phones.
 */
public class TelegramWatchdogWorker extends Worker {

    private static final String WORK_NAME = "starnet_telegram_watchdog";

    public TelegramWatchdogWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!TelegramReplyService.shouldRun(context) || TelegramReplyService.isPolling()) return Result.success();
        if (TelegramReplyService.refresh(context)) return Result.success(); // the service takes over
        TelegramReplyService.pollOnce(context, TelegramStore.OWNER);
        TelegramReplyService.pollOnce(context, TelegramStore.REPS);
        return Result.success();
    }

    static void schedule(Context context, boolean enabled) {
        WorkManager manager = WorkManager.getInstance(context);
        if (!enabled) {
            manager.cancelUniqueWork(WORK_NAME);
            return;
        }
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        manager.enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(TelegramWatchdogWorker.class, 15, TimeUnit.MINUTES).setConstraints(constraints).build()
        );
    }
}
