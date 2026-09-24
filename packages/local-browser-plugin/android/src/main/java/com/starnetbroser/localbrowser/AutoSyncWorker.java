package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
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
import java.util.List;
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

    /** Extra wait after onPageFinished before reading the page: the Starlink portal is a
     * client-rendered SPA whose account data is often still filling in when the network load
     * itself completes - the exact same assumption a human tester would make by waiting a moment
     * before tapping "تحديث من Starlink" themselves. */
    private static final long SETTLE_DELAY_MS = 3000;
    private static final long PER_ACCOUNT_TIMEOUT_MS = 25000;

    // WorkManager instantiates a fresh Worker for every run (periodic tick or one-time "مزامنة
    // الآن" trigger alike), so this is always this run's own count, never carried over from a
    // previous one.
    private final AtomicInteger syncedAccountCount = new AtomicInteger();

    public AutoSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Never fall back to a shared/unisolated session on a device that can't do Multi-Profile -
        // same rule AccountBrowserActivity/LocalBrowserPlugin already enforce for the manual flow.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            return Result.success();
        }

        Context context = getApplicationContext();
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
            return Result.success();
        }

        String script;
        try {
            script = StarlinkExtractorSupport.loadExtractScript(context);
        } catch (IOException e) {
            return Result.retry();
        }

        for (AutoSyncAccountStore.Entry entry : entries) {
            if (isStopped()) {
                break;
            }
            syncOneAccountBlocking(context, entry, script);
        }
        SyncNotifier.notifySyncCompleted(context, syncedAccountCount.get());
        return Result.success();
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
            latch.await(PER_ACCOUNT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
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
                    mainHandler.postDelayed(() -> readAndSave(context, webView, entry, script, teardown), SETTLE_DELAY_MS);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
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
                    String syncId = PendingSyncStore.save(context, entry.accountId, fields);
                    if (syncId != null) {
                        syncedAccountCount.incrementAndGet();
                        // Best-effort - dropped if the app's Bridge/WebView isn't attached and
                        // resumed right now, same as the manual flow. listPendingAccountSyncs
                        // (drained on app open/resume) is what actually guarantees delivery.
                        LocalBrowserPlugin.emitAccountDataSynced(syncId, entry.accountId, fields);
                    }
                }
                teardown.run();
            }
        );
    }
}
