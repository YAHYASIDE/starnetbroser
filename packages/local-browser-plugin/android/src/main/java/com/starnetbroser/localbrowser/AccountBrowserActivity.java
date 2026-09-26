package com.starnetbroser.localbrowser;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * A standalone, full-screen browser for exactly one Starlink account. Every
 * instance is bound to a WebView profile derived from account.id
 * (ProfileNaming) before the WebView does anything else, so its cookies,
 * localStorage and login state never mix with any other account's - this is
 * the isolation boundary the whole plugin exists for, not just a UI detail.
 *
 * The profile is only ever selected here; it is never deleted here. Content
 * (cookies/storage) lives in Chromium's own per-profile on-disk directory
 * and is untouched by this Activity's lifecycle, which is what makes a
 * login survive closing this screen, closing STAR NET entirely, and a
 * phone reboot - there is nothing in this class that could lose it.
 */
public class AccountBrowserActivity extends AppCompatActivity {

    public static final String EXTRA_PROFILE_NAME = "com.starnetbroser.localbrowser.PROFILE_NAME";
    public static final String EXTRA_ACCOUNT_ID = "com.starnetbroser.localbrowser.ACCOUNT_ID";
    public static final String EXTRA_ACCOUNT_NAME = "com.starnetbroser.localbrowser.ACCOUNT_NAME";
    public static final String EXTRA_URL = "com.starnetbroser.localbrowser.URL";

    private static final String NOTIFICATION_PERMISSION_PREFS = "starnet_notification_permission";
    private static final String KEY_ASKED_NOTIFICATION_PERMISSION = "asked_post_notifications";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;

    /** Icon-rail positions (see navigation.ts's own doc for the confirmed, real, screenshot-
     * verified top-to-bottom order: home, edit, briefcase, receipt, gift, envelope, gear). */
    private static final int ICON_RAIL_INDEX_SUBSCRIPTIONS = 1;
    private static final int ICON_RAIL_INDEX_BILLING = 3;

    /** Extra wait after a navigation-causing tap before the next step reads/clicks anything -
     * the same client-rendered-SPA-settle assumption AutoSyncWorker's own SETTLE_DELAY_MS already
     * makes, just shorter since this flow is on-screen and the user is actively waiting on it. */
    private static final long SYNC_STEP_DELAY_MS = 1500;

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private String homeUrl;
    private String accountId;

    /** Non-null only while a multi-page "تحديث من Starlink" sync is in progress - each step polls
     * and runs the next one, so a null queue is also this class's "not currently syncing" flag. */
    private Deque<Runnable> syncSteps;
    /** True once anything was actually found and durably saved across ANY of this run's pages -
     * tracked separately from a single page's own result, since a page with nothing on it (e.g.
     * an unexpectedly-shaped "الاشتراكات" list) must never flip an already-true result back. */
    private boolean syncFoundAnything;
    /** True the moment PendingSyncStore.save fails even once - takes priority over
     * syncFoundAnything when this run finishes, since a save failure is real data loss the
     * operator must be told about, never silently outweighed by an earlier page's success. */
    private boolean syncSaveFailed;
    /** Schedules the settle delay between sync steps - its own field (not WebView#postDelayed) so
     * onDestroy can cancel every pending step in one well-defined call
     * (Handler#removeCallbacksAndMessages), rather than relying on View#removeCallbacks, which
     * has no documented "remove everything" form. */
    private final Handler syncHandler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String profileName = getIntent().getStringExtra(EXTRA_PROFILE_NAME);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        String accountName = getIntent().getStringExtra(EXTRA_ACCOUNT_NAME);
        homeUrl = getIntent().getStringExtra(EXTRA_URL);

        // Defensive re-check: the plugin already verified this before
        // starting the Activity, but this screen must never silently fall
        // back to a shared session if it is somehow reached without that
        // check (e.g. a stale PendingIntent) having happened.
        if (profileName == null || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            Toast.makeText(this, R.string.starnet_unsupported_device, Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // Defensive re-check of the same allow-list LocalBrowserPlugin already enforced before
        // starting this Activity: never load anything other than the real Starlink portal over
        // HTTPS, whatever reached this Activity (a caller bug, a crafted Intent, ...).
        if (!AllowedUrl.isAllowed(homeUrl)) {
            Toast.makeText(this, R.string.starnet_invalid_request, Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // Ensure the profile exists (idempotent - resumes it if this account was opened before)
        // before the WebView touches anything, per androidx.webkit's required call order.
        ProfileStore.getInstance().getOrCreateProfile(profileName);

        setContentView(R.layout.activity_account_browser);

        Toolbar toolbar = findViewById(R.id.starnet_toolbar);
        toolbar.setTitle(accountName != null ? accountName : "STAR NET");
        setSupportActionBar(toolbar);

        progressBar = findViewById(R.id.starnet_progress);
        errorOverlay = findViewById(R.id.starnet_error_overlay);
        webView = findViewById(R.id.starnet_webview);

        // Must be the first interaction with this WebView instance - before
        // reading/writing settings or loading anything - per
        // WebViewCompat#setProfile's documented contract.
        WebViewCompat.setProfile(webView, profileName);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebViewClient(new IsolatedWebViewClient());
        webView.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    if (newProgress >= 100) {
                        progressBar.setVisibility(View.GONE);
                    } else {
                        progressBar.setVisibility(View.VISIBLE);
                        progressBar.setProgress(newProgress);
                    }
                }
            }
        );

        findViewById(R.id.starnet_btn_back).setOnClickListener(v -> goBackInWebView());
        findViewById(R.id.starnet_btn_refresh).setOnClickListener(v -> reload());
        findViewById(R.id.starnet_btn_home).setOnClickListener(v -> goHome());
        findViewById(R.id.starnet_btn_close).setOnClickListener(v -> finish());
        findViewById(R.id.starnet_btn_sync).setOnClickListener(v -> syncFromStarlink());
        ((Button) findViewById(R.id.starnet_error_retry)).setOnClickListener(v -> reload());

        webView.loadUrl(homeUrl);
        requestNotificationPermissionOnceIfNeeded();
    }

