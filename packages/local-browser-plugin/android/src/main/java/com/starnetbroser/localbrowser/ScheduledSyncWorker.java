package com.starnetbroser.localbrowser;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.webkit.WebViewFeature;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * ⏰ «مزامنات مجدولة» (ScheduledSyncPlan): wakes at his hours and hands the devices to the 🌙
 * background sync (BackgroundSyncService - the only way Starlink's page really draws with no
 * screen), then schedules its next day.
 *  - KIND_MORNING (8:00): 💳 yesterday's renewals first («فحص الدفع»), then 🌅 today's + tomorrow's.
 *  - KIND_NIGHT: 🌙 the day's syncs on the owner's bot (ScheduledSyncText.nightSummary).
 *  - KIND_RETRY: 🔁 the devices a 429 left, once Starlink's cooldown is over.
 */
public class ScheduledSyncWorker extends Worker {

    static final String INPUT_KIND = "kind";
    static final String KIND_MORNING = "morning";
    static final String KIND_NIGHT = "night";
    static final String KIND_RETRY = "retry";
    /** ⏳ A charge recorded before its invoice came down (web lib/awaitingBill.ts): that device alone. */
    static final String KIND_BILL = "bill";
    static final String INPUT_ACCOUNT_ID = "accountId";
    static final String INPUT_ACCOUNT_NAME = "accountName";
    static final String BILL_LABEL = "⏳ فحص الفاتورة بعد الشحن";
    /** The most checks one charge schedules (15 min, 1 h, 3 h). */
    static final int BILL_CHECKS_MAX = 3;
    private static final String WORK_PREFIX = "starnet_scheduled_";

    static final String MORNING_LABEL = "🌅 مزامنة الصباح - أجهزة اليوم وغدًا";
    static final String PAYMENT_LABEL = "💳 فحص الدفع بعد التجديد";

    public ScheduledSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    // ---- scheduling ----

