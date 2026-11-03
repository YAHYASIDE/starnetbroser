package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewCompat;
import com.getcapacitor.JSObject;
import java.io.IOException;

/**
 * 💰 Reads the device's «Balance Due» the moment its browser is open (his Nov 3 2026 ask), without
 * moving his page: a second WebView of the same profile (the same Starlink session) sits BEHIND the
 * visible one - attached and drawn, so Starlink's page really renders (a detached WebView often
 * doesn't, see AutoSyncWorker) - opens Home, taps «Billing» on the rail and reads it with the same
 * extractor as «مزامنة». A read counts once two in a row agree (and the renewal day has come, or
 * enough time passed - Billing loads its «Billing Cycle» box after the balance). Then it is removed.
 * Only the Starlink site (AllowedUrl); a 429 stops it (SyncPacing).
 */
final class BalancePeek {

    interface Listener {
        /** The Billing page's read (balanceDue + whatever else Billing showed). */
        void onRead(JSObject fields);

        /** Nothing read: `limited` = a limited email (no billing icon). */
        void onNothing(boolean limited);
    }

    private static final long FIRST_TICK_MS = 2500;
    private static final long POLL_MS = 1000;
    private static final long MAX_MS = 45_000;
    private static final long AFTER_TAP_MIN_MS = 1500;
    private static final long RENEWAL_WAIT_MS = 9000;
    private static final int RAIL_TRIES = 20;

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView view;
    private ViewGroup parent;
    private Listener listener;
    private long startedAt;
    private int railTries;
    private long billingAt;
    private String lastKey = "";
    private JSObject best;
    private boolean busy;

    BalancePeek(Activity activity) {
        this.activity = activity;
    }

    boolean isRunning() {
        return view != null;
    }

    @SuppressLint("SetJavaScriptEnabled")
    void start(String profileName, String url, ViewGroup parent, Listener listener) {
        if (view != null || !AllowedUrl.isAllowed(url)) return;
        this.parent = parent;
        this.listener = listener;
        view = new WebView(activity);
        // The first call on this WebView, as WebViewCompat#setProfile requires.
        WebViewCompat.setProfile(view, profileName);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return !AllowedUrl.isAllowed(request.getUrl().toString());
            }

            @Override
            public void onReceivedHttpError(WebView v, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response != null && response.getStatusCode() == 429) {
                    SyncPacing.recordRateLimited(activity, System.currentTimeMillis());
                    finish(null, false);
                }
            }
        });
        view.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        view.setFocusable(false);
        // Index 0 = under the visible page and its tabs: drawn, never seen or touched.
        parent.addView(view, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.loadUrl(url);
        startedAt = System.currentTimeMillis();
        handler.postDelayed(this::tick, FIRST_TICK_MS);
    }

    private void tick() {
        if (view == null || busy) return;
        long now = System.currentTimeMillis();
        if (now - startedAt > MAX_MS) {
            finish(best, false);
            return;
        }
        if (!AllowedUrl.isAllowed(view.getUrl()) || !StarlinkLoginWatch.isSignedInUrl(view.getUrl())) {
            again();
            return;
        }
        String script;
        try {
            script = billingAt == 0
                ? StarlinkExtractorSupport.loadClickBillingRailItemScript(activity)
                : StarlinkExtractorSupport.loadExtractScript(activity);
        } catch (IOException e) {
            finish(null, false);
            return;
        }
        if (billingAt == 0) {
            busy = true;
            view.evaluateJavascript(script, value -> {
                busy = false;
                if (view == null) return;
                if (StarlinkExtractorSupport.parseBooleanResult(value)) {
                    billingAt = System.currentTimeMillis();
                    handler.postDelayed(this::tick, AFTER_TAP_MIN_MS);
                    return;
                }
                if (++railTries >= RAIL_TRIES) {
                    checkLimited();
                    return;
                }
                again();
            });
            return;
        }
        busy = true;
        view.evaluateJavascript(script, value -> {
            busy = false;
            if (view == null) return;
            JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
            if (fields != null && !fields.optString("balanceDue", "").isEmpty()) {
                String key = StarlinkExtractorSupport.settleKey(fields);
                boolean settled = key.equals(lastKey);
                lastKey = key;
                best = fields;
                if (settled && (StarlinkExtractorSupport.hasRenewalDate(fields) || System.currentTimeMillis() - billingAt >= RENEWAL_WAIT_MS)) {
                    finish(fields, false);
                    return;
                }
            }
            again();
        });
    }

    /** No billing icon after many tries: Home says whether it is a limited email. */
    private void checkLimited() {
        try {
            busy = true;
            view.evaluateJavascript(StarlinkExtractorSupport.loadExtractScript(activity), value -> {
                busy = false;
                JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
                finish(null, fields != null && fields.optBoolean("limitedAccess", false));
            });
        } catch (IOException e) {
            finish(null, false);
        }
    }

    private void again() {
        handler.postDelayed(this::tick, POLL_MS);
    }

    private void finish(JSObject fields, boolean limited) {
        Listener l = listener;
        stop();
        if (l == null) return;
        if (fields != null) l.onRead(fields);
        else l.onNothing(limited);
    }

    /** Removes the hidden page (also when the browser closes). */
    void stop() {
        handler.removeCallbacksAndMessages(null);
        listener = null;
        busy = false;
        if (view != null) {
            WebView v = view;
            view = null;
            v.stopLoading();
            v.setWebViewClient(new WebViewClient());
            if (parent != null) parent.removeView(v);
            v.destroy();
        }
        parent = null;
    }
}
