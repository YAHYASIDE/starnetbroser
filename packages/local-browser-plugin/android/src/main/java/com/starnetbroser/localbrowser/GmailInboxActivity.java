package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 📧 البريد for a Gmail address, inside the app like Outlook: the inbox is read over IMAP with the
 * account's «كلمة مرور التطبيق» (GmailImap) and shown as a local page (MailInboxHtml) in the same
 * window and bottom bar. The first time, the page walks through making that app password. The
 * page never loads anything from the internet; it reaches the app only through `StarNet`.
 */
public class GmailInboxActivity extends AppCompatActivity {

    static final String EXTRA_ACCOUNT_ID = "com.starnetbroser.localbrowser.GMAIL_ACCOUNT_ID";
    static final String EXTRA_EMAIL = "com.starnetbroser.localbrowser.GMAIL_EMAIL";

    private static final int MENU_RESET = 7101;
    private static final int FETCH_LIMIT = 40;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WebView webView;
    private View progress;
    private String accountId;
    private String email;
    private List<MailMessage> messages = new ArrayList<>();
    private boolean destroyed;

    static Intent intentFor(Context context, String accountId, String email) {
        Intent intent = new Intent(context, GmailInboxActivity.class);
        intent.putExtra(EXTRA_ACCOUNT_ID, accountId);
        intent.putExtra(EXTRA_EMAIL, email == null ? "" : email.trim());
        intent.setData(Uri.parse("starnet-gmail://" + Uri.encode(accountId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        return intent;
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
        email = getIntent().getStringExtra(EXTRA_EMAIL);
        setContentView(R.layout.activity_account_browser);
        Toolbar toolbar = findViewById(R.id.starnet_toolbar);
        toolbar.setTitle("📧 " + email);
        setSupportActionBar(toolbar);
        progress = findViewById(R.id.starnet_progress);
        webView = findViewById(R.id.starnet_webview);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        // Only this app's own local page is ever shown - nothing is navigated to.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
        });
        webView.addJavascriptInterface(new Bridge(), "StarNet");

        BrowserBar.setUp(this, () -> { if (webView.canGoBack()) webView.goBack(); }, this::refresh, "📋", "نسخ الرمز", this::copyNewestCode);
        refresh();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        destroyed = true;
        worker.shutdownNow();
        main.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.removeJavascriptInterface("StarNet");
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(Menu.NONE, MENU_RESET, Menu.NONE, "🔑 تغيير كلمة مرور التطبيق");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == MENU_RESET) {
            GmailPasswordStore.remove(this, email);
            MailSessionStore.markSignedOut(this, accountId);
            showPage(MailInboxHtml.setupPage(email, ""));
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void showPage(String html) {
        if (webView != null) webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** Reads the inbox (or shows the one-time setup when there is no app password yet). */
    private void refresh() {
        String password = GmailPasswordStore.get(this, email);
        if (password == null) {
            showPage(MailInboxHtml.setupPage(email, ""));
            return;
        }
        progress.setVisibility(View.VISIBLE);
        worker.execute(() -> {
            List<MailMessage> fetched = null;
            String error = null;
            boolean refused = false;
            try {
                fetched = GmailImap.fetchRecent(email, password, FETCH_LIMIT);
            } catch (GmailImap.BadPassword e) {
                refused = true;
            } catch (Exception e) {
                error = "تعذر الاتصال بـ Gmail - تحقق من الإنترنت ثم اضغط «تحديث»";
            }
            final List<MailMessage> result = fetched;
            final String failure = error;
            final boolean badPassword = refused;
            main.post(() -> {
                if (destroyed) return;
                progress.setVisibility(View.GONE);
                if (badPassword) {
                    GmailPasswordStore.remove(this, email);
                    MailSessionStore.markSignedOut(this, accountId);
                    showPage(MailInboxHtml.setupPage(email, "Google رفضت كلمة مرور التطبيق - أنشئ واحدة جديدة والصقها"));
                } else if (failure != null) {
                    Toast.makeText(this, failure, Toast.LENGTH_LONG).show();
                } else {
                    messages = result;
                    MailSessionStore.markSignedIn(this, accountId, email);
                    showPage(MailInboxHtml.inboxPage(email, messages, TimeZone.getDefault()));
                }
            });
        });
    }

    private void copyNewestCode() {
        String code = MailMessages.newestCode(messages);
        if (code == null) {
            Toast.makeText(this, "لا يوجد رمز في الرسائل - اضغط «تحديث» بعد وصول رسالة Starlink", Toast.LENGTH_LONG).show();
            return;
        }
        copy(code);
    }

    private void copy(String code) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Starlink", code));
        Toast.makeText(this, "📋 نُسخ الرمز " + code + " - الصقه في صفحة Starlink", Toast.LENGTH_LONG).show();
    }

    /** What the local page may ask of the app - nothing else is exposed. */
    private final class Bridge {
        @JavascriptInterface
        public void save(String appPassword) {
            final String pw = appPassword == null ? "" : appPassword.replace(" ", "").trim();
            if (pw.length() < 16) {
                main.post(() -> showPage(MailInboxHtml.setupPage(email, "كلمة مرور التطبيق 16 حرفاً - انسخها كاملة")));
                return;
            }
            worker.execute(() -> {
                String error = null;
                List<MailMessage> fetched = null;
                try {
                    fetched = GmailImap.fetchRecent(email, pw, FETCH_LIMIT);
                } catch (GmailImap.BadPassword e) {
                    error = "Google رفضت الكلمة - تأكد أنها «كلمة مرور تطبيق» لهذا الإيميل نفسه";
                } catch (Exception e) {
                    error = "تعذر الاتصال بـ Gmail - تحقق من الإنترنت وحاول مرة أخرى";
                }
                final String failure = error;
                final List<MailMessage> result = fetched;
                main.post(() -> {
                    if (destroyed) return;
                    if (failure != null) {
                        showPage(MailInboxHtml.setupPage(email, failure));
                        return;
                    }
                    GmailPasswordStore.put(GmailInboxActivity.this, email, pw);
                    MailSessionStore.markSignedIn(GmailInboxActivity.this, accountId, email);
                    messages = result;
                    showPage(MailInboxHtml.inboxPage(email, messages, TimeZone.getDefault()));
                    Toast.makeText(GmailInboxActivity.this, "✅ أُضيف البريد - يفتح هنا مباشرة من الآن", Toast.LENGTH_LONG).show();
                });
            });
        }

        /** The two Google settings pages of the setup, in the phone's browser (Google requires it). */
        @JavascriptInterface
        public void openGoogle(String which) {
            String url = "apppasswords".equals(which)
                ? "https://myaccount.google.com/apppasswords"
                : "https://myaccount.google.com/signinoptions/twosv";
            main.post(() -> {
                Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(view);
                } catch (android.content.ActivityNotFoundException e) {
                    Toast.makeText(GmailInboxActivity.this, "لا يوجد متصفح لفتح إعدادات Google", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void copy(String code) {
            if (code == null || !code.matches("\\d{4,8}")) return;
            main.post(() -> GmailInboxActivity.this.copy(code));
        }
    }
}
