package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
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
import androidx.webkit.ProfileStore;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * 📧 البريد: one device's Outlook mailbox inside STAR NET, in its OWN isolated WebView profile
 * (ProfileNaming.mailProfileNameFor - never the device's Starlink profile, never another device's
 * mailbox). The operator signs in once per email and it stays signed in, with no account added to
 * the Outlook app. The sign-in form is filled with the saved email/password (empty fields only,
 * never submitted - LoginAutofill), and «📋 الرمز» copies the newest Starlink verification code
 * shown on the page (MailCode). Nothing here is logged or leaves the phone.
 */
public class MailBrowserActivity extends AppCompatActivity {

    public static final String EXTRA_PROFILE_NAME = "com.starnetbroser.localbrowser.MAIL_PROFILE_NAME";
    public static final String EXTRA_TITLE = "com.starnetbroser.localbrowser.MAIL_TITLE";
    public static final String EXTRA_EMAIL = "com.starnetbroser.localbrowser.MAIL_EMAIL";
    public static final String EXTRA_PASSWORD = "com.starnetbroser.localbrowser.MAIL_PASSWORD";
    public static final String EXTRA_ACCOUNT_ID = "com.starnetbroser.localbrowser.MAIL_ACCOUNT_ID";
    /** The passwords offered when the password field is empty or the password was wrong. */
    public static final String EXTRA_SUGGESTIONS = "com.starnetbroser.localbrowser.MAIL_SUGGESTIONS";
    /** Typed into Microsoft's «Add an email address» (the account has no recovery email yet). */
    public static final String EXTRA_RECOVERY_EMAIL = "com.starnetbroser.localbrowser.MAIL_RECOVERY_EMAIL";
    /** 🆕 «إنشاء حساب جديد»: open Microsoft's signup (filled with these names) instead of the inbox. */
    public static final String EXTRA_SIGNUP = "com.starnetbroser.localbrowser.MAIL_SIGNUP";
    public static final String EXTRA_SIGNUP_FIRST_NAME = "com.starnetbroser.localbrowser.MAIL_SIGNUP_FIRST_NAME";
    public static final String EXTRA_SIGNUP_LAST_NAME = "com.starnetbroser.localbrowser.MAIL_SIGNUP_LAST_NAME";
    /** Microsoft's «Add an email address» (where its codes go) is filled with this one. */
    public static final String EXTRA_SIGNUP_RECOVERY = "com.starnetbroser.localbrowser.MAIL_SIGNUP_RECOVERY";
    /** The device's «تفعيل Starlink» browser, started once the new inbox opens. */
    public static final String EXTRA_THEN = "com.starnetbroser.localbrowser.MAIL_THEN";

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private String homeUrl;
    private String autofillScript;
    private String accountId;
    private String email;
    /** Signup mode: Microsoft's pages are filled from the app (SignupFill), then «تفعيل Starlink». */
    private boolean signup;
    private String signupScript;
    private Intent thenIntent;
    private boolean sawSignupPage;
    private boolean movedOn;

    /** 🔑 The password watch: offers the suggestions (once per empty field / wrong password) and
     * keeps the password that got into the inbox as the device's «كود البريد». */
    private static final long PASSWORD_WATCH_MS = 1500;
    private final android.os.Handler watchHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable passwordPoll = this::checkPassword;
    private String savedPassword;
    private String[] suggestions = new String[0];
    private String typedPassword;
    private boolean offeredForField;
    private boolean offeredForWrong;
    /** The saved code typed straight from here when the page's own autofill left the field empty. */
    private boolean directFillTried;
    private boolean warnedNothingSaved;
    private String recoveryScript;
    private boolean recoveryFilled;
    private android.app.AlertDialog pickerDialog;

    /** 📨 Microsoft's "enter the code we sent" page: the code is read from the linked Gmail
     * («بريد الرموز», GmailCodeFetcher) and typed in - the operator taps «Next». */
    private GmailCodeFetcher gmailFetcher;
    private boolean codeWaitDone;
    private boolean warnedNotLinked;
    private long lastCodeAt;

    /**
     * Opens one device's Outlook mailbox inside the app (isolated web view, autofilled, code
     * reading). Gmail is not offered: Google refuses its sign-in inside an app's web view.
     */
    static void open(android.app.Activity activity, String accountId, String title, String email, String password, String[] suggestions) {
        open(activity, accountId, title, email, password, suggestions, null);
    }

