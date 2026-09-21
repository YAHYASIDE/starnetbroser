package com.starnetbroser.localbrowser;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
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

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private String homeUrl;
    private String accountId;

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
     * Stage 1 of on-device Starlink sync: reads only whatever section of this account's own
     * isolated WebView is currently open - never a separate request, never anything from outside
     * this WebView. All field parsing (including the DOM/computed-style work colored status dots
     * need) happens in the injected script itself (packages/local-browser-plugin/src/
     * webExtraction, bundled to android/src/main/assets/starlinkExtractor.js) - Java only ever
     * receives that script's small, already-structured JSON result, never raw page text or HTML.
     * AllowedUrl is checked both before injecting the script and again after it returns, since
     * the page could have navigated during that async gap.
     */
    private void syncFromStarlink() {
        if (!AllowedUrl.isAllowed(webView.getUrl())) {
            Toast.makeText(this, R.string.starnet_sync_wrong_domain, Toast.LENGTH_LONG).show();
            return;
        }

        String script;
        try {
            script = StarlinkExtractorSupport.loadExecutableScript(getApplicationContext());
        } catch (IOException e) {
            Toast.makeText(this, R.string.starnet_sync_nothing_found, Toast.LENGTH_LONG).show();
            return;
        }

        webView.evaluateJavascript(
            script,
            (ValueCallback<String>) value -> {
                if (webView == null) {
                    // The screen was closed before this callback ran - nothing left to report to.
                    return;
                }
                if (!AllowedUrl.isAllowed(webView.getUrl())) {
                    Toast.makeText(this, R.string.starnet_sync_wrong_domain, Toast.LENGTH_LONG).show();
                    return;
                }

                JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
                if (fields == null || fields.length() == 0) {
                    Toast.makeText(this, R.string.starnet_sync_nothing_found, Toast.LENGTH_LONG).show();
                    return;
                }

                // Durable write FIRST: the success toast below must never claim more than what is
                // actually safe on disk. The main STAR NET Activity/Bridge this screen sits on top
                // of may be stopped right now, in which case notifyListeners() below is silently
                // dropped - PendingSyncStore (drained by the web UI on open/resume) is what
                // actually guarantees this result is never lost, however long that takes.
                String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
                if (syncId == null) {
                    // The write genuinely did not reach disk (commit() failed) - never claim
                    // success and never fire the live event over a result that isn't safe anywhere.
                    Toast.makeText(this, R.string.starnet_sync_save_failed, Toast.LENGTH_LONG).show();
                    return;
                }

                // Best-effort live push, for when the app happens to be in the foreground right now.
                LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
                Toast.makeText(this, R.string.starnet_sync_success, Toast.LENGTH_SHORT).show();
            }
        );
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
