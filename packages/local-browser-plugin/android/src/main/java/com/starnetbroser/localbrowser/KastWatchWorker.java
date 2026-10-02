package com.starnetbroser.localbrowser;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

/** 💳 KastWatch every hour (and once now, when the app opens) - even with the app closed. */
public class KastWatchWorker extends Worker {

    private static final String PERIODIC = "starnet_kast_watch";
    private static final String NOW = "starnet_kast_watch_now";

    public KastWatchWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        KastWatch.runOnce(getApplicationContext());
        return Result.success();
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void schedule(Context context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(KastWatchWorker.class, 1, TimeUnit.HOURS).setConstraints(online()).build());
    }

    static void checkNow(Context context) {
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(KastWatchWorker.class).setConstraints(online()).build());
    }
}