    static void open(android.app.Activity activity, String accountId, String title, String email, String password, String[] suggestions, String recoveryEmail) {
        if (MailUrl.providerFor(email) == MailUrl.Provider.GMAIL) {
            android.widget.Toast.makeText(activity, "بريد Gmail لا يُفتح داخل التطبيق - Google تمنع ذلك", android.widget.Toast.LENGTH_LONG).show();
            return;
        }
        Intent intent = intentFor(activity, accountId, title, email, password);
        if (suggestions != null && suggestions.length > 0) intent.putExtra(EXTRA_SUGGESTIONS, suggestions);
        if (recoveryEmail != null && !recoveryEmail.trim().isEmpty()) intent.putExtra(EXTRA_RECOVERY_EMAIL, recoveryEmail.trim());
        activity.startActivity(intent);
    }

    /** Starts one device's Outlook mailbox inside the app. */
    static Intent intentFor(Context context, String accountId, String title, String email, String password) {
        Intent intent = new Intent(context, MailBrowserActivity.class);
        intent.putExtra(EXTRA_PROFILE_NAME, ProfileNaming.mailProfileNameFor(accountId));
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_ACCOUNT_ID, accountId);
        if (email != null && !email.trim().isEmpty()) intent.putExtra(EXTRA_EMAIL, email.trim());
        if (password != null && !password.isEmpty()) intent.putExtra(EXTRA_PASSWORD, password);
        // Its own "document" per device, like the Starlink browser: reopening brings it back.
        intent.setData(Uri.parse("starnet-mail://" + Uri.encode(accountId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        return intent;
    }

    /** 🆕 Turns a mailbox intent into «إنشاء حساب جديد»: the signup, then `then` (Starlink). */
    static void asSignup(Intent intent, String firstName, String lastName, String recoveryEmail, Intent then) {
        intent.putExtra(EXTRA_SIGNUP, true);
        intent.putExtra(EXTRA_SIGNUP_RECOVERY, recoveryEmail);
        intent.putExtra(EXTRA_SIGNUP_FIRST_NAME, firstName);
        intent.putExtra(EXTRA_SIGNUP_LAST_NAME, lastName);
        if (then != null) intent.putExtra(EXTRA_THEN, then);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String profileName = getIntent().getStringExtra(EXTRA_PROFILE_NAME);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        email = getIntent().getStringExtra(EXTRA_EMAIL);
        signup = getIntent().getBooleanExtra(EXTRA_SIGNUP, false);
        if (signup) {
            homeUrl = SignupFill.OUTLOOK_SIGNUP_URL;
            signupScript = SignupFill.outlookScript(email, getIntent().getStringExtra(EXTRA_PASSWORD),
                getIntent().getStringExtra(EXTRA_SIGNUP_FIRST_NAME), getIntent().getStringExtra(EXTRA_SIGNUP_LAST_NAME),
                getIntent().getStringExtra(EXTRA_SIGNUP_RECOVERY));
            thenIntent = getIntent().getParcelableExtra(EXTRA_THEN);
        } else {
            homeUrl = MailUrl.inboxUrlFor(email);
            savedPassword = getIntent().getStringExtra(EXTRA_PASSWORD);
            autofillScript = LoginAutofill.script(email, savedPassword);
            String[] offered = getIntent().getStringArrayExtra(EXTRA_SUGGESTIONS);
            if (offered != null) suggestions = offered;
            recoveryScript = GmailCodes.recoveryEmailScript(getIntent().getStringExtra(EXTRA_RECOVERY_EMAIL));
        }

        if (profileName == null || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            Toast.makeText(this, R.string.starnet_unsupported_device, Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        ProfileStore.getInstance().getOrCreateProfile(profileName);

        setContentView(R.layout.activity_account_browser);
        Toolbar toolbar = findViewById(R.id.starnet_toolbar);
        toolbar.setTitle("📧 " + (email != null ? email : title != null ? title : "البريد"));
        setSupportActionBar(toolbar);

        progressBar = findViewById(R.id.starnet_progress);
        errorOverlay = findViewById(R.id.starnet_error_overlay);
        webView = findViewById(R.id.starnet_webview);
        WebViewCompat.setProfile(webView, profileName); // before anything else touches the WebView

        WebSettings settings = webView.getSettings();
        configureMailSettings(settings);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        // Pinch-zoom since the desktop inbox is laid out for a computer screen.
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        webView.setWebViewClient(new MailWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progressBar.setProgress(newProgress);
            }
        });

        if (signup && thenIntent != null) {
            BrowserBar.setUp(this, () -> { if (webView.canGoBack()) webView.goBack(); }, this::reload, "🛰️", "تفعيل Starlink", this::moveOnToStarlink);
            Toast.makeText(this, "🆕 أكمل إنشاء البريد (الخانات مكتوبة) - بعد فتح صندوق البريد ننتقل إلى تفعيل Starlink", Toast.LENGTH_LONG).show();
        } else {
            BrowserBar.setUp(this, () -> { if (webView.canGoBack()) webView.goBack(); }, this::reload, "📋", "نسخ الرمز", this::copyCode);
        }
        ((Button) findViewById(R.id.starnet_error_retry)).setOnClickListener(v -> reload());

        webView.loadUrl(homeUrl);
    }

    /**
     * Shared by the visible mailbox and MailCodeFetcher: a desktop browser identity (the full web
     * inbox instead of a "get the app" page - MailUrl.DESKTOP_USER_AGENT) and no "X-Requested-With"
     * app header, which Google's sign-in uses to refuse embedded browsers.
     */
    static void configureMailSettings(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUserAgentString(MailUrl.DESKTOP_USER_AGENT);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, java.util.Collections.emptySet());
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        watchHandler.postDelayed(passwordPoll, PASSWORD_WATCH_MS);
    }

    @Override
    protected void onPause() {
        super.onPause();
        watchHandler.removeCallbacks(passwordPoll);
        stopCodeWait();
    }

    /** Microsoft's «Add an email address» (no recovery email yet): the shop's Gmail, once. */
    private void checkRecoveryPage() {
        if (webView == null || recoveryScript == null || recoveryFilled || !GmailCodes.isMicrosoftStep(webView.getUrl())) return;
        webView.evaluateJavascript(recoveryScript, value -> {
            if ("\"ok\"".equals(value)) {
                recoveryFilled = true;
                Toast.makeText(this, "📨 كُتب بريد الاسترداد - اضغط Next", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void stopCodeWait() {
        if (gmailFetcher != null) gmailFetcher.stop();
        gmailFetcher = null;
    }

    /** The code page: start waiting for the code in Gmail (once per appearance of the page). */
    private void checkCodePage() {
        // Only Microsoft's sign-in / signup steps - never the inbox, whose messages mention codes.
        if (webView == null || !GmailCodes.isMicrosoftStep(webView.getUrl())) return;
        webView.evaluateJavascript(GmailCodes.DETECT_SCRIPT, value -> {
            if (webView == null) return;
            String state = value == null ? "" : value.replace("\"", "");
            if ("0".equals(state)) {
                codeWaitDone = false;
                stopCodeWait();
                return;
            }
            if (!"1".equals(state) || gmailFetcher != null || codeWaitDone) return;
            String linked = GmailCodeFetcher.linkedEmail(this);
            if (linked == null) {
                if (!warnedNotLinked) {
                    warnedNotLinked = true;
                    Toast.makeText(this, "📨 اربط «بريد الرموز» من الإعدادات ليُكتب رمز التحقق وحده", Toast.LENGTH_LONG).show();
                }
                codeWaitDone = true;
                return;
            }
            Toast.makeText(this, "📨 ننتظر الرمز في " + linked + "…", Toast.LENGTH_SHORT).show();
            long since = Math.max(System.currentTimeMillis() - 2 * 60 * 1000, lastCodeAt + 1);
            gmailFetcher = new GmailCodeFetcher(this, since, new CodeSource.Listener() {
                @Override
                public void onCode(String code) {
                    gmailFetcher = null;
                    codeWaitDone = true;
                    lastCodeAt = System.currentTimeMillis();
                    if (webView != null) webView.evaluateJavascript(GmailCodes.fillScript(code), null);
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("code", code));
                    Toast.makeText(MailBrowserActivity.this, "📨 كُتب الرمز " + code + " - اضغط Next", Toast.LENGTH_LONG).show();
                }

                @Override
                public void onSignedOut() {
                    gmailFetcher = null;
                    codeWaitDone = true;
                    Toast.makeText(MailBrowserActivity.this, "📨 Gmail الرموز غير مربوط بهذا الحساب - اربطه من الإعدادات", Toast.LENGTH_LONG).show();
                }

                @Override
                public void onGiveUp() {
                    gmailFetcher = null;
                    codeWaitDone = true;
                    Toast.makeText(MailBrowserActivity.this, "📨 لم يصل رمز خلال 3 دقائق - اطلبه من جديد", Toast.LENGTH_LONG).show();
                }
            });
            gmailFetcher.start();
        });
    }

    /** Microsoft's password step: what is typed, whether it says "wrong", and when to offer the list. */
    private void checkPassword() {
        if (webView == null || isFinishing()) return;
        if (!MailUrl.isAllowed(webView.getUrl())) {
            watchHandler.postDelayed(passwordPoll, PASSWORD_WATCH_MS);
            return;
        }
        checkCodePage();
        checkRecoveryPage();
        if (signup) {
            // The signup's password is the one the operator typed in the app - nothing to offer.
            watchHandler.postDelayed(passwordPoll, PASSWORD_WATCH_MS);
            return;
        }
        webView.evaluateJavascript(StarlinkLoginWatch.SCRIPT, value -> {
            if (webView == null) return;
            StarlinkLoginWatch.State state = StarlinkLoginWatch.parse(value);
            if (state != null && state.hasPasswordField) {
                if (!state.password.isEmpty()) typedPassword = state.password;
                boolean nothingSaved = savedPassword == null || savedPassword.isEmpty();
                if (state.wrongPassword && !offeredForWrong) {
                    offeredForWrong = true;
                    if (suggestions.length > 0) offerPasswords("❌ كلمة المرور غير صحيحة - اختر غيرها");
                    else Toast.makeText(this, "❌ كلمة المرور غير صحيحة - اكتب الصحيحة وتُحفظ بعد الدخول", Toast.LENGTH_LONG).show();
                } else if (state.password.isEmpty() && !nothingSaved && !state.wrongPassword && !directFillTried) {
                    // The page's own autofill (LoginAutofill) left it empty: type the saved code from here.
                    directFillTried = true;
                    webView.evaluateJavascript(StarlinkLoginWatch.fillPasswordScript(savedPassword), null);
                    typedPassword = savedPassword;
                } else if (state.password.isEmpty() && nothingSaved && !offeredForField) {
                    offeredForField = true;
                    if (suggestions.length > 0) offerPasswords("🔑 اختر كلمة مرور البريد");
                    else if (!warnedNothingSaved) {
                        warnedNothingSaved = true;
                        Toast.makeText(this, "🔑 لا «كود بريد» محفوظ لهذا الجهاز - اكتبه، ويُحفظ وحده بعد الدخول", Toast.LENGTH_LONG).show();
                    }
                }
            } else if (state != null) {
                // The password step is gone (next step, or the inbox): offer again next time.
                offeredForField = false;
                offeredForWrong = false;
                directFillTried = false;
            }
            watchHandler.postDelayed(passwordPoll, PASSWORD_WATCH_MS);
        });
    }

    /** The suggestions as a list (shown as written, like «كلمات المرور المستعملة»); the picked one
     * is typed into the visible password field - nothing is pressed. */
    private void offerPasswords(String title) {
        if (suggestions.length == 0 || isFinishing() || (pickerDialog != null && pickerDialog.isShowing())) return;
        pickerDialog = new android.app.AlertDialog.Builder(this)
            .setTitle(title)
            .setItems(suggestions, (dialog, which) -> {
                String picked = suggestions[which];
                typedPassword = picked;
                if (webView != null) webView.evaluateJavascript(StarlinkLoginWatch.fillPasswordScript(picked), null);
            })
            .setNegativeButton("أكتبها بنفسي", null)
            .show();
    }

    /** In the inbox with a password other than the saved one: it becomes the device's «كود البريد». */
    private void keepWorkingPassword() {
        if (accountId == null || !StarlinkLoginWatch.isNewPassword(typedPassword, savedPassword)) return;
        com.getcapacitor.JSObject fields = new com.getcapacitor.JSObject();
        fields.put("mailPassword", typedPassword);
        String syncId = PendingSyncStore.save(getApplicationContext(), accountId, fields);
        if (syncId != null) {
            LocalBrowserPlugin.emitAccountDataSynced(syncId, accountId, fields);
            savedPassword = typedPassword;
            Toast.makeText(this, "✅ حُفظت كلمة مرور البريد لهذا الجهاز", Toast.LENGTH_LONG).show();
        }
        typedPassword = null;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        watchHandler.removeCallbacks(passwordPoll);
        stopCodeWait();
        if (pickerDialog != null) pickerDialog.dismiss();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.setWebChromeClient(null);
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void showPage() {
        errorOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    private void reload() {
        showPage();
        webView.reload();
    }

    /** 🆕 The new email is made: on to «تفعيل Starlink» in the device's own browser (once). */
    private void moveOnToStarlink() {
        if (movedOn || thenIntent == null) return;
        movedOn = true;
        startActivity(thenIntent);
        finish();
    }

    /** «📋 الرمز»: the newest Starlink verification code on the open mailbox page -> clipboard. */
    private void copyCode() {
        if (webView == null || !MailUrl.isAllowed(webView.getUrl())) {
            Toast.makeText(this, "افتح صندوق البريد أولاً", Toast.LENGTH_LONG).show();
            return;
        }
        webView.evaluateJavascript("(function(){return document.body?document.body.innerText:'';})()", value -> {
            String text;
            try {
                text = new JSONArray("[" + value + "]").getString(0);
            } catch (JSONException e) {
                text = null;
            }
            String code = MailCode.find(text);
            if (code == null) {
                Toast.makeText(this, "لم أجد رمزاً في الصفحة - افتح رسالة Starlink ثم اضغط «📋 الرمز»", Toast.LENGTH_LONG).show();
                return;
            }
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Starlink", code));
            Toast.makeText(this, "📋 نُسخ الرمز " + code + " - الصقه في صفحة Starlink", Toast.LENGTH_LONG).show();
        });
    }

    /** Set once an app-store hop was stopped and the inbox reloaded - never loops on it. */
    private boolean storeRedirectRetried;

    private class MailWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (MailUrl.isAppStoreRedirect(request.getUrl().toString())) {
                if (!storeRedirectRetried) {
                    storeRedirectRetried = true;
                    view.loadUrl(homeUrl);
                } else {
                    Toast.makeText(MailBrowserActivity.this, "البريد يطلب تثبيت تطبيقه - سجّل الدخول من هذه الصفحة", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            String scheme = request.getUrl().getScheme();
            // Never hand off to another app (intent:, market:, ms-outlook: ...) - stays contained.
            return scheme == null || (!scheme.equals("http") && !scheme.equals("https"));
        }

        /** Fills the Microsoft sign-in form (only on Microsoft's own pages, only empty fields). */
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            // Remembers whether this device's mailbox is signed in (the green «📧 البريد» button).
            MailUrl.SessionState state = MailUrl.sessionState(url);
            if (state == MailUrl.SessionState.SIGNED_IN) {
                MailSessionStore.markSignedIn(MailBrowserActivity.this, accountId, email);
                if (!signup) keepWorkingPassword();
            }
            else if (state == MailUrl.SessionState.SIGNED_OUT) MailSessionStore.markSignedOut(MailBrowserActivity.this, accountId);
            if (autofillScript != null && MailUrl.isAllowed(url)) view.evaluateJavascript(autofillScript, null);
            if (signup) {
                if (SignupFill.isSignupPage(url)) sawSignupPage = true;
                if (signupScript != null && MailUrl.isAllowed(url)) view.evaluateJavascript(signupScript, null);
                // The new inbox opened after Microsoft's signup: the email is made.
                if (state == MailUrl.SessionState.SIGNED_IN && sawSignupPage && thenIntent != null && !movedOn) {
                    Toast.makeText(MailBrowserActivity.this, "✅ أُنشئ البريد - ننتقل إلى تفعيل Starlink", Toast.LENGTH_LONG).show();
                    moveOnToStarlink();
                }
            }
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
