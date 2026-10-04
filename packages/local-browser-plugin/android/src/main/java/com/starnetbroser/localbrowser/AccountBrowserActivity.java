package com.starnetbroser.localbrowser;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
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
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import java.io.File;
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
    /** 🤖 «إضافة الحساب»: press «التالي» and «تسجيل الدخول» by itself once the fields are typed
     * (StarlinkLoginWatch.autoStep); «التحقق بخطوتين» is already typed and pressed by itself. */
    public static final String EXTRA_AUTO_LOGIN = "com.starnetbroser.localbrowser.AUTO_LOGIN";
    /** 🛑 «إلغاء الاشتراك»: cancel every subscription of this device on Starlink with this reason
     * (the operator pressed the card's button and confirmed). */
    public static final String EXTRA_CANCEL_REASON = "com.starnetbroser.localbrowser.CANCEL_REASON";
    /** 🔄 «تحديث من Starlink» / «مزامنة الآن»: sign in if needed, run «مزامنة» by itself, then close
     * and go back to the app (the same read as the manual button - it's the same code). */
    public static final String EXTRA_AUTO_SYNC = "com.starnetbroser.localbrowser.AUTO_SYNC";
    /** Shown while it runs, e.g. "3 / 10" in a run over several devices. */
    public static final String EXTRA_AUTO_SYNC_LABEL = "com.starnetbroser.localbrowser.AUTO_SYNC_LABEL";

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
    /** Reading a page until it settles (SettleTracker): one read every READ_POLL_MS; after a tap the
     * next step starts after AFTER_TAP_ADVANCE_MS (the read step does the real waiting). */
    private static final long READ_POLL_MS = 500;
    private static final long AFTER_TAP_ADVANCE_MS = 300;
    private static final long CURRENT_PAGE_MAX_MS = 3000;
    private static final long AFTER_TAP_MIN_MS = 600;
    private static final long AFTER_TAP_MAX_MS = 6000;
    private static final long DEVICES_MAX_MS = 7000;
    /** Billing shows the balance first and its «Billing Cycle» (the renewal day) a moment later -
     * real, confirmed: a read taken in between saved the balance without the date. Wait for it. */
    private static final long BILLING_MAX_MS = 9000;
    /** What a settled read must contain before the step may stop early. */
    private static final int WANT_ANY = 0;
    private static final int WANT_DOTS = 1;
    private static final int WANT_RENEWAL = 2;
    /** Home's banners appear a moment after the page: never read it as final before this. */
    private static final long HOME_MIN_MS = 3500;
    private static final long HOME_MAX_MS = 8000;
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
    /** 🤖 The automatic sign-in (EXTRA_AUTO_LOGIN): on until signed in, a wrong password, or a page
     * that doesn't move on after a few presses. */
    private boolean autoLogin;
    /** Polls on a sign-in page with nothing to press (no field seen) - said once after a while. */
    private int autoIdlePolls;
    private boolean autoWarned;
    /** The sign-in page (a field, or the page script at work) was seen - only then can an account
     * page mean "signed in" (StarlinkLoginWatch.signInDone). */
    private boolean autoSawSignIn;

    // ---- 🛑 «إلغاء الاشتراك»: signed in → English → «الاشتراكات» → each row → cancel (cancelSubscription.ts) ----
    private static final long CANCEL_POLL_MS = 2000;
    private static final int CANCEL_SIGN_IN_POLLS = 150; // 5 minutes for the sign-in (and its code)
    /** 🔄 Auto-sync: closes this long after its sync ended (its toast and sound play first). */
    private static final long AUTO_SYNC_CLOSE_DELAY_MS = 600;
    /** How often the auto-sync checks whether the page is signed in (short: no idle waiting). */
    private static final long AUTO_SYNC_POLL_MS = 700;
    /** A device that hasn't finished by then is skipped ("stuck") so a run over many goes on. */
    private static final long AUTO_SYNC_MAX_MS = 120_000;
    /** The sign-in page seen this many polls in a row (~3.5 s): the device isn't signed in - skipped. */
    private static final int AUTO_SYNC_SIGNED_OUT_POLLS = 5;
    private enum CancelPhase { SIGN_IN, ENGLISH, LIST, ROW, CANCELLING }
    private final Runnable cancelPoll = this::cancelTick;
    /** Non-null only while a cancellation runs. */
    private String cancelReason;
    private CancelPhase cancelPhase;
    private CancelProgress cancelProgress;
    private int cancelPolls;
    private int cancelSignInPolls;
    private int cancelRow;
    private int cancelRows;
    private int cancelEnglishSteps;
    private boolean cancelMenuOpened;
    private String cancelEndDate;
    /** The device's name, for the ⏳ notification while a task runs (BusyService). */
    private String deviceLabel;

    // ---- 📷 Starlink's identity check: «التقاط صورة» and uploading a proof (CameraAccess) ----
    /** A page's camera request waiting for Android's camera permission, or null. */
    private PermissionRequest pendingCameraRequest;
    /** The page's open file input (must always be answered, else it never opens again), or null. */
    private ValueCallback<Uri[]> pendingFileCallback;
    private WebChromeClient.FileChooserParams pendingFileParams;
    /** The file input waits for the camera permission before showing the camera/gallery choice. */
    private boolean fileChooserAwaitsCamera;
    /** Where «الكاميرا» saves the photo for the current file input, or null. */
    private File pendingCaptureFile;
    private Uri pendingCaptureUri;
    private final ActivityResultLauncher<String> cameraPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> onCameraPermissionResult(Boolean.TRUE.equals(granted)));
    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> onFileChosen(result.getResultCode(), result.getData()));

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String profileName = getIntent().getStringExtra(EXTRA_PROFILE_NAME);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        String accountName = getIntent().getStringExtra(EXTRA_ACCOUNT_NAME);
        deviceLabel = accountName != null ? accountName : "";
        homeUrl = getIntent().getStringExtra(EXTRA_URL);
        autofillScript = LoginAutofill.script(getIntent().getStringExtra(EXTRA_LOGIN_EMAIL), getIntent().getStringExtra(EXTRA_LOGIN_PASSWORD));
        savedLoginPassword = getIntent().getStringExtra(EXTRA_LOGIN_PASSWORD);
        autoLogin = getIntent().getBooleanExtra(EXTRA_AUTO_LOGIN, false);
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

                @Override
                public void onPermissionRequest(PermissionRequest request) {
                    onCameraRequest(request);
                }

                @Override
                public void onPermissionRequestCanceled(PermissionRequest request) {
                    if (request == pendingCameraRequest) pendingCameraRequest = null;
                }

                @Override
                public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    showFileChooser(callback, params);
                    return true;
                }
            }
        );
        deleteOldCaptures();

        BrowserBar.setUp(this, this::goBackInWebView, this::reload, "⇣", getString(R.string.starnet_action_sync), this::syncFromStarlink);
        ((Button) findViewById(R.id.starnet_error_retry)).setOnClickListener(v -> reload());

        // 💳 Before the first page: the card-fill script must run at the start of every frame.
        cardFill.setUp(webView);
        webView.loadUrl(homeUrl);
        requestNotificationPermissionOnceIfNeeded();
        if (autoLogin && getIntent().getStringExtra(EXTRA_CANCEL_REASON) == null) {
            Toast.makeText(this, "🤖 تسجيل الدخول إلى Starlink يجري وحده - ورمز التحقق يُجلب من البريد", Toast.LENGTH_LONG).show();
        }
        startCancel(getIntent().getStringExtra(EXTRA_CANCEL_REASON));
        if (getIntent().getBooleanExtra(EXTRA_AUTO_SYNC, false)) startAutoSync(getIntent().getStringExtra(EXTRA_AUTO_SYNC_LABEL));
    }

    /** The device's browser was already open (one window per device): a new request - e.g.
     * «إلغاء الاشتراك» from the card - reaches it here. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra(EXTRA_AUTO_LOGIN, false)) autoLogin = true;
        startCancel(intent.getStringExtra(EXTRA_CANCEL_REASON));
        if (intent.getBooleanExtra(EXTRA_AUTO_SYNC, false)) startAutoSync(intent.getStringExtra(EXTRA_AUTO_SYNC_LABEL));
    }

    // ---- 🔄 auto-sync: «مزامنة» by itself, then back to the app ----

    /** True from the request until this screen closes itself after the sync. */
    private boolean autoSyncThenClose;
    private int autoSyncSignedInPolls;
    private int autoSyncSignedOutPolls;
    private final Runnable autoSyncPoll = this::autoSyncTick;
    private final Runnable autoSyncWatchdog = () -> autoSyncGiveUp("stuck", "⚠️ تعلّقت المزامنة - تخطّي هذا الجهاز");

    private void startAutoSync(String label) {
        if (webView == null || autoSyncThenClose) return;
        autoSyncThenClose = true;
        autoSyncSignedInPolls = 0;
        autoSyncSignedOutPolls = 0;
        // The phone mustn't sleep in the middle of a run over several devices.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        String suffix = label != null && !label.trim().isEmpty() ? " (" + label.trim() + ")" : "";
        Toast.makeText(this, "🔄 مزامنة تلقائية" + suffix + " - لا تلمس الصفحة", Toast.LENGTH_SHORT).show();
        twoStepHandler.removeCallbacks(autoSyncPoll);
        twoStepHandler.removeCallbacks(autoSyncWatchdog);
        twoStepHandler.postDelayed(autoSyncPoll, AUTO_SYNC_POLL_MS);
        twoStepHandler.postDelayed(autoSyncWatchdog, AUTO_SYNC_MAX_MS);
    }

    /** Waits until the account page is signed in (twice in a row - not the moment before the sign-in
     * form shows), then runs the same «مزامنة» as the button. The sign-in page instead (a device
     * not signed in to Starlink) is skipped at once - the operator's choice: no sign-in attempt. */
    private void autoSyncTick() {
        if (webView == null || !autoSyncThenClose || syncSteps != null) return;
        if (cancelReason != null || !AllowedUrl.isAllowed(webView.getUrl())) {
            twoStepHandler.postDelayed(autoSyncPoll, AUTO_SYNC_POLL_MS);
            return;
        }
        webView.evaluateJavascript(StarlinkLoginWatch.SCRIPT, value -> {
            if (webView == null || !autoSyncThenClose) return;
            StarlinkLoginWatch.State state = StarlinkLoginWatch.parse(value);
            boolean signedInUrl = StarlinkLoginWatch.isSignedInUrl(webView.getUrl());
            boolean signedIn = state != null && signedInUrl && !state.hasEmailField && !state.hasPasswordField;
            boolean signInPage = state != null && (state.hasEmailField || state.hasPasswordField);
            if (signedIn && ++autoSyncSignedInPolls >= 2) {
                syncFromStarlink();
                return;
            }
            if (!signedIn) autoSyncSignedInPolls = 0;
            if (signInPage && ++autoSyncSignedOutPolls >= AUTO_SYNC_SIGNED_OUT_POLLS) {
                autoSyncGiveUp("signedOut", "⚠️ الجهاز غير مسجّل في Starlink - تخطّي");
                return;
            }
            if (!signInPage) autoSyncSignedOutPolls = 0;
            twoStepHandler.postDelayed(autoSyncPoll, AUTO_SYNC_POLL_MS);
        });
    }

    /** Ends this device's auto-sync without a finished read (signed out / stuck): recorded, then closed. */
    private void autoSyncGiveUp(String outcome, String message) {
        if (!autoSyncThenClose) return;
        AutoSyncResults.record(this, accountId, outcome);
        syncHandler.removeCallbacksAndMessages(null);
        if (syncSteps != null) {
            syncSteps = null;
            taskChanged("sync", null);
        }
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        AlertSound.play(this);
        closeAfterAutoSync();
    }

    private void closeAfterAutoSync() {
        if (!autoSyncThenClose) return;
        autoSyncThenClose = false;
        twoStepHandler.removeCallbacks(autoSyncPoll);
        twoStepHandler.removeCallbacks(autoSyncWatchdog);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        twoStepHandler.postDelayed(() -> {
            if (!isFinishing()) finish();
        }, AUTO_SYNC_CLOSE_DELAY_MS);
    }

    // ---- 🛑 «إلغاء الاشتراك» ----

    private void startCancel(String reason) {
        if (reason == null || reason.trim().isEmpty() || webView == null) return;
        if (cancelReason != null) {
            Toast.makeText(this, "🛑 إلغاء الاشتراك يجري الآن", Toast.LENGTH_SHORT).show();
            return;
        }
        cancelReason = reason.trim();
        taskChanged("cancel", "🛑 إلغاء اشتراك " + deviceLabel);
        cancelPhase = CancelPhase.SIGN_IN;
        cancelPolls = 0;
        cancelSignInPolls = 0;
        cancelRow = 0;
        cancelRows = 0;
        cancelEnglishSteps = 0;
        cancelMenuOpened = false;
        cancelEndDate = null;
        Toast.makeText(this, "🛑 جارِ إلغاء الاشتراك… لا تلمس الصفحة", Toast.LENGTH_LONG).show();
        twoStepHandler.removeCallbacks(cancelPoll);
        twoStepHandler.postDelayed(cancelPoll, CANCEL_POLL_MS);
    }

    private void cancelAgainIn(long delayMs) {
        if (cancelReason != null) twoStepHandler.postDelayed(cancelPoll, delayMs);
    }

    private void cancelTick() {
        if (webView == null || cancelReason == null) return;
        String url = webView.getUrl();
        if (syncSteps != null || !AllowedUrl.isAllowed(url)) {
            cancelAgainIn(CANCEL_POLL_MS);
            return;
        }
        String script;
        try {
            switch (cancelPhase) {
                case SIGN_IN:
                    webView.evaluateJavascript(StarlinkLoginWatch.SCRIPT, value -> {
                        StarlinkLoginWatch.State state = StarlinkLoginWatch.parse(value);
                        boolean signedIn = state != null && StarlinkLoginWatch.isSignedInUrl(webView == null ? null : webView.getUrl())
                            && !state.hasEmailField && !state.hasPasswordField;
                        if (signedIn && ++cancelPolls >= 2) { // twice in a row: not the moment before the sign-in shows
                            cancelPhase = CancelPhase.ENGLISH;
                            cancelPolls = 0;
                        } else if (!signedIn && cancelPolls > 0) {
                            cancelPolls = 0;
                        }
                        if (!signedIn && ++cancelSignInPolls >= CANCEL_SIGN_IN_POLLS) {
                            failCancel("لم يكتمل تسجيل الدخول");
                            return;
                        }
                        cancelAgainIn(CANCEL_POLL_MS);
                    });
                    return;
                case ENGLISH:
                    script = StarlinkExtractorSupport.loadEnsureEnglishScript(getApplicationContext(), cancelMenuOpened);
                    webView.evaluateJavascript(script, value -> {
                        String step = StarlinkExtractorSupport.parseStringResult(value);
                        cancelEnglishSteps++;
                        if ("english".equals(step) || "unknown".equals(step) || step.isEmpty() || cancelEnglishSteps >= MAX_ENGLISH_STEPS) {
                            if (cancelMenuOpened && !"english".equals(step) && webView != null) webView.loadUrl(homeUrl);
                            cancelMenuOpened = false;
                            cancelPhase = CancelPhase.LIST;
                            cancelAgainIn(cancelEnglishSteps > 1 ? HOME_SETTLE_DELAY_MS : CANCEL_POLL_MS);
                            return;
                        }
                        if ("menu".equals(step)) cancelMenuOpened = true;
                        if ("clicked".equals(step)) {
                            cancelMenuOpened = false;
                            // The language picker may land on the public site: back to the account.
                            twoStepHandler.postDelayed(() -> {
                                if (webView == null || cancelReason == null) return;
                                String now = webView.getUrl();
                                if (now == null || !now.contains("/account")) webView.loadUrl(homeUrl != null && homeUrl.contains("/account") ? homeUrl : LocalBrowserPlugin.DEFAULT_URL);
                                cancelAgainIn(ENGLISH_RELOAD_DELAY_MS);
                            }, ENGLISH_RELOAD_DELAY_MS);
                            return;
                        }
                        cancelAgainIn(SYNC_STEP_DELAY_MS);
                    });
                    return;
                case LIST:
                    script = StarlinkExtractorSupport.loadClickSubscriptionsRailItemScript(getApplicationContext());
                    webView.evaluateJavascript(script, value -> {
                        cancelPhase = CancelPhase.ROW;
                        cancelPolls = 0;
                        cancelAgainIn(DEVICES_SETTLE_DELAY_MS);
                    });
                    return;
                case ROW:
                    script = StarlinkExtractorSupport.loadSubscriptionRowCountScript(getApplicationContext());
                    webView.evaluateJavascript(script, value -> {
                        int rows;
                        try {
                            rows = (int) Double.parseDouble(value == null ? "0" : value.replace("\"", ""));
                        } catch (NumberFormatException e) {
                            rows = 0;
                        }
                        if (rows <= cancelRow) {
                            if (++cancelPolls >= 4) failCancel(rows == 0 ? "لم أجد قائمة الاشتراكات" : "لم أجد الاشتراك التالي");
                            else cancelAgainIn(CANCEL_POLL_MS);
                            return;
                        }
                        if (cancelRows == 0) cancelRows = rows;
                        try {
                            webView.evaluateJavascript(StarlinkExtractorSupport.loadClickSubscriptionRowScript(getApplicationContext(), cancelRow), clicked -> {
                                cancelPhase = CancelPhase.CANCELLING;
                                cancelProgress = new CancelProgress();
                                cancelAgainIn(DEVICES_SETTLE_DELAY_MS);
                            });
                        } catch (IOException e) {
                            failCancel("تعذر تحميل خطوات الإلغاء");
                        }
                    });
                    return;
                case CANCELLING:
                    script = StarlinkExtractorSupport.loadCancelStepScript(getApplicationContext(), cancelReason);
                    webView.evaluateJavascript(script, value -> {
                        if (cancelReason == null) return;
                        String answer = StarlinkExtractorSupport.parseStringResult(value);
                        String date = CancelProgress.doneDate(answer);
                        if (date != null) {
                            if (!date.isEmpty()) cancelEndDate = date;
                            cancelRow++;
                            if (cancelRow < cancelRows) {
                                cancelPhase = CancelPhase.LIST; // the device's next subscription
                                cancelAgainIn(CANCEL_POLL_MS);
                            } else {
                                finishCancel();
                            }
                            return;
                        }
                        String stop = cancelProgress.onAnswer(answer);
                        if (stop != null) failCancel(stop);
                        else cancelAgainIn(CANCEL_POLL_MS);
                    });
                    return;
                default:
            }
        } catch (IOException e) {
            failCancel("تعذر تحميل خطوات الإلغاء");
        }
    }

    /** Every subscription says it ends: the card shows it (red «إلغاء الاشتراك»). */
    private void finishCancel() {
        cancelReason = null;
        taskChanged("cancel", null);
        if (cancelEndDate != null && accountId != null) {
            JSObject fields = new JSObject();
            fields.put("pendingCancellationDate", cancelEndDate);
            String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
            if (syncId != null) LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
        }
        Toast.makeText(this, "✅ أُلغي الاشتراك" + (cancelEndDate != null ? " - ينتهي في " + cancelEndDate : ""), Toast.LENGTH_LONG).show();
    }

    private void failCancel(String why) {
        cancelReason = null;
        taskChanged("cancel", null);
        twoStepHandler.removeCallbacks(cancelPoll);
        Toast.makeText(this, "⏸️ لم يكتمل إلغاء الاشتراك: " + why + " - أكمل بنفسك", Toast.LENGTH_LONG).show();
        AlertSound.play(this);
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
                    autoLogin = false; // the right one is the operator's to type
                    Toast.makeText(this, "❌ كلمة المرور غير صحيحة - اكتب الصحيحة وسيحفظها التطبيق لهذا الجهاز بعد الدخول", Toast.LENGTH_LONG).show();
                    AlertSound.play(AccountBrowserActivity.this);
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
            if (autoLogin && state != null) autoStep(state);
            twoStepHandler.postDelayed(loginWatchPoll, LOGIN_WATCH_MS);
        });
    }

    /** 🤖 Watches the in-page automatic sign-in (StarlinkLoginWatch.AUTO_SCRIPT): says once when it
     * is stuck or when nothing was pressed for a while, with what it sees (for a screenshot). */
    private void autoStep(StarlinkLoginWatch.State state) {
        String url = webView.getUrl();
        if (state.hasEmailField || state.hasPasswordField || state.note.startsWith("next") || state.note.startsWith("in")) autoSawSignIn = true;
        if (state.note.startsWith("next") || state.note.startsWith("in")) {
            autoIdlePolls = 0;
            return;
        }
        if (StarlinkLoginWatch.signInDone(autoSawSignIn, state, url)) {
            autoLogin = false; // in
            return;
        }
        // Already signed in (no sign-in page ever showed): nothing to press, nothing to say.
        if (StarlinkLoginWatch.isSignedInUrl(url) && !state.hasEmailField && !state.hasPasswordField) return;
        if (state.note.startsWith("stuck") && !autoWarned) {
            autoWarned = true;
            Toast.makeText(this, "⏸️ الصفحة لا تتقدم بعد الضغط - أكمل بنفسك وأرسل لقطة", Toast.LENGTH_LONG).show();
            AlertSound.play(AccountBrowserActivity.this);
        } else if (++autoIdlePolls >= 8 && !autoWarned) {
            autoWarned = true;
            Toast.makeText(this, "🧪 لم أضغط شيئاً - أرى: " + StarlinkLoginWatch.describe(state, url), Toast.LENGTH_LONG).show();
            AlertSound.play(AccountBrowserActivity.this);
        }
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
        final boolean gmail = MailUrl.providerFor(mailEmail) == MailUrl.Provider.GMAIL;
        if (gmail && !GmailCodeFetcher.isDeviceLinked(this, mailEmail)) {
            // Gmail can't be opened inside the app: read through Google once it's linked («📧 Gmail»).
            autoCodeOff = true;
            Toast.makeText(this, "📧 اربط Gmail هذا الجهاز من زر «📧 Gmail» في البطاقة ليُدخل التطبيق الرمز تلقائياً", Toast.LENGTH_LONG).show();
            return;
        }
        if (autoFills >= MAX_AUTO_FILLS) {
            autoCodeOff = true;
            Toast.makeText(this, "جُرّب الرمز " + MAX_AUTO_FILLS + " مرات - أدخله بنفسك من «📧 البريد»", Toast.LENGTH_LONG).show();
            AlertSound.play(AccountBrowserActivity.this);
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
                    Toast.makeText(AccountBrowserActivity.this, gmail
                        ? "📧 لم يسمح Google بقراءة Gmail - أعد ربطه من زر «📧 Gmail» في البطاقة"
                        : "📧 سجّل الدخول في «البريد» مرة واحدة ليُدخل التطبيق الرمز تلقائياً", Toast.LENGTH_LONG).show();
                    AlertSound.play(AccountBrowserActivity.this);
                }

                @Override
                public void onGiveUp() {
                    codeFetcher = null;
                    autoCodeOff = true;
                    autoCodeWaitsForMail = true;
                    Toast.makeText(AccountBrowserActivity.this, gmail
                        ? "لم يصل رمز جديد إلى Gmail - اطلب رمزاً جديداً من Starlink"
                        : "لم يصل رمز جديد إلى البريد - افتح «📧 البريد»", Toast.LENGTH_LONG).show();
                    AlertSound.play(AccountBrowserActivity.this);
                }
            };
            codeFetcher = gmail
                // Codes of the last 10 minutes only - an older one is long expired.
                ? new GmailCodeFetcher(this, mailEmail, System.currentTimeMillis() - 10L * 60 * 1000, prefs.getString(accountId, ""), listener)
                : new MailCodeFetcher(this, accountId, mailEmail, prefs.getString(accountId, ""), listener);
        } catch (RuntimeException e) {
            codeFetcher = null;
            autoCodeOff = true;
            return;
        }
        Toast.makeText(this, "📧 أجلب رمز التحقق من البريد…", Toast.LENGTH_SHORT).show();
        codeFetcher.start();
    }

    /**
     * ⏳ A task on this screen started (label) or ended (null): while any runs, BusyService keeps
     * the app going and the page keeps believing it is on screen, so leaving STAR NET for another
     * app no longer pauses it (real report: «تحديث» and «إلغاء الاشتراك» stopped until the operator
     * came back, and sometimes failed).
     */
    private void taskChanged(String kind, String label) {
        String key = kind + ":" + accountId;
        if (label != null) BusyService.start(this, key, label);
        else BusyService.stop(this, key);
        if (webView instanceof TaskWebView) ((TaskWebView) webView).setKeepVisible(syncSteps != null || cancelReason != null);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Closed (by hand, or by Android) before its auto-sync ended.
        if (autoSyncThenClose) AutoSyncResults.record(this, accountId, "closed");
        twoStepHandler.removeCallbacksAndMessages(null);
        BusyService.stop(this, "sync:" + accountId);
        BusyService.stop(this, "cancel:" + accountId);
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
            if (pendingCameraRequest != null) {
                pendingCameraRequest.deny();
                pendingCameraRequest = null;
            }
            finishFileChooser(null);
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

    // ---- 📷 camera + proof upload ----

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    /** The page asked for the camera (getUserMedia): only the camera, only on Starlink; Android's
     * own permission is asked the first time it's needed. */
    private void onCameraRequest(PermissionRequest request) {
        String[] grant = CameraAccess.grantFor(webView != null ? webView.getUrl() : null, String.valueOf(request.getOrigin()), request.getResources());
        if (grant.length == 0) {
            request.deny();
            return;
        }
        if (hasCameraPermission()) {
            request.grant(grant);
            return;
        }
        if (pendingCameraRequest != null) pendingCameraRequest.deny();
        pendingCameraRequest = request;
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
    }

    private void onCameraPermissionResult(boolean granted) {
        if (pendingCameraRequest != null) {
            PermissionRequest request = pendingCameraRequest;
            pendingCameraRequest = null;
            String[] grant = CameraAccess.grantFor(webView != null ? webView.getUrl() : null, String.valueOf(request.getOrigin()), request.getResources());
            if (granted && grant.length > 0) request.grant(grant);
            else request.deny();
        }
        if (fileChooserAwaitsCamera) {
            fileChooserAwaitsCamera = false;
            launchFileChooser(granted);
        }
        if (!granted) {
            Toast.makeText(this, "📷 الكاميرا غير مسموحة لـ STAR NET - اسمح بها من إعدادات الهاتف ← التطبيقات ← STAR NET ← الأذونات", Toast.LENGTH_LONG).show();
        }
    }

    /** A file input on the page (uploading a proof): Android's picker - gallery and files, plus the
     * camera when the input takes photos. */
    private void showFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        finishFileChooser(null);
        pendingFileCallback = callback;
        pendingFileParams = params;
        boolean offerCamera = webView != null && AllowedUrl.isAllowed(webView.getUrl()) && CameraAccess.acceptsImages(params.getAcceptTypes());
        if (offerCamera && !hasCameraPermission()) {
            fileChooserAwaitsCamera = true;
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
            return;
        }
        launchFileChooser(offerCamera);
    }

    private void launchFileChooser(boolean withCamera) {
        if (pendingFileCallback == null || pendingFileParams == null) return;
        Intent content;
        try {
            content = pendingFileParams.createIntent();
        } catch (RuntimeException e) {
            content = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        }
        if (pendingFileParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        Intent chooser = Intent.createChooser(content, "📎 اختر صورة الإثبات");
        pendingCaptureFile = null;
        pendingCaptureUri = null;
        if (withCamera && hasCameraPermission()) {
            try {
                File dir = new File(getCacheDir(), CaptureFileProvider.DIR);
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no capture dir");
                File photo = new File(dir, "proof-" + System.currentTimeMillis() + ".jpg");
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + CaptureFileProvider.AUTHORITY_SUFFIX, photo);
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, uri);
                camera.setClipData(ClipData.newRawUri("", uri));
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (camera.resolveActivity(getPackageManager()) != null) {
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { camera });
                    pendingCaptureFile = photo;
                    pendingCaptureUri = uri;
                }
            } catch (IOException | RuntimeException e) {
                pendingCaptureFile = null;
                pendingCaptureUri = null;
            }
        }
        try {
            fileChooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            finishFileChooser(null);
        }
    }

    private void onFileChosen(int resultCode, Intent data) {
        Uri[] chosen = null;
        if (resultCode == RESULT_OK) {
            if (pendingCaptureFile != null && pendingCaptureFile.length() > 0) {
                chosen = new Uri[] { pendingCaptureUri };
            } else if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                ClipData clip = data.getClipData();
                chosen = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) chosen[i] = clip.getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                chosen = new Uri[] { data.getData() };
            }
        }
        finishFileChooser(chosen);
    }

    /** Answers the page's file input (null = cancelled) - always exactly once. */
    private void finishFileChooser(Uri[] chosen) {
        ValueCallback<Uri[]> callback = pendingFileCallback;
        pendingFileCallback = null;
        pendingFileParams = null;
        fileChooserAwaitsCamera = false;
        pendingCaptureFile = null;
        pendingCaptureUri = null;
        if (callback != null) callback.onReceiveValue(chosen);
    }

    /** Camera photos are only needed until the page has uploaded them: drop those over a day old. */
    private void deleteOldCaptures() {
        File[] old = new File(getCacheDir(), CaptureFileProvider.DIR).listFiles();
        if (old == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        for (File file : old) {
            if (file.lastModified() < cutoff) file.delete();
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
        lastSavedPageKey = "";
        Toast.makeText(this, R.string.starnet_sync_in_progress, Toast.LENGTH_SHORT).show();

        syncSteps = new ArrayDeque<>();
        taskChanged("sync", "🔄 تحديث " + deviceLabel);
        // Starlink reads cleanly in English (real, confirmed: the Arabic page kept syncing badly), so
        // the page is switched first - ☰ → region/language → "UNITED STATES / English". The choice
        // stays in this device's own browser, so later syncs find it already English.
        syncSteps.add(this::syncStepEnsureEnglish);
        // Each page is read until it has settled (SettleTracker) instead of once after a fixed wait:
        // the sync moves on as soon as the page is complete, and a slow page gets more time. After a
        // tap the read only counts once the page actually changed (the old page stays on screen for
        // a moment); a tap that found nothing (no billing icon on a limited email) just waits it out.
        syncSteps.add(() -> syncStepReadSettled(0, CURRENT_PAGE_MAX_MS, 2, false, WANT_ANY)); // whatever page the operator is already on
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickSubscriptionsRailItemScript));
        syncSteps.add(() -> syncStepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY)); // the list itself: every subscription's name (a device can have more than one)
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickFirstSubscriptionRowScript));
        syncSteps.add(() -> syncStepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY)); // the subscription page is open before «الأجهزة» is tapped
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadExpandDevicesSectionScript));
        // The dish/Wi-Fi dots fill in only after the section's telemetry loads: wait for a colored dot.
        syncSteps.add(() -> syncStepReadSettled(AFTER_TAP_MIN_MS, DEVICES_MAX_MS, 2, false, WANT_DOTS)); // plan + devices (now expanded) + identifiers
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickBillingRailItemScript)); // skipped on a limited email
        syncSteps.add(() -> syncStepReadSettled(AFTER_TAP_MIN_MS, BILLING_MAX_MS, 2, true, WANT_RENEWAL)); // billing: balance + the paying card + the renewal day
        syncSteps.add(() -> syncStepClick(StarlinkExtractorSupport::loadClickSettingsRailItemScript)); // Settings → Users
        syncSteps.add(() -> syncStepReadSettled(AFTER_TAP_MIN_MS, AFTER_TAP_MAX_MS, 2, true, WANT_ANY)); // the Users table: which login email is Admin (the primary email)
        // Home once more, fully settled: its banners ("restricted - outside its home country",
        // "scheduled to end on …") appear a moment after the page itself, and the first read can
        // come before them - real, confirmed miss right after the page was switched to English.
        syncSteps.add(this::syncStepReturnHome);
        syncSteps.add(() -> syncStepReadSettled(HOME_MIN_MS, HOME_MAX_MS, 3, false, WANT_ANY));
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

    /** The comparable form of the last page read that was saved (for "did the tap change the page?"). */
    private String lastSavedPageKey = "";

    /**
     * Reads the open page every READ_POLL_MS until it has settled (SettleTracker), then saves the
     * last full read once. {@code mustChange}: right after a tap - a read equal to the previous
     * page's is the old page still on screen, not the new one. {@code wantDots}: the devices section
     * - settled only once a dish/Wi-Fi dot has its color (or at the time limit).
     */
    private void syncStepReadSettled(long minMs, long maxMs, int stableReads, boolean mustChange, int want) {
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
        SettleTracker tracker = new SettleTracker(minMs, maxMs, stableReads);
        long started = android.os.SystemClock.elapsedRealtime();
        JSObject[] latest = new JSObject[1];
        String previousPage = lastSavedPageKey;
        readSettledPoll(script, tracker, started, latest, mustChange ? previousPage : null, want);
    }

    private void readSettledPoll(String script, SettleTracker tracker, long started, JSObject[] latest, String previousPage, int want) {
        if (syncSteps == null) return;
        if (!syncGuardOk()) {
            finishSync();
            return;
        }
        webView.evaluateJavascript(script, value -> {
            if (syncSteps == null) return;
            if (!syncGuardOk()) {
                finishSync();
                return;
            }
            JSObject fields = StarlinkExtractorSupport.parseExtractedFields(value);
            String key = StarlinkExtractorSupport.settleKey(fields);
            boolean stillOldPage = previousPage != null && !key.isEmpty() && key.equals(previousPage);
            if (!key.isEmpty() && !stillOldPage) latest[0] = fields;
            boolean good = !stillOldPage
                && (want != WANT_DOTS || StarlinkExtractorSupport.hasColoredDot(fields))
                && (want != WANT_RENEWAL || StarlinkExtractorSupport.hasRenewalDate(fields));
            long elapsed = android.os.SystemClock.elapsedRealtime() - started;
            if (tracker.offer(stillOldPage ? "" : key, good, elapsed)) {
                saveSyncRead(latest[0]);
                advanceSyncSteps();
                return;
            }
            syncHandler.postDelayed(() -> readSettledPoll(script, tracker, started, latest, previousPage, want), READ_POLL_MS);
        });
    }

    /** Durably saves one page's read (and remembers it as "the page we were on"). */
    private void saveSyncRead(JSObject fields) {
        if (fields == null || fields.length() == 0) return;
        lastSavedPageKey = StarlinkExtractorSupport.settleKey(fields);
        syncSawStopped = StarlinkExtractorSupport.keepStoppedWithinRun(fields, syncSawStopped);
        syncSawRestricted = StarlinkExtractorSupport.keepRestrictedWithinRun(fields, syncSawRestricted);
        // Durable write FIRST: the final toast must never claim more than what is actually safe on
        // disk. The main STAR NET Activity this screen sits on may be stopped right now, so the live
        // event below can be dropped - PendingSyncStore (drained by the web UI on open/resume) is
        // what guarantees the result is never lost.
        String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
        if (syncId != null) {
            syncFoundAnything = true;
            LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
        } else {
            syncSaveFailed = true;
        }
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
        syncStepClick(loader, AFTER_TAP_ADVANCE_MS);
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
        lastSavedPageKey = "";
        webView.loadUrl(homeUrl);
        syncHandler.postDelayed(this::advanceSyncSteps, AFTER_TAP_ADVANCE_MS);
    }

    /** Always the last step: returns to the Home page (regardless of which page the run ends on)
     * so the operator lands back somewhere familiar, then reports one combined result for the
     * whole run - never a separate toast per page, which would otherwise fire up to four times in
     * a row for one button tap. */
    private void finishSync() {
        syncSteps = null;
        taskChanged("sync", null);
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
        // 🔔 The operator asked for a sound when a sync ends (silent mode stays silent).
        AlertSound.play(this);
        if (autoSyncThenClose) AutoSyncResults.record(this, accountId, syncSaveFailed ? "saveFailed" : syncFoundAnything ? "ok" : "nothing");
        closeAfterAutoSync();
    }

    private static final int MENU_SNAPSHOT = 7001;
    private static final int MENU_MAIL = 7002;
    private static final int MENU_CARD = 7003;
    /** 💳 Fills Starlink's card form with one of the operator's saved cards. */
    private final CardFillController cardFill = new CardFillController(this);

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(Menu.NONE, MENU_MAIL, Menu.NONE, "📧 البريد").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        menu.add(Menu.NONE, MENU_SNAPSHOT, Menu.NONE, "🧪 لقطة تشخيص").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        if (cardFill.isOn()) menu.add(Menu.NONE, MENU_CARD, Menu.NONE, "💳").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == MENU_CARD) {
            cardFill.showPicker();
            return true;
        }
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
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            cardFill.onNewPage();
        }

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
            if (autoLogin && AllowedUrl.isAllowed(url)) view.evaluateJavascript(StarlinkLoginWatch.AUTO_SCRIPT, null);
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
