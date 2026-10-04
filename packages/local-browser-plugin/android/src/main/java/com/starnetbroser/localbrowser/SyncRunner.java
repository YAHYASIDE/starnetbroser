package com.starnetbroser.localbrowser;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * 🔄 One device's sync on a WebView that is NOT on screen for the operator (BackgroundSyncService
 * puts it in an invisible window so the page still draws). The same walk as the device browser's
 * «مزامنة» (AccountBrowserActivity#syncFromStarlink - keep the two in step): wait for the account
 * page to be signed in (the sign-in page instead → "signedOut" at once), switch to English, then
 * read each page until it has settled - subscriptions, the subscription, «الأجهزة» (waits for a
 * colored dot), Billing (waits for the renewal day), Settings, Home. Every read is saved
 * (PendingSyncStore) before it's announced. Ends once with an outcome: "ok", "nothing",
 * "saveFailed", "signedOut" or "stuck" (no end within MAX_MS). Main thread only.
 */
final class SyncRunner {

    interface Listener {
        void onFinished(String outcome);
    }

    private static final long POLL_MS = 700;
    private static final int SIGNED_OUT_POLLS = 5;
    private static final long MAX_MS = 120_000;
    private static final long SYNC_STEP_DELAY_MS = 1500;
    private static final long READ_POLL_MS = 500;
    private static final long AFTER_TAP_ADVANCE_MS = 300;
    private static final long CURRENT_PAGE_MAX_MS = 3000;
    private static final long AFTER_TAP_MIN_MS = 600;
    private static final long AFTER_TAP_MAX_MS = 6000;
    private static final long DEVICES_MAX_MS = 7000;
    private static final long BILLING_MAX_MS = 9000;
    private static final long HOME_MIN_MS = 3500;
    private static final long HOME_MAX_MS = 8000;
    private static final int MAX_ENGLISH_STEPS = 7;
    private static final long ENGLISH_RELOAD_DELAY_MS = 4500;
    private static final long HOME_SETTLE_DELAY_MS = 6000;
    private static final int WANT_ANY = 0;
    private static final int WANT_DOTS = 1;
    private static final int WANT_RENEWAL = 2;

    private final Context context;
    private final WebView webView;
    private final String accountId;
    private final String homeUrl;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private boolean done;
    private int signedInPolls;
    private int signedOutPolls;
    private Deque<Runnable> steps;
    private boolean foundAnything;
    private boolean saveFailed;
    private boolean sawStopped;
    private boolean sawRestricted;
    private int englishSteps;
    private boolean englishMenuOpened;
    private String lastSavedPageKey = "";

    private interface ScriptLoader {
        String load(Context context) throws IOException;
    }

    SyncRunner(Context context, WebView webView, String accountId, String homeUrl, Listener listener) {
        this.context = context.getApplicationContext();
        this.webView = webView;
        this.accountId = accountId;
        this.homeUrl = homeUrl;
        this.listener = listener;
    }

    /** Call once the page has started loading. */
    void start() {
        handler.postDelayed(this::signInTick, POLL_MS);
        handler.postDelayed(() -> end("stuck"), MAX_MS);
    }

    /** Stops without reporting (the run was cancelled). */
    void stop() {
        done = true;
        steps = null;
        handler.removeCallbacksAndMessages(null);
    }

    private void end(String outcome) {
        if (done) return;
        done = true;
        steps = null;
        handler.removeCallbacksAndMessages(null);
        listener.onFinished(outcome);
    }

    private boolean guardOk() {
        return !done && AllowedUrl.isAllowed(webView.getUrl());
    }

    // ---- signed in? ----

    private void signInTick() {
        if (done) return;
        if (!AllowedUrl.isAllowed(webView.getUrl())) {
            handler.postDelayed(this::signInTick, POLL_MS);
            return;
        }
        webView.evaluateJavascript(StarlinkLoginWatch.SCRIPT, value -> {
            if (done) return;
            StarlinkLoginWatch.State state = StarlinkLoginWatch.parse(value);
            boolean signedIn = state != null && StarlinkLoginWatch.isSignedInUrl(webView.getUrl())
                && !state.hasEmailField && !state.hasPasswordField;
            boolean signInPage = state != null && (state.hasEmailField || state.hasPasswordField);
            if (signedIn && ++signedInPolls >= 2) {
                startSteps();
                return;
            }
            if (!signedIn) signedInPolls = 0;
            if (signInPage && ++signedOutPolls >= SIGNED_OUT_POLLS) {
                end("signedOut");
                return;
            }
            if (!signInPage) signedOutPolls = 0;
            handler.postDelayed(this::signInTick, POLL_MS);
        });
    }

    // ---- the walk (same as AccountBrowserActivity#syncFromStarlink) ----

    private void startSteps() {
        steps = new ArrayDeque<>();
        steps.add(this::stepEnsureEnglish);
        steps.add(() -> stepReadSettled(0, CURRENT_PAGE_MAX_MS, 2, false, WANT_ANY));
        steps.add(() -> stepClick(StarlinkExtractorSupport::loadClickSubscriptionsRailItemScript));
        steps.add(() -> stepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY));
        steps.add(() -> stepClick(StarlinkExtractorSupport::loadClickFirstSubscriptionRowScript));
        steps.add(() -> stepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY));
        steps.add(() -> stepClick(StarlinkExtractorSupport::loadExpandDevicesSectionScript));
        steps.add(() -> stepReadSettled(AFTER_TAP_MIN_MS, DEVICES_MAX_MS, 2, false, WANT_DOTS));
        steps.add(() -> stepClick(StarlinkExtractorSupport::loadClickBillingRailItemScript));
        steps.add(() -> stepReadSettled(AFTER_TAP_MIN_MS, BILLING_MAX_MS, 2, true, WANT_RENEWAL));
        steps.add(() -> stepClick(StarlinkExtractorSupport::loadClickSettingsRailItemScript));
        steps.add(() -> stepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY));
        steps.add(this::stepReturnHome);
        steps.add(() -> stepReadSettled(HOME_MIN_MS, HOME_MAX_MS, 3, false, WANT_ANY));
        steps.add(() -> end(saveFailed ? "saveFailed" : foundAnything ? "ok" : "nothing"));
        advance();
    }

    private void advance() {
        if (done || steps == null || steps.isEmpty()) return;
        steps.poll().run();
    }

    private void stepEnsureEnglish() {
        if (!guardOk()) {
            end(foundAnything ? "ok" : "nothing");
            return;
        }
        String script;
        try {
            script = StarlinkExtractorSupport.loadEnsureEnglishScript(context, englishMenuOpened);
        } catch (IOException e) {
            advance();
            return;
        }
        webView.evaluateJavascript(script, value -> {
            if (done || steps == null) return;
            String step = StarlinkExtractorSupport.parseStringResult(value);
            englishSteps++;
            boolean finished = "english".equals(step) || "unknown".equals(step) || step.isEmpty() || englishSteps >= MAX_ENGLISH_STEPS;
            if (finished && englishMenuOpened && !"english".equals(step)) {
                englishMenuOpened = false;
                webView.loadUrl(homeUrl);
                handler.postDelayed(this::advance, ENGLISH_RELOAD_DELAY_MS);
                return;
            }
            if (finished) {
                handler.postDelayed(this::advance, englishSteps > 1 ? HOME_SETTLE_DELAY_MS : 0);
                return;
            }
            if ("menu".equals(step)) englishMenuOpened = true;
            steps.addFirst(this::stepEnsureEnglish);
            if ("clicked".equals(step)) {
                englishMenuOpened = false;
                handler.postDelayed(this::afterEnglishChosen, ENGLISH_RELOAD_DELAY_MS);
                return;
            }
            handler.postDelayed(this::advance, SYNC_STEP_DELAY_MS);
        });
    }

    private void afterEnglishChosen() {
        if (done || steps == null) return;
        String url = webView.getUrl();
        if (url == null || !url.contains("/account")) {
            webView.loadUrl(homeUrl);
            handler.postDelayed(this::advance, ENGLISH_RELOAD_DELAY_MS);
            return;
        }
        advance();
    }

    private void stepClick(ScriptLoader loader) {
        if (!guardOk()) {
            end(foundAnything ? "ok" : "nothing");
            return;
        }
        String script;
        try {
            script = loader.load(context);
        } catch (IOException e) {
            advance();
            return;
        }
        webView.evaluateJavascript(script, value -> handler.postDelayed(this::advance, AFTER_TAP_ADVANCE_MS));
    }

    private void stepReturnHome() {
        if (!guardOk()) {
            end(foundAnything ? "ok" : "nothing");
            return;
        }
        lastSavedPageKey = "";
        webView.loadUrl(homeUrl);
        handler.postDelayed(this::advance, AFTER_TAP_ADVANCE_MS);
    }

    private void stepReadSettled(long minMs, long maxMs, int stableReads, boolean mustChange, int want) {
        if (!guardOk()) {
            end(foundAnything ? "ok" : "nothing");
            return;
        }
        String script;
        try {
            script = StarlinkExtractorSupport.loadExtractScript(context);
        } catch (IOException e) {
            advance();
            return;
        }
        SettleTracker tracker = new SettleTracker(minMs, maxMs, stableReads);
        long started = SystemClock.elapsedRealtime();
        JSObject[] latest = new JSObject[1];
        readSettledPoll(script, tracker, started, latest, mustChange ? lastSavedPageKey : null, want);
    }

    private void readSettledPoll(String script, SettleTracker tracker, long started, JSObject[] latest, String previousPage, int want) {
        if (done || steps == null) return;
        if (!guardOk()) {
            end(foundAnything ? "ok" : "nothing");
            return;
        }
        webView.evaluateJavascript(script, value -> {
            if (done || steps == null) return;
            JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
            String key = StarlinkExtractorSupport.settleKey(fields);
            boolean stillOldPage = previousPage != null && !key.isEmpty() && key.equals(previousPage);
            if (!key.isEmpty() && !stillOldPage) latest[0] = fields;
            boolean good = !stillOldPage
                && (want != WANT_DOTS || StarlinkExtractorSupport.hasColoredDot(fields))
                && (want != WANT_RENEWAL || StarlinkExtractorSupport.hasRenewalDate(fields));
            long elapsed = SystemClock.elapsedRealtime() - started;
            if (tracker.offer(stillOldPage ? "" : key, good, elapsed)) {
                save(latest[0]);
                advance();
                return;
            }
            handler.postDelayed(() -> readSettledPoll(script, tracker, started, latest, previousPage, want), READ_POLL_MS);
        });
    }

    /** Durable write first (PendingSyncStore), then the live event - like the device browser. */
    private void save(JSObject fields) {
        if (fields == null || fields.length() == 0) return;
        lastSavedPageKey = StarlinkExtractorSupport.settleKey(fields);
        sawStopped = StarlinkExtractorSupport.keepStoppedWithinRun(fields, sawStopped);
        sawRestricted = StarlinkExtractorSupport.keepRestrictedWithinRun(fields, sawRestricted);
        String syncId = PendingSyncStore.save(context, accountId, fields);
        if (syncId != null) {
            foundAnything = true;
            LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
        } else {
            saveFailed = true;
        }
    }
}
