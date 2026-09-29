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
    private static final String LIVE_CHECK_WORK_NAME = "starnet_live_check_";

    /** How often the worker wakes to see which devices are due (SyncPriority decides which, and
     * most wakes find few or none) - not how often each device is synced. */
    private static final long CHECK_EVERY_MINUTES = 30;

    private AutoSyncScheduler() {
    }

    /** Idempotent: safe to call every time the account list changes, even if already scheduled. */
    static void schedule(Context context) {
        if (!SyncPacing.isEnabled(context)) {
            // Turned off in الإعدادات - "مزامنة الآن" and each card's "تحديث" still work.
            cancel(context);
            return;
        }
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(AutoSyncWorker.class, CHECK_EVERY_MINUTES, TimeUnit.MINUTES)
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
        triggerNow(context, accountId, false);
    }

    /** `quiet`: a rep's 📶 check - no "تم تحديث" notification on the owner's phone. */
    static void triggerNow(Context context, String accountId, boolean quiet) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(AutoSyncWorker.class)
            .setConstraints(constraints);
        if (accountId != null && !accountId.trim().isEmpty()) {
            builder.setInputData(new Data.Builder().putString(AutoSyncWorker.INPUT_ACCOUNT_ID, accountId).putBoolean(AutoSyncWorker.INPUT_MANUAL, true)
                .putBoolean(AutoSyncWorker.INPUT_QUIET, quiet).build());
        } else {
            builder.setInputData(new Data.Builder().putBoolean(AutoSyncWorker.INPUT_MANUAL, true).build());
        }
        // A rep's check has its own work name per device, so it never cancels the owner's own
        // "مزامنة الآن" / "تحديث" (KEEP: a check already running for that device answers both).
        if (quiet && accountId != null && !accountId.trim().isEmpty()) {
            WorkManager.getInstance(context)
                .enqueueUniqueWork(LIVE_CHECK_WORK_NAME + accountId, ExistingWorkPolicy.KEEP, builder.build());
            return;
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, builder.build());
    }
}