    /**
     * The background sync notification (SyncNotifier) needs this permission on API 33+, but a
     * background Worker can never request it itself - only an Activity can. This screen is a
     * natural, already-engaged moment to ask (the user just opened a Starlink account), asked at
     * most once ever regardless of the answer: a denial is the user's choice, not something to
     * keep re-prompting about on every subsequent "فتح" tap.
     */
    private void requestNotificationPermissionOnceIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences(NOTIFICATION_PERMISSION_PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_ASKED_NOTIFICATION_PERMISSION, false)) {
            return;
        }
        prefs.edit().putBoolean(KEY_ASKED_NOTIFICATION_PERMISSION, true).apply();
        ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQUEST_CODE_POST_NOTIFICATIONS);
    }

    /**
     * Tears down this screen's WebView instance without touching what it stores. Cookies,
     * localStorage and login state live in Chromium's own per-profile on-disk directory, owned
     * by the profile (ProfileStore), not by this WebView object or this Activity - destroying
     * the WebView only releases the in-memory engine so it can be garbage-collected, and is what
     * lets the profile be deleted later (ProfileStore#deleteProfile rejects a profile that still
     * has a live WebView attached) without a stale reference to this screen keeping it "in use".
     */
    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            // Cancels any still-pending sync step's settle-delay callback - without this, a
            // queued step could still fire after this screen is gone (syncGuardOk's own
            // webView == null check makes that safe either way, but this avoids a stray toast
            // appearing once the operator has already left).
            syncHandler.removeCallbacksAndMessages(null);
            syncSteps = null;
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.setWebChromeClient(null);
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
    }

    /** Phone hardware back button: navigate within the account's own page history first. */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void goBackInWebView() {
        if (webView.canGoBack()) {
            webView.goBack();
        }
    }

    private void reload() {
        errorOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.reload();
    }

    private void goHome() {
        errorOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(homeUrl);
    }

    /**
     * On-device Starlink sync: reads not just whichever page happens to be open right now, but
     * drives the SAME sequence of taps a human operator already has to do to see the "الاشتراك"
     * and "الفوترة" sections at all (real, confirmed user report: a single tap used to only ever
     * read the currently-open page, so anything on those two sections required leaving this
     * button alone and navigating there by hand first, then tapping it again on each one).
     *
     * The sequence (see navigation.ts for the confirmed, screenshot-verified details of each
     * step): read the current page -> open "الاشتراكات" (icon rail index 1) -> open the account's
     * one subscription -> expand "الأجهزة" (confirmed ALWAYS collapsed by default, which is what
     * hid the dish/Wi-Fi status dots from every previous read of this page) -> read that page ->
     * open "الفوترة" (icon rail index 3) -> read that page -> return to the Home page.
     *
     * Every step here is independently tolerant of "found nothing"/"click missed its target" -
     * never fatal, since a page whose structure doesn't match what was confirmed just means that
     * one step contributes nothing, exactly like the old single-page read already could. Only a
     * URL leaving the allow-listed domain aborts the run outright (checked before each step, via
     * syncGuardOk) - the same defensive check the original single-page flow already made before
     * and after its one evaluateJavascript call.
     */
    private void syncFromStarlink() {
        if (!syncGuardOk()) {
            Toast.makeText(this, R.string.starnet_sync_wrong_domain, Toast.LENGTH_LONG).show();
            return;
        }

        syncFoundAnything = false;
        syncSaveFailed = false;
        Toast.makeText(this, R.string.starnet_sync_in_progress, Toast.LENGTH_SHORT).show();

        syncSteps = new ArrayDeque<>();
        syncSteps.add(this::syncStepExtractCurrentPage); // whatever page the operator is already on
        syncSteps.add(() -> syncStepClick(ctx -> StarlinkExtractorSupport.loadClickIconRailItemScript(ctx, ICON_RAIL_INDEX_SUBSCRIPTIONS)));
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickFirstSubscriptionRowScript));
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadExpandDevicesSectionScript));
        syncSteps.add(this::syncStepExtractCurrentPage); // plan + devices (now expanded) + identifiers
        syncSteps.add(() -> syncStepClick(ctx -> StarlinkExtractorSupport.loadClickIconRailItemScript(ctx, ICON_RAIL_INDEX_BILLING)));
        syncSteps.add(this::syncStepExtractCurrentPage); // billing
        syncSteps.add(this::finishSync);

        advanceSyncSteps();
    }

    /** Pops and runs the next queued step - every step above is responsible for calling this
     * itself once its own async work settles, never called automatically. */
    private void advanceSyncSteps() {
        if (syncSteps == null || syncSteps.isEmpty()) {
            return;
        }
        syncSteps.poll().run();
    }

    private boolean syncGuardOk() {
        return webView != null && AllowedUrl.isAllowed(webView.getUrl());
    }

    /** A functional interface (not java.util.function.Function) purely so each script-loader
     * method reference can declare `throws IOException` directly, matching
     * StarlinkExtractorSupport's own signatures without a try/catch at every call site. */
    private interface ScriptLoader {
        String load(Context context) throws IOException;
    }

    /** Reads whatever section of the page is currently open and durably saves anything found -
     * identical field-parsing/save/emit logic to the original single-page flow, just reused here
     * as one step among several instead of the whole flow. */
    private void syncStepExtractCurrentPage() {
        if (!syncGuardOk()) {
            finishSync();
            return;
        }
        String script;
        try {
            script = StarlinkExtractorSupport.loadExtractScript(getApplicationContext());
        } catch (IOException e) {
            advanceSyncSteps();
            return;
        }
        webView.evaluateJavascript(
            script,
            value -> {
                if (!syncGuardOk()) {
                    finishSync();
                    return;
                }
                JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
                if (fields != null && fields.length() > 0) {
                    // Durable write FIRST: the final toast must never claim more than what is
                    // actually safe on disk. The main STAR NET Activity/Bridge this screen sits on
                    // top of may be stopped right now, in which case notifyListeners() below is
                    // silently dropped - PendingSyncStore (drained by the web UI on open/resume)
                    // is what actually guarantees this result is never lost, however long that
                    // takes.
                    String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
                    if (syncId != null) {
                        syncFoundAnything = true;
                        // Best-effort live push, for when the app happens to be in the foreground
                        // right now.
                        LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
                    } else {
                        // The write genuinely did not reach disk (commit() failed) - never claim
                        // success over a result that isn't safe anywhere, however many OTHER pages
                        // in this same run did save correctly.
                        syncSaveFailed = true;
                    }
                }
                syncHandler.postDelayed(this::advanceSyncSteps, SYNC_STEP_DELAY_MS);
            }
        );
    }

    /** Runs one Stage-2 navigation tap (see navigation.ts) and moves on regardless of whether it
     * actually found its target - a click that missed just means the following extract step(s)
     * find nothing new on whatever page it left the operator on, exactly as tolerated everywhere
     * else in this flow. */
    private void syncStepClick(ScriptLoader loader) {
        if (!syncGuardOk()) {
            finishSync();
            return;
        }
        String script;
        try {
            script = loader.load(getApplicationContext());
        } catch (IOException e) {
            advanceSyncSteps();
            return;
        }
        webView.evaluateJavascript(script, value -> syncHandler.postDelayed(this::advanceSyncSteps, SYNC_STEP_DELAY_MS));
    }

    /** Always the last step: returns to the Home page (regardless of which page the run ends on)
     * so the operator lands back somewhere familiar, then reports one combined result for the
     * whole run - never a separate toast per page, which would otherwise fire up to four times in
     * a row for one button tap. */
    private void finishSync() {
        syncSteps = null;
        if (webView != null) {
            webView.loadUrl(homeUrl);
        }
        if (syncSaveFailed) {
            Toast.makeText(this, R.string.starnet_sync_save_failed, Toast.LENGTH_LONG).show();
        } else if (syncFoundAnything) {
            Toast.makeText(this, R.string.starnet_sync_success, Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, R.string.starnet_sync_nothing_found, Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Keeps every navigation inside this WebView (never hands off to an
     * external browser/app via an intent: URL) and shows a real error
     * screen instead of leaving a blank white page on a load failure.
     */
    private class IsolatedWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String scheme = request.getUrl().getScheme();
            if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) {
                // Refuse non-http(s) schemes (e.g. intent:, market:) rather than dispatching
                // them as external intents - this stays a contained, isolated browser.
                return true;
            }
            return false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                webView.setVisibility(View.GONE);
                errorOverlay.setVisibility(View.VISIBLE);
            }
        }
    }
}
