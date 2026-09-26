package com.starnetbroser.localbrowser;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/**
 * Schedules/cancels AutoSyncWorker as a single named periodic job. WorkManager (not a raw Service
 * or AlarmManager) is the platform-sanctioned way to run this kind of deferred, periodic
 * background work post-Android 8's background execution limits - the system decides exactly when
 * within each window to actually run it (batched with other apps' jobs, deferred under Doze),
 * which this app has no way to verify precisely without a real device.
 *
 * Every run requires network connectivity - there is nothing useful to do otherwise. Hourly is
 * the interval WorkManager's minimum (15 minutes) comfortably allows while keeping battery/data
 * use modest for a background job most users will never look at directly.
 */
final class AutoSyncScheduler {

    static final String WORK_NAME = "starnet_auto_sync";
    private static final String IMMEDIATE_WORK_NAME = "starnet_auto_sync_now";
    private static final long INTERVAL_HOURS = 1;

    private AutoSyncScheduler() {
    }

    /** Idempotent: safe to call every time the account list changes, even if already scheduled. */
    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(AutoSyncWorker.class, INTERVAL_HOURS, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    /** Called once the account list becomes empty - never leave a periodic job running with
     * nothing for it to do. */
    static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
    }

    /**
     * "مزامنة الآن" (global) or a single card's own "تحديث" button: runs the exact same
     * AutoSyncWorker right away instead of waiting for the next periodic window. A separate
     * unique work name from the periodic job (WORK_NAME) so triggering this never disturbs the
     * periodic schedule itself; REPLACE means triggering this again (whether for the same account,
     * a different one, or the whole list) while one is still running simply restarts it rather
     * than queuing duplicates - only one manual sync is ever in flight at a time.
     *
     * @param accountId when non-null, only that one account is synced this run (see
     *     AutoSyncWorker#INPUT_ACCOUNT_ID) - null syncs every account, same as before.
     */
    static void triggerNow(Context context, String accountId) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(AutoSyncWorker.class)
            .setConstraints(constraints);
        if (accountId != null && !accountId.trim().isEmpty()) {
            builder.setInputData(new Data.Builder().putString(AutoSyncWorker.INPUT_ACCOUNT_ID, accountId).build());
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, builder.build());
    }
}
