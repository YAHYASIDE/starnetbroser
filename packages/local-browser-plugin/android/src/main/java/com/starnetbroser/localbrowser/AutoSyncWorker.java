package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.JSObject;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Periodic background counterpart to AccountBrowserActivity's manual "تحديث من Starlink" tap -
 * scheduled/cancelled by AutoSyncScheduler, run unattended (no visible screen) once per period for
 * every account in AutoSyncAccountStore. Reuses the exact same isolation (ProfileNaming/
 * WebViewCompat#setProfile), allow-list (AllowedUrl) and extraction pipeline (StarlinkExtractorSupport
 * + PendingSyncStore) as the manual flow's own Stage-1 read - unlike the manual tap (which now also
 * drives the Stage-2 navigation sequence in navigation.ts to reach "الاشتراك"/"الفوترة"), this
 * worker still only ever reads the single `entry.url` (the account's Home page) it's given - a
 * deliberate, scoped-down first cut, since a background run has no screen to visibly hop through
 * several pages on the way, and doing so unattended would need its own review before being wired
 * up the same way. The WebView here is never attached to a window and nothing is ever shown to the
 * user, either way.
 *
 * This never logs an account in by itself: an account whose isolated profile has no cookies yet
 * (never opened via "فتح") simply yields no fields on every run, exactly like a manual sync tap on
 * a logged-out page - `fields.length() == 0` is treated as "nothing to save", not an error.
 *
 * WebView APIs are main-thread-only, but Worker#doWork() runs on a WorkManager background thread -
 * each account's WebView work is posted to the main Looper and the background thread blocks on a
 * per-account CountDownLatch (bounded by PER_ACCOUNT_TIMEOUT_MS) so one stuck page can never hang
 * the whole batch indefinitely or run past WorkManager's own execution time limit.
 */
public class AutoSyncWorker extends Worker {

    /** Worker input Data key (see AutoSyncScheduler#triggerNow) - when present, this run only
     * syncs that one account instead of every account in AutoSyncAccountStore. Used by the
     * per-card "تحديث" button, which has no reason to touch every other account just because the
     * user asked about one. */
    static final String INPUT_ACCOUNT_ID = "accountId";

    /** Set on "مزامنة الآن" / a card's "تحديث" (AutoSyncScheduler#triggerNow): runs even when the
     * automatic sync is off, visits every important device (not just the due ones) and reports
     * "تم تحديث ..." when done. The scheduled checks leave it unset and stay silent unless a device
     * newly stopped. */
    static final String INPUT_MANUAL = "manual";

    /** A rep's 📶 in the reps bot: a manual one-device run without the owner's "تم تحديث"
     * notification - its reading goes to LiveCheckStore for TelegramReplyService. */
    static final String INPUT_QUIET = "quiet";

    /** Extra wait after onPageFinished before reading the page: the Starlink portal is a
     * client-rendered SPA whose account data is often still filling in when the network load
     * itself completes - the exact same assumption a human tester would make by waiting a moment
     * before tapping "تحديث من Starlink" themselves. */
    private static final long SETTLE_DELAY_MS = 3000;
    private static final long PER_ACCOUNT_TIMEOUT_MS = 25000;
    /** A one-device update also opens the subscription's "الأجهزة" list (see readDevices) - a few
     * more page settles on top of the Home page's. */
    private static final long DEEP_ACCOUNT_TIMEOUT_MS = 50000;
    /** Wait after each tap of that walk, for the SPA to render the next page. */
    private static final long STEP_DELAY_MS = 3000;
    private static final long DEVICES_SETTLE_MS = 4500;
    private static final int ICON_RAIL_INDEX_SUBSCRIPTIONS = 1;

    /** This run refreshes one device ("تحديث" on its card): also read its dish/Wi-Fi dots. */
    private volatile boolean deepRead;

    // WorkManager instantiates a fresh Worker for every run (periodic tick or one-time "مزامنة
    // الآن" trigger alike), so this is always this run's own count, never carried over from a
    // previous one.
    private final AtomicInteger syncedAccountCount = new AtomicInteger();

    /** Set when Starlink answered "429 Too many requests" during this run - the rest of the run
     * is abandoned and SyncPacing's cooldown pauses the next ones. */
    private final AtomicBoolean rateLimited = new AtomicBoolean(false);

    /** One full (every-account) run at a time in this process: the hourly run and a "مزامنة
     * الآن" run are separate WorkManager jobs and could otherwise load pages side by side. */
    private static final AtomicBoolean FULL_RUN_ACTIVE = new AtomicBoolean(false);

    /** What each visited page showed this run: accountId -> {serviceStatus, renewalDate}. */
    private final Map<String, String[]> pageValues = new ConcurrentHashMap<>();
    /** {dishStatus, wifiStatus} read on the الأجهزة page, per device (a deep read). */
    private final Map<String, String[]> dotValues = new ConcurrentHashMap<>();
    private static final long WAIT_FOR_OTHER_RUN_MS = 35_000;

    public AutoSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Never fall back to a shared/unisolated session on a device that can't do Multi-Profile -
        // same rule AccountBrowserActivity/LocalBrowserPlugin already enforce for the manual flow.
        Context context = getApplicationContext();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            recordFailedCheck(context);
            return Result.success();
        }

        boolean manual = getInputData().getBoolean(INPUT_MANUAL, false);
        if (!manual && !SyncPacing.isEnabled(context)) {
            return Result.success();
        }
        List<AutoSyncAccountStore.Entry> entries = AutoSyncAccountStore.load(context);

        String filterAccountId = getInputData().getString(INPUT_ACCOUNT_ID);
        if (filterAccountId != null && !filterAccountId.trim().isEmpty()) {
            List<AutoSyncAccountStore.Entry> filtered = new ArrayList<>();
            for (AutoSyncAccountStore.Entry entry : entries) {
                if (entry.accountId.equals(filterAccountId)) {
                    filtered.add(entry);
                    break;
                }
            }
            entries = filtered;
        }

        if (entries.isEmpty()) {
            recordFailedCheck(context);
            return Result.success();
        }

        // Starlink asked us to slow down recently - try again on a later run.
        if (SyncPacing.inCooldown(SyncPacing.rateLimitedAt(context), System.currentTimeMillis())) {
            recordFailedCheck(context);
            return Result.success();
        }

        boolean fullRun = filterAccountId == null || filterAccountId.trim().isEmpty();
        if (fullRun) {
            // A replaced "مزامنة الآن" run may still be winding down - give it a moment.
            long waitUntil = System.currentTimeMillis() + WAIT_FOR_OTHER_RUN_MS;
            while (!FULL_RUN_ACTIVE.compareAndSet(false, true)) {
                if (System.currentTimeMillis() > waitUntil || !sleepUnlessStopped(500)) {
                    return Result.success();
                }
            }
        }
        try {
            return runAccounts(context, entries, fullRun, manual);
        } finally {
            if (fullRun) {
                FULL_RUN_ACTIVE.set(false);
            }
        }
    }

    private Result runAccounts(Context context, List<AutoSyncAccountStore.Entry> entries, boolean fullRun, boolean manual) {
        // One device's own "تحديث" also reads its dish/Wi-Fi dots; a run over many devices stays
        // on the Home page, so it keeps its pace (and Starlink's rate limit).
        deepRead = !fullRun;
        String script;
        try {
            script = StarlinkExtractorSupport.loadExtractScript(context);
        } catch (IOException e) {
            return Result.retry();
        }

        // What's known about each device right now: the app's own date/status, updated by what
        // earlier visits read (SyncStateStore) - so priorities stay right while the app is closed.
        long now = System.currentTimeMillis();
        Calendar calendar = Calendar.getInstance();
        long today = SyncPriority.epochDay(
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH)
        );
        Map<String, SyncStateStore.State> states = SyncStateStore.load(context);
        long listPushedAt = SyncPacing.listPushedAt(context);
        Map<String, String> statusBefore = new HashMap<>();
        Map<String, AutoSyncAccountStore.Entry> byId = new HashMap<>();
        List<SyncPriority.Candidate> candidates = new ArrayList<>();
        for (AutoSyncAccountStore.Entry entry : entries) {
            SyncStateStore.State state = states.get(entry.accountId);
            String status = SyncPriority.currentStatus(
                entry.serviceStatus,
                state != null ? state.serviceStatus : null,
                state != null ? state.visitedAt : 0,
                listPushedAt
            );
            String renewal = SyncPriority.laterDate(entry.renewalDate, state != null ? state.renewalDate : null);
            statusBefore.put(entry.accountId, status);
            byId.put(entry.accountId, entry);
            candidates.add(new SyncPriority.Candidate(
                entry.accountId,
                SyncPriority.refreshHours(renewal, status, today),
                state != null ? state.visitedAt : 0
            ));
        }
        if (fullRun) {
            // Only the important devices (7/3/1 days, just expired, stopped), most urgent first -
            // a scheduled check takes the due ones, "مزامنة الآن" all of them.
            List<AutoSyncAccountStore.Entry> ordered = new ArrayList<>();
            for (String id : SyncPriority.order(candidates, now, !manual)) {
                ordered.add(byId.get(id));
            }
            entries = ordered;
        }
        List<String> newlyStopped = new ArrayList<>();
        List<String> newlyStoppedReps = new ArrayList<>();

        long startedAt = System.currentTimeMillis();
        Random random = new Random();
        for (int i = 0; i < entries.size(); i++) {
            if (isStopped() || rateLimited.get()) {
                break;
            }
            if (i > 0) {
                if (!SyncPacing.hasTimeForAnother(startedAt, System.currentTimeMillis())) {
                    break;
                }
                // One account at a time, with a pause - a burst of page loads from one phone is
                // exactly what Starlink answers with "429 Too many requests".
                if (!sleepUnlessStopped(SyncPacing.gapMs(random))) {
                    break;
                }
            }
            AutoSyncAccountStore.Entry entry = entries.get(i);
            syncOneAccountBlocking(context, entry, script);
            if (deepRead) {
                String[] dots = dotValues.get(entry.accountId);
                LiveCheckStore.put(context, entry.accountId, System.currentTimeMillis(), dots != null ? dots[0] : "", dots != null ? dots[1] : "");
            }
            if (rateLimited.get()) {
                // Not a real visit - leave it due so it's tried again after the cooldown.
                break;
            }
            // Recorded even when the page showed nothing (logged out, slow), so a device that
            // can't be read isn't retried on every single check.
            String[] page = pageValues.get(entry.accountId);
            SyncStateStore.State visited = SyncStateStore.afterVisit(
                states.get(entry.accountId),
                System.currentTimeMillis(),
                page != null ? page[0] : null,
                page != null ? page[1] : null
            );
            SyncStateStore.put(context, entry.accountId, visited);
            if (page != null && SyncPriority.isStopped(page[0]) && !SyncPriority.isStopped(statusBefore.get(entry.accountId))) {
                newlyStopped.add(entry.accountName);
                newlyStoppedReps.add(entry.representativeId);
            }
        }
        SyncNotifier.notifyStopped(context, newlyStopped);
        if (!newlyStopped.isEmpty() && TelegramStore.isStoppedEnabled(context)) {
            TelegramSendWorker.enqueue(context, TelegramText.stoppedMessage(newlyStopped));
        }
        if (!newlyStopped.isEmpty() && TelegramStore.isRepsConfigured(context) && TelegramStore.isRepsStoppedEnabled(context)) {
            Map<String, String> repChats = TelegramStore.repChats(context);
            for (Map.Entry<String, List<String>> group : TelegramText.groupByRep(newlyStoppedReps, newlyStopped).entrySet()) {
                String chatId = repChats.get(group.getKey());
                if (chatId != null) TelegramSendWorker.enqueueToRep(context, chatId, TelegramText.repStoppedMessage(group.getValue()));
            }
        }
        if (manual && !getInputData().getBoolean(INPUT_QUIET, false)) {
            SyncNotifier.notifySyncCompleted(context, syncedAccountCount.get());
        }
        return Result.success();
    }

    /** A one-device run that can't start: the 📶 waiting in the reps bot hears it at once. */
    private void recordFailedCheck(Context context) {
        String accountId = getInputData().getString(INPUT_ACCOUNT_ID);
        if (accountId != null && !accountId.trim().isEmpty()) LiveCheckStore.put(context, accountId, System.currentTimeMillis(), "", "");
    }

    /** Sleeps in short steps so a cancelled run stops promptly; false when it was stopped. */
    private boolean sleepUnlessStopped(long ms) {
        long until = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < until) {
            if (isStopped()) {
                return false;
            }
            try {
                Thread.sleep(Math.min(500, Math.max(1, until - System.currentTimeMillis())));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return !isStopped();
    }

    private void syncOneAccountBlocking(Context context, AutoSyncAccountStore.Entry entry, String script) {
        if (!AllowedUrl.isAllowed(entry.url)) {
            return;
        }
        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(entry.accountId);
        } catch (RuntimeException ex) {
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        new Handler(Looper.getMainLooper()).post(
            () -> runOneAccountOnMainThread(context, entry, profileName, script, latch)
        );
        try {
            latch.await(deepRead ? DEEP_ACCOUNT_TIMEOUT_MS : PER_ACCOUNT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void runOneAccountOnMainThread(
        Context context,
        AutoSyncAccountStore.Entry entry,
        String profileName,
        String script,
        CountDownLatch latch
    ) {
        // Ensure the profile exists (idempotent) before the WebView touches anything, per
        // androidx.webkit's required call order - same as AccountBrowserActivity.
        ProfileStore.getInstance().getOrCreateProfile(profileName);

        WebView webView = new WebView(context);
        WebViewCompat.setProfile(webView, profileName);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Never attached to a window, so give it a phone-sized viewport: the page's icon rail and
        // rows only get real positions (which the navigation taps rely on) inside one.
        android.util.DisplayMetrics metrics = context.getResources().getDisplayMetrics();
        int width = Math.max(metrics.widthPixels, 720);
        int height = Math.max(metrics.heightPixels, 1280);
        webView.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY)
        );
        webView.layout(0, 0, width, height);
        // An SPA tap can fire onPageFinished again - only the first load starts the read.
        AtomicBoolean readStarted = new AtomicBoolean(false);

        // Guards against onPageFinished/onReceivedError both firing for the same load (e.g. a
        // sub-resource error alongside a successful main-frame finish) and tearing this WebView
        // down - and counting the latch down - twice.
        AtomicBoolean handled = new AtomicBoolean(false);
        Handler mainHandler = new Handler(Looper.getMainLooper());

        Runnable teardown = () -> {
            if (!handled.compareAndSet(false, true)) {
                return;
            }
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.destroy();
            latch.countDown();
        };

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    mainHandler.postDelayed(() -> {
                        // Already torn down (an error or a 429 page that still "finished") - the
                        // WebView is destroyed, nothing to read.
                        if (!handled.get() && readStarted.compareAndSet(false, true)) {
                            readAndSave(context, webView, entry, script, teardown);
                        }
                    }, SETTLE_DELAY_MS);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        teardown.run();
                    }
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    if (request.isForMainFrame() && response != null && response.getStatusCode() == 429) {
                        rateLimited.set(true);
                        SyncPacing.recordRateLimited(context, System.currentTimeMillis());
                        teardown.run();
                    }
                }
            }
        );

        webView.loadUrl(entry.url);
    }

    /** Mirrors AccountBrowserActivity#syncFromStarlink's own AllowedUrl-before-and-after check:
     * the page could have navigated away during the settle delay above. */
    private void readAndSave(Context context, WebView webView, AutoSyncAccountStore.Entry entry, String script, Runnable teardown) {
        if (!AllowedUrl.isAllowed(webView.getUrl())) {
            teardown.run();
            return;
        }
        webView.evaluateJavascript(
            script,
            value -> {
                JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
                if (fields != null && fields.length() > 0 && AllowedUrl.isAllowed(webView.getUrl())) {
                    pageValues.put(entry.accountId, new String[] {fields.getString("serviceStatus"), fields.getString("renewalDate")});
                    String syncId = PendingSyncStore.save(context, entry.accountId, fields);
                    if (syncId != null) {
                        syncedAccountCount.incrementAndGet();
                        // Best-effort - dropped if the app's Bridge/WebView isn't attached and
                        // resumed right now, same as the manual flow. listPendingAccountSyncs
                        // (drained on app open/resume) is what actually guarantees delivery.
                        LocalBrowserPlugin.emitAccountDataSynced(syncId, entry.accountId, fields);
                    }
                }
                if (deepRead) readDevices(context, webView, entry, script, teardown);
                else teardown.run();
            }
        );
    }

    /**
     * The dish/Wi-Fi dots only exist on the subscription's own page, inside "الأجهزة" - the same
     * walk "تحديث من Starlink" in the account's browser does: the "الاشتراكات" rail icon, the
     * subscription row, open "الأجهزة" (only if closed), then read. Every step tolerates a miss;
     * leaving starlink.com, or the visit being torn down, ends it.
     */
    private void readDevices(Context context, WebView webView, AutoSyncAccountStore.Entry entry, String script, Runnable teardown) {
        Handler handler = new Handler(Looper.getMainLooper());
        String[] taps;
        try {
            taps = new String[] {
                StarlinkExtractorSupport.loadClickIconRailItemScript(context, ICON_RAIL_INDEX_SUBSCRIPTIONS),
                StarlinkExtractorSupport.loadClickFirstSubscriptionRowScript(context),
                StarlinkExtractorSupport.loadExpandDevicesSectionScript(context),
            };
        } catch (IOException e) {
            teardown.run();
            return;
        }
        runTap(context, webView, entry, script, teardown, handler, taps, 0);
    }

    private void runTap(Context context, WebView webView, AutoSyncAccountStore.Entry entry, String script, Runnable teardown, Handler handler, String[] taps, int index) {
        if (!AllowedUrl.isAllowed(webView.getUrl())) {
            teardown.run();
            return;
        }
        if (index >= taps.length) {
            readDevicePage(context, webView, entry, script, teardown, handler, false);
            return;
        }
        // The last tap opens "الأجهزة": its dots fill in only after their telemetry loads.
        long delay = index == taps.length - 1 ? DEVICES_SETTLE_MS : STEP_DELAY_MS;
        webView.evaluateJavascript(taps[index], value -> handler.postDelayed(() -> {
            try {
                runTap(context, webView, entry, script, teardown, handler, taps, index + 1);
            } catch (RuntimeException e) {
                // The visit was torn down meanwhile (a destroyed WebView) - nothing left to do.
                teardown.run();
            }
        }, delay));
    }

    /** Reads the devices page; if neither dot has a color yet, waits once more and reads again. */
    private void readDevicePage(Context context, WebView webView, AutoSyncAccountStore.Entry entry, String script, Runnable teardown, Handler handler, boolean retried) {
        if (!AllowedUrl.isAllowed(webView.getUrl())) {
            teardown.run();
            return;
        }
        webView.evaluateJavascript(script, value -> {
            JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
            boolean hasDots = fields != null && (colored(fields.optString("dishStatus", "")) || colored(fields.optString("wifiStatus", "")));
            if (!hasDots && !retried) {
                handler.postDelayed(() -> {
                    try {
                        readDevicePage(context, webView, entry, script, teardown, handler, true);
                    } catch (RuntimeException e) {
                        teardown.run();
                    }
                }, DEVICES_SETTLE_MS);
                return;
            }
            if (fields != null && fields.length() > 0 && AllowedUrl.isAllowed(webView.getUrl())) {
                dotValues.put(entry.accountId, new String[] {fields.optString("dishStatus", ""), fields.optString("wifiStatus", "")});
                String syncId = PendingSyncStore.save(context, entry.accountId, fields);
                if (syncId != null) LocalBrowserPlugin.emitAccountDataSynced(syncId, entry.accountId, fields);
            }
            teardown.run();
        });
    }

    private static boolean colored(String status) {
        return "online".equals(status) || "offline".equals(status) || "warning".equals(status);
    }
}
