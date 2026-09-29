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

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private String homeUrl;
    private String autofillScript;
    private String accountId;
    private String email;

    /** Starts one device's mailbox (from the plugin or from that device's Starlink browser). */
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

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String profileName = getIntent().getStringExtra(EXTRA_PROFILE_NAME);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        email = getIntent().getStringExtra(EXTRA_EMAIL);
        homeUrl = MailUrl.inboxUrlFor(email);
        autofillScript = LoginAutofill.script(email, getIntent().getStringExtra(EXTRA_PASSWORD));

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
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        // Full web inbox instead of Outlook's "get the app" page (see MailUrl.DESKTOP_USER_AGENT);
        // pinch-zoom since that page is laid out for a computer screen.
        settings.setUserAgentString(MailUrl.DESKTOP_USER_AGENT);
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

        findViewById(R.id.starnet_btn_back).setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); });
        findViewById(R.id.starnet_btn_refresh).setOnClickListener(v -> reload());
        findViewById(R.id.starnet_btn_home).setOnClickListener(v -> { showPage(); webView.loadUrl(homeUrl); });
        findViewById(R.id.starnet_btn_close).setOnClickListener(v -> finish());
        Button codeButton = findViewById(R.id.starnet_btn_sync);
        codeButton.setText("📋 الرمز");
        codeButton.setOnClickListener(v -> copyCode());
        ((Button) findViewById(R.id.starnet_error_retry)).setOnClickListener(v -> reload());

        webView.loadUrl(homeUrl);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
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
                    Toast.makeText(MailBrowserActivity.this, "Outlook يطلب تطبيقه - سجّل الدخول من هذه الصفحة", Toast.LENGTH_LONG).show();
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
            if (state == MailUrl.SessionState.SIGNED_IN) MailSessionStore.markSignedIn(MailBrowserActivity.this, accountId, email);
            else if (state == MailUrl.SessionState.SIGNED_OUT) MailSessionStore.markSignedOut(MailBrowserActivity.this, accountId);
            if (autofillScript != null && MailUrl.isAllowed(url)) view.evaluateJavascript(autofillScript, null);
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
