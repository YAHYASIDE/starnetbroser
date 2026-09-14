package com.starnet.browser.browser

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
    var pageVisible by remember { mutableStateOf(false) }
    var scanMessage by remember { mutableStateOf("جاري فتح Starlink…") }
    var foundData by remember { mutableStateOf(false) }
    var scanRequested by remember { mutableStateOf(false) }
    val currentAccount by rememberUpdatedState(account)
    val currentOnSnapshot by rememberUpdatedState(onSnapshot)

    BackHandler {
        val view = webView
        if (view?.canGoBack() == true) view.goBack() else onBack()
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Color(0xFFF3F7F5))
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().background(Color(0xFF07130F)).padding(8.dp)
        ) {
            OutlinedButton(onClick = onBack) { Text("رجوع", color = Color.White) }
            Text(
                account.name,
                color = Color.White,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleSmall
            )
            OutlinedButton(onClick = {
                pageVisible = false
                scanMessage = "جاري إعادة تحميل الصفحة…"
                webView?.reload()
            }) { Text("تحديث", color = Color.White) }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 5.dp)
        ) {
            Text(
                scanMessage,
                color = if (foundData) Color(0xFF0D7B4A) else Color(0xFF6E5A20),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall
            )
            Button(onClick = {
                foundData = false
                scanRequested = true
                scanMessage = "بدأ الفحص الشامل؛ اترك النافذة مفتوحة…"
                webView?.let {
                    StarlinkPageReader.resetFullScan(it)
                    if (it.url.isNullOrBlank() || it.url == "about:blank") {
                        it.loadUrl(STARLINK_ACCOUNT_URL)
                    }
                }
            }) { Text("فحص") }
        }

        if (progress in 1..99) {
            LinearProgressIndicator(
                progress = { progress / 100f },
                modifier = Modifier.fillMaxWidth()
            )
        }

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.weight(1f).fillMaxWidth().background(Color(0xFF111111))
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        setBackgroundColor(AndroidColor.BLACK)
                        val profileName = "starnet_" + account.id.replace("-", "")
                        WebViewCompat.setProfile(this, profileName)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.setSupportMultipleWindows(false)
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
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
                                val host = request.url.host.orEmpty()
                                if (host == "starlink.com" || host.endsWith(".starlink.com")) {
                                    return false
                                }
                                runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, request.url))
                                }
                                return true
                            }

                            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                                pageVisible = false
                                progress = 1
                                scanMessage = "جاري تحميل صفحة Starlink…"
                            }

                            override fun onPageCommitVisible(view: WebView, url: String?) {
                                pageVisible = true
                                scanMessage = "تم فتح الصفحة — سجّل الدخول أو اضغط فحص"
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                pageVisible = true
                                progress = 100
                                if (!foundData) scanMessage = "الصفحة جاهزة — تتم محاولة القراءة تلقائيًا"
                            }

                            override fun onReceivedError(
                                view: WebView,
                                request: WebResourceRequest,
                                error: WebResourceError
                            ) {
                                if (request.isForMainFrame) {
                                    pageVisible = false
                                    scanMessage = "خطأ تحميل: " + error.description
                                }
                            }

                            override fun onReceivedHttpError(
                                view: WebView,
                                request: WebResourceRequest,
                                errorResponse: WebResourceResponse
                            ) {
                                if (request.isForMainFrame) {
                                    scanMessage = "رفضت الصفحة التحميل: HTTP " + errorResponse.statusCode
                                }
                            }
                        }
                        webView = this
                        loadUrl(STARLINK_ACCOUNT_URL)
                    }
                },
                update = { webView = it }
            )

            if (!pageVisible) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF19A463))
                    Text(
                        "جاري فتح Starlink…",
                        color = Color.White,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                }
            }
        }
    }

    DisposableEffect(webView) {
        val view = webView
        if (view == null) return@DisposableEffect onDispose {}
        var ticks = 0
        val poller = object : Runnable {
            override fun run() {
                if (!view.isAttachedToWindow) return
                ticks++
                val saved = currentAccount
                StarlinkPageReader.autofillLogin(
                    view,
                    saved.email,
                    saved.emailSecret
                ) { result ->
                    if (!foundData) scanMessage = result
                }
                StarlinkPageReader.read(view) { snapshot ->
                    if (StarlinkPageReader.hasData(snapshot)) {
                        foundData = true
                        scanRequested = true
                        scanMessage = "تم استخراج معلومات وحفظها"
                        currentOnSnapshot(snapshot)
                    }
                }
                if (scanRequested && ticks % 5 == 0) {
                    StarlinkPageReader.visitNextReadOnlyPage(view)
                }
                view.postDelayed(this, 3000L)
            }
        }
        view.post(poller)
        onDispose {
            view.removeCallbacks(poller)
            view.stopLoading()
            view.webChromeClient = null
            view.webViewClient = WebViewClient()
            view.destroy()
            webView = null
        }
    }
}
