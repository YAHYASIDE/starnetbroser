package com.starnetbroser.localbrowser;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Reads the newest Starlink code from a device's own mailbox without showing it: an off-screen
 * WebView in that device's mailbox profile (the one «📧 البريد» signs in to), polling the inbox
 * text with MailCode. Reports a code not tried yet, "signed out" when the mailbox needs a sign-in,
 * or "gave up" after a while. Nothing read here is logged or leaves the phone.
 */
final class MailCodeFetcher {

    interface Listener {
        void onCode(String code);
        void onSignedOut();
        void onGiveUp();
    }

    private static final long POLL_MS = 3000;
    private static final long RELOAD_MS = 30000;
    private static final long SIGNED_OUT_AFTER_MS = 12000;
    private static final long GIVE_UP_MS = 150000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final String tried;
    private WebView webView;
    private long startedAt;
    private long lastReloadAt;
    private boolean done;

    MailCodeFetcher(Context context, String accountId, String tried, Listener listener) {
        this.listener = listener;
        this.tried = tried;
        String profileName = ProfileNaming.mailProfileNameFor(accountId);
        ProfileStore.getInstance().getOrCreateProfile(profileName);
        webView = new WebView(context);
        WebViewCompat.setProfile(webView, profileName);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUserAgentString(MailUrl.DESKTOP_USER_AGENT);
        DisplayMetrics metrics = context.getResources().getDisplayMetrics();
        int width = Math.max(metrics.widthPixels, 1280);
        int height = Math.max(metrics.heightPixels, 1280);
        webView.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        webView.layout(0, 0, width, height);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                String url = request.getUrl().toString();
                String scheme = request.getUrl().getScheme();
                return MailUrl.isAppStoreRedirect(url) || scheme == null || (!scheme.equals("http") && !scheme.equals("https"));
            }
        });
    }

    void start() {
        startedAt = System.currentTimeMillis();
        lastReloadAt = startedAt;
        webView.loadUrl(MailUrl.INBOX_URL);
        handler.postDelayed(this::poll, POLL_MS);
    }

    void stop() {
        done = true;
        handler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
    }

    private void poll() {
        if (done || webView == null) return;
        long now = System.currentTimeMillis();
        if (now - startedAt > GIVE_UP_MS) {
            finish(() -> listener.onGiveUp());
            return;
        }
        String url = webView.getUrl();
        if (url != null && url.contains("login.") && now - startedAt > SIGNED_OUT_AFTER_MS) {
            finish(() -> listener.onSignedOut());
            return;
        }
        if (now - lastReloadAt > RELOAD_MS) {
            lastReloadAt = now;
            webView.reload();
            handler.postDelayed(this::poll, POLL_MS);
            return;
        }
        webView.evaluateJavascript("(function(){return document.body?document.body.innerText:'';})()", value -> {
            if (done) return;
            String text;
            try {
                text = new JSONArray("[" + value + "]").getString(0);
            } catch (JSONException e) {
                text = null;
            }
            String code = MailCode.find(text);
            if (StarlinkTwoStep.isNew(code, tried)) {
                finish(() -> listener.onCode(code));
            } else {
                handler.postDelayed(this::poll, POLL_MS);
            }
        });
    }

    private void finish(Runnable report) {
        stop();
        report.run();
    }
}