    /** Idempotent: (re)schedules the morning and night runs from his choices (and cancels them). */
    static void apply(Context context) {
        if (ScheduledSyncStore.morning(context) || ScheduledSyncStore.payment(context)) {
            enqueue(context, KIND_MORNING, ScheduledSyncPlan.delayUntilHour(Calendar.getInstance(), ScheduledSyncStore.morningHour(context)));
        } else {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_PREFIX + KIND_MORNING);
        }
        if (ScheduledSyncStore.night(context)) {
            enqueue(context, KIND_NIGHT, ScheduledSyncPlan.delayUntilHour(Calendar.getInstance(), ScheduledSyncStore.nightHour(context)));
        } else {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_PREFIX + KIND_NIGHT);
        }
    }

    /**
     * 🔁 After a 429: keeps these devices and wakes once the cooldown is over. Returns the delay,
     * or -1 when the retry is off or its retries are used up (he decides then).
     */
    static long scheduleRetry(Context context, List<ScheduledSyncStore.Pending> devices) {
        if (!ScheduledSyncStore.retry(context) || devices.isEmpty()) return -1;
        int retries = ScheduledSyncStore.retries(context);
        if (!ScheduledSyncPlan.mayRetry(retries)) return -1;
        ScheduledSyncStore.setRetries(context, retries + 1);
        ScheduledSyncStore.addPending(context, devices);
        enqueue(context, KIND_RETRY, ScheduledSyncPlan.RETRY_DELAY_MS);
        return ScheduledSyncPlan.RETRY_DELAY_MS;
    }

    /** ⏳ (Re)schedules a device's invoice checks - one background sync of it after each delay. */
    static void scheduleBillChecks(Context context, String accountId, String accountName, long[] delaysMs) {
        cancelBillChecks(context, accountId);
        int n = Math.min(delaysMs.length, BILL_CHECKS_MAX);
        for (int i = 0; i < n; i++) {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ScheduledSyncWorker.class)
                .setInitialDelay(Math.max(0, delaysMs[i]), TimeUnit.MILLISECONDS)
                .setInputData(new Data.Builder()
                    .putString(INPUT_KIND, KIND_BILL)
                    .putString(INPUT_ACCOUNT_ID, accountId)
                    .putString(INPUT_ACCOUNT_NAME, accountName != null ? accountName : "")
                    .build())
                .build();
            WorkManager.getInstance(context).enqueueUniqueWork(billWorkName(accountId, i), ExistingWorkPolicy.REPLACE, request);
        }
    }

    /** The invoice came (or the charge is gone): its remaining checks are dropped. */
    static void cancelBillChecks(Context context, String accountId) {
        for (int i = 0; i < BILL_CHECKS_MAX; i++) WorkManager.getInstance(context).cancelUniqueWork(billWorkName(accountId, i));
    }

    private static String billWorkName(String accountId, int i) {
        return WORK_PREFIX + KIND_BILL + "_" + accountId + "_" + i;
    }

    private static void enqueue(Context context, String kind, long delayMs) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ScheduledSyncWorker.class)
            .setInitialDelay(Math.max(0, delayMs), TimeUnit.MILLISECONDS)
            .setInputData(new Data.Builder().putString(INPUT_KIND, kind).build())
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_PREFIX + kind, ExistingWorkPolicy.REPLACE, request);
    }

    // ---- the runs ----

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String kind = getInputData().getString(INPUT_KIND);
        try {
            if (KIND_MORNING.equals(kind)) morning(context);
            else if (KIND_NIGHT.equals(kind)) night(context);
            else if (KIND_RETRY.equals(kind)) retry(context);
            else if (KIND_BILL.equals(kind)) bill(context);
        } finally {
            // The next day's run (a retry or an invoice check is one-off).
            if (KIND_MORNING.equals(kind) || KIND_NIGHT.equals(kind)) apply(context);
        }
        return Result.success();
    }

    private void morning(Context context) {
        List<AutoSyncAccountStore.Entry> entries = AutoSyncAccountStore.load(context);
        Map<String, SyncStateStore.State> states = SyncStateStore.load(context);
        List<ScheduledSyncPlan.Device> devices = new ArrayList<>();
        for (AutoSyncAccountStore.Entry entry : entries) {
            SyncStateStore.State state = states.get(entry.accountId);
            devices.add(new ScheduledSyncPlan.Device(
                entry.accountId,
                entry.accountName,
                SyncPriority.laterDate(entry.renewalDate, state != null ? state.renewalDate : null),
                entry.limited
            ));
        }
        Calendar now = Calendar.getInstance();
        long today = SyncPriority.epochDay(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
        List<ScheduledSyncPlan.Pick> picks = ScheduledSyncPlan.morning(devices, today, ScheduledSyncStore.morning(context), ScheduledSyncStore.payment(context));
        if (picks.isEmpty()) return;
        List<ScheduledSyncStore.Pending> payment = new ArrayList<>();
        List<ScheduledSyncStore.Pending> renewals = new ArrayList<>();
        for (ScheduledSyncPlan.Pick pick : picks) {
            if (ScheduledSyncPlan.PAYMENT.equals(pick.reason)) {
                payment.add(new ScheduledSyncStore.Pending(pick.accountId, pick.accountName, ScheduledSyncStore.MODE_PAYMENT, PAYMENT_LABEL));
            } else {
                renewals.add(new ScheduledSyncStore.Pending(pick.accountId, pick.accountName, ScheduledSyncStore.MODE_SYNC, MORNING_LABEL));
            }
        }
        List<ScheduledSyncStore.Pending> all = new ArrayList<>(payment);
        all.addAll(renewals);
        // Starlink still asks to slow down: the whole morning waits for the retry.
        if (SyncPacing.inCooldown(SyncPacing.rateLimitedAt(context), System.currentTimeMillis())) {
            ScheduledSyncStore.addPending(context, all);
            enqueue(context, KIND_RETRY, SyncPacing.COOLDOWN_MS - (System.currentTimeMillis() - SyncPacing.rateLimitedAt(context)) + 60_000);
            return;
        }
        ScheduledSyncStore.setRetries(context, 0);
        startAll(context, all, "🌅");
    }

    /** ⏳ One device's invoice check; skipped while Starlink asks to slow down (the next check comes). */
    private void bill(Context context) {
        String id = getInputData().getString(INPUT_ACCOUNT_ID);
        if (id == null || id.isEmpty()) return;
        if (SyncPacing.inCooldown(SyncPacing.rateLimitedAt(context), System.currentTimeMillis())) return;
        List<ScheduledSyncStore.Pending> one = new ArrayList<>();
        String name = getInputData().getString(INPUT_ACCOUNT_NAME);
        one.add(new ScheduledSyncStore.Pending(id, name != null ? name : "", ScheduledSyncStore.MODE_SYNC, BILL_LABEL));
        startAll(context, one, "⏳");
    }

    private void retry(Context context) {
        List<ScheduledSyncStore.Pending> pending = ScheduledSyncStore.takePending(context);
        if (pending.isEmpty()) return;
        startAll(context, pending, "🔁");
    }

    /** Hands the devices to the background sync, one group per mode; tells him when it can't. */
    private void startAll(Context context, List<ScheduledSyncStore.Pending> devices, String icon) {
        if (!BackgroundSyncService.canRun(context) || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            // Kept for his next «مزامنة الآن»: nothing is lost.
            String text = icon + " لم تبدأ المزامنة المجدولة (" + devices.size() + " جهاز): اسمح لـ STAR NET بـ«الظهور فوق التطبيقات» في الإعدادات";
            AppEventNotifier.post(context, text, "/settings");
            TelegramSendWorker.enqueue(context, text);
            return;
        }
        for (String mode : new String[] {ScheduledSyncStore.MODE_PAYMENT, ScheduledSyncStore.MODE_TRAVEL, ScheduledSyncStore.MODE_SYNC}) {
            List<String> ids = new ArrayList<>();
            List<String> names = new ArrayList<>();
            String label = null;
            for (ScheduledSyncStore.Pending device : devices) {
                if (!mode.equals(device.mode)) continue;
                ids.add(device.accountId);
                names.add(device.accountName);
                if (label == null) label = device.label;
            }
            if (ids.isEmpty()) continue;
            boolean started = BackgroundSyncService.startFromBackground(
                context, ids.toArray(new String[0]), names.toArray(new String[0]), label != null ? label : "", mode);
            if (!started) {
                String text = icon + " لم يسمح أندرويد ببدء المزامنة المجدولة الآن - افتح STAR NET واضغط «مزامنة الآن»";
                AppEventNotifier.post(context, text, AppEventText.HOME_ROUTE);
                return;
            }
        }
    }

    private void night(Context context) {
        Map<String, AutoSyncAccountStore.Entry> byId = new HashMap<>();
        for (AutoSyncAccountStore.Entry entry : AutoSyncAccountStore.load(context)) byId.put(entry.accountId, entry);
        List<String> names = new ArrayList<>();
        List<String> outcomes = new ArrayList<>();
        for (String[] item : ScheduledSyncStore.todaysLog(context)) {
            AutoSyncAccountStore.Entry entry = byId.get(item[0]);
            if (entry == null) continue;
            names.add(entry.accountName);
            outcomes.add(item[1]);
        }
        Map<String, SyncStateStore.State> states = SyncStateStore.load(context);
        long listPushedAt = SyncPacing.listPushedAt(context);
        List<String> stopped = new ArrayList<>();
        for (AutoSyncAccountStore.Entry entry : byId.values()) {
            SyncStateStore.State state = states.get(entry.accountId);
            String status = SyncPriority.currentStatus(entry.serviceStatus, state != null ? state.serviceStatus : null, state != null ? state.visitedAt : 0, listPushedAt);
            if (SyncPriority.isStopped(status)) stopped.add(entry.accountName);
        }
        String text = ScheduledSyncText.nightSummary(names, outcomes, stopped);
        if (TelegramStore.isConfigured(context)) TelegramSendWorker.enqueue(context, text);
        else AppEventNotifier.post(context, text, AppEventText.HOME_ROUTE);
    }
}
