package com.starnet.browser.browser

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.data.PageSnapshot

private const val STARLINK_ACCOUNT_URL = "https://www.starlink.com/account/home"

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun BrowserScreen(
    account: AccountProfile,
    onBack: () -> Unit,
    onSnapshot: (PageSnapshot) -> Unit
) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
        Surface(Modifier.fillMaxSize()) {
            Column(
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(24.dp)
            ) {
                Text("يلزم تحديث Chrome أو Android System WebView", style = MaterialTheme.typography.titleLarge)
                Text(
                    "هذا الهاتف لا يدعم ملفات WebView المنفصلة حاليًا. لن يفتح التطبيق الحسابات بملف مشترك حفاظًا على فصل الجلسات.",
                    modifier = Modifier.padding(vertical = 16.dp)
                )
                Button(onClick = onBack) { Text("رجوع") }
            }
        }
        return
    }

    var webView by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableIntStateOf(0) }
    var scanInitialized by remember { mutableStateOf(false) }
    val handler = remember { Handler(Looper.getMainLooper()) }

    fun inspectPage(view: WebView) {
        listOf(350L, 1100L, 2600L).forEach { delay ->
            handler.postDelayed({
                if (view.isAttachedToWindow) {
                    StarlinkPageReader.autofillLogin(view, account.email, account.emailSecret)
                    StarlinkPageReader.read(view, onSnapshot)
                }
            }, delay)
        }
        handler.postDelayed({
            if (view.isAttachedToWindow) {
                StarlinkPageReader.visitNextReadOnlyPage(view)
            }
        }, 3400L)
    }

    BackHandler {
        val view = webView
        if (view?.canGoBack() == true) view.goBack() else onBack()
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().padding(8.dp)
        ) {
            OutlinedButton(onClick = onBack) { Text("رجوع") }
            Text(
                account.name,
                modifier = Modifier.weight(1f).padding(top = 12.dp),
                style = MaterialTheme.typography.titleSmall
            )
            Button(onClick = {
                webView?.let {
                    StarlinkPageReader.resetFullScan(it)
                    it.loadUrl(STARLINK_ACCOUNT_URL)
                }
            }) { Text("فحص شامل") }
        }
        Text(
            "بعد تسجيل الدخول انتظر قليلًا؛ سيجمع التطبيق معلومات صفحات العرض تلقائيًا.",
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 3.dp),
            style = MaterialTheme.typography.bodySmall
        )
        if (progress in 1..99) {
            LinearProgressIndicator(
                progress = { progress / 100f },
                modifier = Modifier.fillMaxWidth()
            )
        }

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    val profileName = "starnet_" + account.id.replace("-", "")
                    WebViewCompat.setProfile(this, profileName)

                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            progress = newProgress
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest
                        ): Boolean {
                            val uri = request.url
                            val host = uri.host.orEmpty()
                            if (host == "starlink.com" || host.endsWith(".starlink.com")) {
                                return false
                            }
                            runCatching {
                                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                            }
                            return true
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                            progress = 1
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            if (!scanInitialized) {
                                StarlinkPageReader.resetFullScan(view)
                                scanInitialized = true
                            }
                            inspectPage(view)
                        }
                    }
                    webView = this
                    loadUrl(STARLINK_ACCOUNT_URL)
                }
            },
            update = { webView = it }
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            handler.removeCallbacksAndMessages(null)
            webView?.apply {
                stopLoading()
                webChromeClient = null
                webViewClient = WebViewClient()
                destroy()
            }
            webView = null
        }
    }
}
