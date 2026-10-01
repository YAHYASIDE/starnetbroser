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
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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
    public static final String EXTRA_LOGIN_EMAIL = "com.starnetbroser.localbrowser.LOGIN_EMAIL";
    public static final String EXTRA_LOGIN_PASSWORD = "com.starnetbroser.localbrowser.LOGIN_PASSWORD";
    /** The device email's own password, for its mailbox (📧 البريد) - never the Starlink one. */
    public static final String EXTRA_MAIL_PASSWORD = "com.starnetbroser.localbrowser.MAIL_PASSWORD";
    /** Offered in «📧 البريد» when the email's password is missing or wrong. */
    public static final String EXTRA_MAIL_SUGGESTIONS = "com.starnetbroser.localbrowser.MAIL_SUGGESTIONS";
    /** Typed into Microsoft's «Add an email address» in «📧 البريد». */
    public static final String EXTRA_MAIL_RECOVERY = "com.starnetbroser.localbrowser.MAIL_RECOVERY";
    /** 🆕 «إنشاء حساب جديد»: what «تفعيل Starlink» is filled with (SignupFill), else absent. */
    public static final String EXTRA_ACTIVATION_KIT = "com.starnetbroser.localbrowser.ACTIVATION_KIT";
    public static final String EXTRA_ACTIVATION_FIRST_NAME = "com.starnetbroser.localbrowser.ACTIVATION_FIRST_NAME";
    public static final String EXTRA_ACTIVATION_LAST_NAME = "com.starnetbroser.localbrowser.ACTIVATION_LAST_NAME";
    public static final String EXTRA_ACTIVATION_EMAIL = "com.starnetbroser.localbrowser.ACTIVATION_EMAIL";
    public static final String EXTRA_ACTIVATION_PHONE = "com.starnetbroser.localbrowser.ACTIVATION_PHONE";

    private static final String NOTIFICATION_PERMISSION_PREFS = "starnet_notification_permission";
    private static final String KEY_ASKED_NOTIFICATION_PERMISSION = "asked_post_notifications";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;

    /** Icon-rail positions (see navigation.ts's own doc for the confirmed, real, screenshot-
     * verified top-to-bottom order: home, edit, briefcase, receipt, gift, envelope, gear). */
    private static final int ICON_RAIL_INDEX_SUBSCRIPTIONS = 1;

    /** Extra wait after a navigation-causing tap before the next step reads/clicks anything -
     * the same client-rendered-SPA-settle assumption AutoSyncWorker's own SETTLE_DELAY_MS already
     * makes, just shorter since this flow is on-screen and the user is actively waiting on it. */
    private static final long SYNC_STEP_DELAY_MS = 1500;
    private static final long DEVICES_SETTLE_DELAY_MS = 3500;
    /** Switching Starlink to English (language.ts): at most this many taps/checks per sync, and the
     * wait after tapping "English" for the page to come back in the new language. */
    private static final int MAX_ENGLISH_STEPS = 7;
    private static final long ENGLISH_RELOAD_DELAY_MS = 4500;
    /** Home's banners load a moment after the page - wait this long before reading it. */
    private static final long HOME_SETTLE_DELAY_MS = 6000;

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private String homeUrl;
    private String accountId;
    /** The login form autofill script for this device (see LoginAutofill), or null. */
    private String autofillScript;
    /** «تفعيل Starlink» for a new account being created (SignupFill), or null. */
    private String activationScript;

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
    /** A page in this run read the service as stopped (see keepStoppedWithinRun). */
    private boolean syncSawStopped;
    /** A page in this run showed the region-restricted banner (see keepRestrictedWithinRun). */
    private boolean syncSawRestricted;
    /** The run already ended on the account's Home page (its last read), so finishSync needn't reload it. */
    private boolean syncEndedHome;
    /** This run's steps toward an English page so far, and whether its ☰ was already tapped. */
    private int englishSteps;
    private boolean englishMenuOpened;
    /** Schedules the settle delay between sync steps - its own field (not WebView#postDelayed) so
     * onDestroy can cancel every pending step in one well-defined call
     * (Handler#removeCallbacksAndMessages), rather than relying on View#removeCallbacks, which
     * has no documented "remove everything" form. */
    private final Handler syncHandler = new Handler(Looper.getMainLooper());

    // ---- «التحقق بخطوتين»: the code is read from the device's own mailbox and typed in ----
    /** Codes already typed per device (StarlinkTwoStep.remember) - an old code is never retried. */
    private static final String TRIED_CODES_PREFS = "starnet_mail_codes";
    private static final long TWO_STEP_POLL_MS = 2500;
    /** After typing a code, wait this long before deciding it was refused and fetching again. */
    private static final long REFILL_AFTER_MS = 12000;
    private static final int MAX_AUTO_FILLS = 3;
    private final Handler twoStepHandler = new Handler(Looper.getMainLooper());
    private final Runnable twoStepPoll = this::checkTwoStep;
    private CodeSource codeFetcher;
    /** Off for this screen after the mailbox needed a sign-in, no code came, or 3 tries. */
    private boolean autoCodeOff;
    /** Off only until the operator comes back from «📧 البريد» (signed in there / checked it):
     * then it reads the code by itself again. Real, confirmed miss: after signing in to the
     * mailbox the code never came automatically on returning to Starlink. */
    private boolean autoCodeWaitsForMail;

    // ---- كلمة المرور: Starlink said it is wrong, the operator typed the right one -> kept ----
    private static final long LOGIN_WATCH_MS = 1500;
    private final Runnable loginWatchPoll = this::checkLogin;
    /** The password this device signs in with now (the saved one, then any new one that worked). */
    private String savedLoginPassword;
    /** The last password seen typed in Starlink's form, waiting to see whether it gets in. */
    private String typedPassword;
    private boolean warnedWrongPassword;
    private long lastFillAt;
    private int autoFills;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String profileName = getIntent().getStringExtra(EXTRA_PROFILE_NAME);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        String accountName = getIntent().getStringExtra(EXTRA_ACCOUNT_NAME);
        homeUrl = getIntent().getStringExtra(EXTRA_URL);
        autofillScript = LoginAutofill.script(getIntent().getStringExtra(EXTRA_LOGIN_EMAIL), getIntent().getStringExtra(EXTRA_LOGIN_PASSWORD));
        savedLoginPassword = getIntent().getStringExtra(EXTRA_LOGIN_PASSWORD);
        activationScript = SignupFill.starlinkScript(getIntent().getStringExtra(EXTRA_ACTIVATION_KIT),
            getIntent().getStringExtra(EXTRA_ACTIVATION_FIRST_NAME), getIntent().getStringExtra(EXTRA_ACTIVATION_LAST_NAME),
            getIntent().getStringExtra(EXTRA_ACTIVATION_EMAIL), getIntent().getStringExtra(EXTRA_ACTIVATION_PHONE));

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

        BrowserBar.setUp(this, this::goBackInWebView, this::reload, "⇣", getString(R.string.starnet_action_sync), this::syncFromStarlink);
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
    protected void onResume() {
        super.onResume();
        twoStepHandler.removeCallbacks(loginWatchPoll);
        twoStepHandler.postDelayed(loginWatchPoll, LOGIN_WATCH_MS);
        if (autoCodeWaitsForMail) {
            autoCodeWaitsForMail = false;
            autoCodeOff = false;
            lastFillAt = 0;
        }
        scheduleTwoStepCheck();
    }

    @Override
    protected void onPause() {
        super.onPause();
        twoStepHandler.removeCallbacks(twoStepPoll);
        twoStepHandler.removeCallbacks(loginWatchPoll);
    }

    /** Every 1.5 s on Starlink's pages: remembers the password typed in the sign-in form, says so
     * once when Starlink calls it wrong, and - once an account page opens with a password that
     * isn't the saved one - keeps it for this device (the old one is replaced). */
    private void checkLogin() {
        if (webView == null || accountId == null || syncSteps != null || !AllowedUrl.isAllowed(webView.getUrl())) {
            if (webView != null) twoStepHandler.postDelayed(loginWatchPoll, LOGIN_WATCH_MS);
            return;
        }
        webView.evaluateJavascript(StarlinkLoginWatch.SCRIPT, value -> {
            if (webView == null) return;
            StarlinkLoginWatch.State state = StarlinkLoginWatch.parse(value);
            if (state != null && state.hasPasswordField) {
                if (!state.password.isEmpty()) typedPassword = state.password;
                if (state.wrongPassword && !warnedWrongPassword) {
                    warnedWrongPassword = true;
                    Toast.makeText(this, "❌ كلمة المرور غير صحيحة - اكتب الصحيحة وسيحفظها التطبيق لهذا الجهاز بعد الدخول", Toast.LENGTH_LONG).show();
                }
            } else if (state != null && typedPassword != null && StarlinkLoginWatch.isSignedInUrl(webView.getUrl())) {
                if (StarlinkLoginWatch.isNewPassword(typedPassword, savedLoginPassword)) {
                    JSObject fields = new JSObject();
                    fields.put("loginPassword", typedPassword);
                    String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
                    if (syncId != null) {
                        LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
                        savedLoginPassword = typedPassword;
                        Toast.makeText(this, "✅ حُفظت كلمة المرور الجديدة لهذا الجهاز", Toast.LENGTH_LONG).show();
                    }
                }
                typedPassword = null;
                warnedWrongPassword = false;
            }
            twoStepHandler.postDelayed(loginWatchPoll, LOGIN_WATCH_MS);
        });
    }

    private void scheduleTwoStepCheck() {
        twoStepHandler.removeCallbacks(twoStepPoll);
        twoStepHandler.postDelayed(twoStepPoll, TWO_STEP_POLL_MS);
    }

    /** Watches for Starlink's «التحقق بخطوتين» page; when it shows, fetches the code by itself. */
    private void checkTwoStep() {
        if (webView == null || autoCodeOff || syncSteps != null || codeFetcher != null || accountId == null
            || !AllowedUrl.isAllowed(webView.getUrl())) {
            if (webView != null && !autoCodeOff) scheduleTwoStepCheck();
            return;
        }
        webView.evaluateJavascript(StarlinkTwoStep.DETECT_SCRIPT, value -> {
            if (webView == null) return;
            String state = value == null ? "" : value.replace("\"", "");
            boolean onTwoStep = "1".equals(state) || "2".equals(state);
            if (onTwoStep && codeFetcher == null && System.currentTimeMillis() - lastFillAt > REFILL_AFTER_MS) startCodeFetch();
            if (!autoCodeOff) scheduleTwoStepCheck();
        });
    }

    private void startCodeFetch() {
        String mailEmail = getIntent().getStringExtra(EXTRA_LOGIN_EMAIL);
        if (MailUrl.providerFor(mailEmail) == MailUrl.Provider.GMAIL) {
            // Gmail can't be read inside the app - its code is typed by hand.
            autoCodeOff = true;
            return;
        }
        if (autoFills >= MAX_AUTO_FILLS) {
            autoCodeOff = true;
            Toast.makeText(this, "جُرّب الرمز " + MAX_AUTO_FILLS + " مرات - أدخله بنفسك من «📧 البريد»", Toast.LENGTH_LONG).show();
            return;
        }
        final SharedPreferences prefs = getSharedPreferences(TRIED_CODES_PREFS, MODE_PRIVATE);
        try {
            CodeSource.Listener listener = new CodeSource.Listener() {
                @Override
                public void onCode(String code) {
                    codeFetcher = null;
                    prefs.edit().putString(accountId, StarlinkTwoStep.remember(prefs.getString(accountId, ""), code)).apply();
                    lastFillAt = System.currentTimeMillis();
                    autoFills++;
                    if (webView != null && AllowedUrl.isAllowed(webView.getUrl())) {
                        webView.evaluateJavascript(StarlinkTwoStep.fillScript(code), null);
                        Toast.makeText(AccountBrowserActivity.this, "✅ أُدخل رمز التحقق من البريد", Toast.LENGTH_SHORT).show();
                    }
                }

                @Override
                public void onSignedOut() {
                    codeFetcher = null;
                    autoCodeOff = true;
                    autoCodeWaitsForMail = true;
                    Toast.makeText(AccountBrowserActivity.this, "📧 سجّل الدخول في «البريد» مرة واحدة ليُدخل التطبيق الرمز تلقائياً", Toast.LENGTH_LONG).show();
                }

                @Override
                public void onGiveUp() {
                    codeFetcher = null;
                    autoCodeOff = true;
                    autoCodeWaitsForMail = true;
                    Toast.makeText(AccountBrowserActivity.this, "لم يصل رمز جديد إلى البريد - افتح «📧 البريد»", Toast.LENGTH_LONG).show();
                }
            };
            codeFetcher = new MailCodeFetcher(this, accountId, mailEmail, prefs.getString(accountId, ""), listener);
        } catch (RuntimeException e) {
            codeFetcher = null;
            autoCodeOff = true;
            return;
        }
        Toast.makeText(this, "📧 أجلب رمز التحقق من البريد…", Toast.LENGTH_SHORT).show();
        codeFetcher.start();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        twoStepHandler.removeCallbacksAndMessages(null);
        if (codeFetcher != null) {
            codeFetcher.stop();
            codeFetcher = null;
        }
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
        syncSawStopped = false;
        syncSawRestricted = false;
        syncEndedHome = false;
        englishSteps = 0;
        englishMenuOpened = false;
        Toast.makeText(this, R.string.starnet_sync_in_progress, Toast.LENGTH_SHORT).show();

        syncSteps = new ArrayDeque<>();
        // Starlink reads cleanly in English (real, confirmed: the Arabic page kept syncing badly), so
        // the page is switched first - ☰ → region/language → "UNITED STATES / English". The choice
        // stays in this device's own browser, so later syncs find it already English.
        syncSteps.add(this::syncStepEnsureEnglish);
        syncSteps.add(this::syncStepExtractCurrentPage); // whatever page the operator is already on
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickSubscriptionsRailItemScript));
        syncSteps.add(this::syncStepExtractCurrentPage); // the list itself: every subscription's name (a device can have more than one)
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickFirstSubscriptionRowScript));
        // Longer wait here: the dish/Wi-Fi dots fill in only after the section's telemetry loads.
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadExpandDevicesSectionScript, DEVICES_SETTLE_DELAY_MS));
        syncSteps.add(this::syncStepExtractCurrentPage); // plan + devices (now expanded) + identifiers
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickBillingRailItemScript)); // skipped on a limited email
        syncSteps.add(this::syncStepExtractCurrentPage); // billing
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickSettingsRailItemScript)); // Settings → Users
        syncSteps.add(this::syncStepExtractCurrentPage); // the Users table: which login email is Admin (the primary email)
        // Home once more, fully settled: its banners ("restricted - outside its home country",
        // "scheduled to end on …") appear a moment after the page itself, and the first read can
        // come before them - real, confirmed miss right after the page was switched to English.
        syncSteps.add(this::syncStepReturnHome);
        syncSteps.add(this::syncStepExtractCurrentPage);
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
                if (fields != null) syncSawStopped = StarlinkExtractorSupport.keepStoppedWithinRun(fields, syncSawStopped);
                if (fields != null) syncSawRestricted = StarlinkExtractorSupport.keepRestrictedWithinRun(fields, syncSawRestricted);
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

    /** One tap toward an English page (language.ts), repeated until the page reads English, nothing
     * more can be found, or MAX_ENGLISH_STEPS - never fatal: the sync then reads the page as it is. */
    private void syncStepEnsureEnglish() {
        if (!syncGuardOk()) {
            finishSync();
            return;
        }
        String script;
        try {
            script = StarlinkExtractorSupport.loadEnsureEnglishScript(getApplicationContext(), englishMenuOpened);
        } catch (IOException e) {
            advanceSyncSteps();
            return;
        }
        webView.evaluateJavascript(script, value -> {
            if (syncSteps == null) return;
            String step = StarlinkExtractorSupport.parseStringResult(value);
            englishSteps++;
            boolean done = "english".equals(step) || "unknown".equals(step) || step.isEmpty() || englishSteps >= MAX_ENGLISH_STEPS;
            if (done && englishMenuOpened && !"english".equals(step)) {
                // Gave up with the ☰ panel still open over the page - reload so the rail is reachable.
                englishMenuOpened = false;
                webView.loadUrl(homeUrl);
                syncHandler.postDelayed(this::advanceSyncSteps, ENGLISH_RELOAD_DELAY_MS);
                return;
            }
            if (done) {
                // The page was just switched and reloaded: let Home's banners appear before the read.
                syncHandler.postDelayed(this::advanceSyncSteps, englishSteps > 1 ? HOME_SETTLE_DELAY_MS : 0);
                return;
            }
            if ("menu".equals(step)) englishMenuOpened = true;
            syncSteps.addFirst(this::syncStepEnsureEnglish);
            if ("clicked".equals(step)) {
                englishMenuOpened = false;
                syncHandler.postDelayed(this::afterEnglishChosen, ENGLISH_RELOAD_DELAY_MS);
                return;
            }
            syncHandler.postDelayed(this::advanceSyncSteps, SYNC_STEP_DELAY_MS);
        });
    }

    /** After "English" was tapped: the picker may land on starlink.com's public site instead of
     * the account - back to the account's own page, then check again. */
    private void afterEnglishChosen() {
        if (webView == null || syncSteps == null) return;
        String url = webView.getUrl();
        if (url == null || !url.contains("/account")) {
            webView.loadUrl(homeUrl != null && homeUrl.contains("/account") ? homeUrl : LocalBrowserPlugin.DEFAULT_URL);
            syncHandler.postDelayed(this::advanceSyncSteps, ENGLISH_RELOAD_DELAY_MS);
            return;
        }
        advanceSyncSteps();
    }

    /** Runs one Stage-2 navigation tap (see navigation.ts) and moves on regardless of whether it
     * actually found its target - a click that missed just means the following extract step(s)
     * find nothing new on whatever page it left the operator on, exactly as tolerated everywhere
     * else in this flow. */
    private void syncStepClick(ScriptLoader loader) {
        syncStepClick(loader, SYNC_STEP_DELAY_MS);
    }

    private void syncStepClick(ScriptLoader loader, long settleDelayMs) {
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
        webView.evaluateJavascript(script, value -> syncHandler.postDelayed(this::advanceSyncSteps, settleDelayMs));
    }

    /** Back to the account's Home page, then a long settle so its banners have appeared. */
    private void syncStepReturnHome() {
        if (!syncGuardOk()) {
            finishSync();
            return;
        }
        syncEndedHome = true;
        webView.loadUrl(homeUrl);
        syncHandler.postDelayed(this::advanceSyncSteps, HOME_SETTLE_DELAY_MS);
    }

    /** Always the last step: returns to the Home page (regardless of which page the run ends on)
     * so the operator lands back somewhere familiar, then reports one combined result for the
     * whole run - never a separate toast per page, which would otherwise fire up to four times in
     * a row for one button tap. */
    private void finishSync() {
        syncSteps = null;
        if (webView != null && !syncEndedHome) {
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

    private static final int MENU_SNAPSHOT = 7001;
    private static final int MENU_MAIL = 7002;

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(Menu.NONE, MENU_MAIL, Menu.NONE, "📧 البريد").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        menu.add(Menu.NONE, MENU_SNAPSHOT, Menu.NONE, "🧪 لقطة تشخيص").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == MENU_SNAPSHOT) {
            sendSnapshot();
            return true;
        }
        if (item.getItemId() == MENU_MAIL) {
            // This device's mailbox, e.g. to copy the Starlink verification code and come back.
            MailBrowserActivity.open(this, accountId, getTitle() != null ? getTitle().toString() : null,
                getIntent().getStringExtra(EXTRA_LOGIN_EMAIL), getIntent().getStringExtra(EXTRA_MAIL_PASSWORD),
                getIntent().getStringArrayExtra(EXTRA_MAIL_SUGGESTIONS), getIntent().getStringExtra(EXTRA_MAIL_RECOVERY));
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    /**
     * 🧪 "لقطة تشخيص": the open Starlink page's structure and colors, every personal word masked
     * (snapshot.ts), sent as a file to the owner's own Telegram bot - to be forwarded for a real
     * test of a misread page. Only from the real Starlink site.
     */
    private void sendSnapshot() {
        if (webView == null || !AllowedUrl.isAllowed(webView.getUrl())) {
            Toast.makeText(this, R.string.starnet_sync_wrong_domain, Toast.LENGTH_LONG).show();
            return;
        }
        if (!TelegramStore.isConfigured(getApplicationContext())) {
            Toast.makeText(this, "اربط بوت تيليغرام الشخصي أولاً من الإعدادات", Toast.LENGTH_LONG).show();
            return;
        }
        String script;
        try {
            script = StarlinkExtractorSupport.loadSnapshotScript(getApplicationContext());
        } catch (IOException e) {
            Toast.makeText(this, "تعذر أخذ اللقطة", Toast.LENGTH_LONG).show();
            return;
        }
        Toast.makeText(this, "🧪 جارِ أخذ اللقطة…", Toast.LENGTH_SHORT).show();
        webView.evaluateJavascript(script, value -> {
            String html;
            try {
                html = new org.json.JSONArray("[" + value + "]").getString(0);
            } catch (org.json.JSONException e) {
                html = null;
            }
            if (html == null || html.isEmpty()) {
                Toast.makeText(this, "تعذر أخذ اللقطة", Toast.LENGTH_LONG).show();
                return;
            }
            final byte[] file = html.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            final android.content.Context app = getApplicationContext();
            final String name = "starnet-snapshot-" + new java.text.SimpleDateFormat("MMdd-HHmmss", java.util.Locale.US).format(new java.util.Date()) + ".html";
            new Thread(() -> {
                boolean sent;
                try {
                    TelegramClient.sendDocument(TelegramStore.token(app), TelegramStore.chatId(app), name, "text/html", file,
                        "🧪 لقطة تشخيص (بدون بيانات شخصية) - أرسلها لمطوّر التطبيق");
                    sent = true;
                } catch (IOException | TelegramClient.TelegramError e) {
                    sent = false;
                }
                final boolean ok = sent;
                runOnUiThread(() -> Toast.makeText(app, ok ? "✅ أُرسلت اللقطة إلى بوتك في تيليغرام" : "تعذر الإرسال - تحقق من الإنترنت", Toast.LENGTH_LONG).show());
            }).start();
        });
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

        /** Fills the Starlink login form (only on the real Starlink site, only empty fields). */
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (autofillScript != null && AllowedUrl.isAllowed(url)) view.evaluateJavascript(autofillScript, null);
            if (activationScript != null && AllowedUrl.isAllowed(url)) view.evaluateJavascript(activationScript, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                webView.setVisibility(View.GONE);
                errorOverlay.setVisibility(View.VISIBLE);
            }
        }

        /** Starlink's "429 Too many requests": pause the background sync (SyncPacing) so it
         * stops adding to the load, and tell the operator it clears by itself in a minute. */
        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            super.onReceivedHttpError(view, request, response);
            if (request.isForMainFrame() && response != null && response.getStatusCode() == 429) {
                SyncPacing.recordRateLimited(AccountBrowserActivity.this, System.currentTimeMillis());
                Toast.makeText(AccountBrowserActivity.this, R.string.starnet_rate_limited, Toast.LENGTH_LONG).show();
            }
        }
    }
}
