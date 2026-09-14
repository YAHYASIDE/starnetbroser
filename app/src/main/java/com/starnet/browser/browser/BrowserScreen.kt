package com.starnet.browser.browser

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.util.Log
import android.webkit.RenderProcessGoneDetail
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
import androidx.compose.runtime.key
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
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.data.PageSnapshot

private const val TAG = "StarNetBrowser"
private const val STARLINK_ACCOUNT_URL = "https://www.starlink.com/account/home"

// While the multi-page read-only crawl is actively running, poll fairly
// often; once it is done (or there is nothing left to look at) back off to
// a slow idle tick that just keeps live status (dish/Wi‑Fi dots) fresh.
// A hard tick cap guarantees the loop can never run forever even if a page
// keeps the WebView open indefinitely.
private const val SCAN_INTERVAL_ACTIVE_MS = 2500L
private const val SCAN_INTERVAL_IDLE_MS = 6000L
private const val MAX_TICKS = 300

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
    // Real, user-visible failure (profile/session setup, renderer crash, load
    // error). The Android chrome above (back/refresh/scan) must stay visible
    // even when this is set - only the WebView area is replaced.
    var fatalError by remember { mutableStateOf<String?>(null) }
    // Bumping this forces AndroidView's factory to run again, i.e. it
    // recreates the WebView from scratch - used by the "إعادة المحاولة" button.
    var retryToken by remember { mutableIntStateOf(0) }
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
                fatalError = null
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
            val error = fatalError
            if (error != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                    Text("تعذر عرض صفحة Starlink", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Text(
                        error,
                        color = Color(0xFFE0B0B0),
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                    Button(onClick = {
                        fatalError = null
                        pageVisible = false
                        scanMessage = "جاري إعادة المحاولة…"
                        retryToken++
                    }) { Text("إعادة المحاولة") }
                }
            } else {
                key(retryToken) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            // Reset first so a failed retry never leaves this state
                            // pointing at a stale WebView instance that Compose has
                            // already torn down underneath us.
                            webView = null
                            val view = WebView(context)
                            // setProfile() requires the named profile to already exist
                            // and must run before anything else touches the WebView
                            // (settings, background color, cookies, load). Skipping
                            // getOrCreateProfile() throws here, which - uncaught - was
                            // silently tearing down this whole composable and leaving a
                            // blank/white screen behind with no error shown, matching
                            // the reported bug. If it still fails for any reason, we
                            // must NOT wire up or load this WebView: doing so could
                            // silently fall back to a shared/default profile, breaking
                            // session isolation between accounts.
                            val profileReady = runCatching {
                                val profileName = "starnet_" + account.id.replace("-", "")
                                ProfileStore.getInstance().getOrCreateProfile(profileName)
                                WebViewCompat.setProfile(view, profileName)
                            }.onFailure { err ->
                                Log.e(TAG, "setProfile failed for ${account.id}", err)
                                fatalError = "تعذر إنشاء ملف تصفح منفصل لهذا الحساب: ${err.message}"
                            }.isSuccess

                            if (!profileReady) return@AndroidView view

                            view.apply {
                                setBackgroundColor(AndroidColor.BLACK)
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                settings.javaScriptCanOpenWindowsAutomatically = false
                                settings.setSupportMultipleWindows(false)
                                settings.cacheMode = WebSettings.LOAD_DEFAULT

                                // Third-party cookie policy for THIS profile's own cookie
                                // jar - NOT the global CookieManager.getInstance() singleton,
                                // which belongs to the default profile and would not
                                // actually affect (and could confuse) this isolated profile.
                                runCatching {
                                    WebViewCompat.getProfile(this).cookieManager
                                        .setAcceptThirdPartyCookies(this, true)
                                }.onFailure { Log.w(TAG, "per-profile cookie manager unavailable", it) }

                                webChromeClient = object : WebChromeClient() {
                                    override fun onProgressChanged(wv: WebView?, newProgress: Int) {
                                        progress = newProgress
                                    }
                                }
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        wv: WebView,
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

                                    override fun onPageStarted(
                                        wv: WebView,
                                        url: String?,
                                        favicon: android.graphics.Bitmap?
                                    ) {
                                        Log.d(TAG, "onPageStarted: $url")
                                        pageVisible = false
                                        progress = 1
                                        scanMessage = "جاري تحميل صفحة Starlink…"
                                    }

                                    override fun onPageCommitVisible(wv: WebView, url: String?) {
                                        pageVisible = true
                                        scanMessage = "تم فتح الصفحة — سجّل الدخول أو اضغط فحص"
                                    }

                                    override fun onPageFinished(wv: WebView, url: String?) {
                                        Log.d(TAG, "onPageFinished: $url")
                                        pageVisible = true
                                        progress = 100
                                        if (!foundData) scanMessage = "الصفحة جاهزة — تتم محاولة القراءة تلقائيًا"
                                    }

                                    override fun onReceivedError(
                                        wv: WebView,
                                        request: WebResourceRequest,
                                        error: WebResourceError
                                    ) {
                                        Log.w(TAG, "onReceivedError: ${error.errorCode} ${error.description}")
                                        if (request.isForMainFrame) {
                                            pageVisible = false
                                            scanMessage = "خطأ تحميل: " + error.description
                                        }
                                    }

                                    override fun onReceivedHttpError(
                                        wv: WebView,
                                        request: WebResourceRequest,
                                        errorResponse: WebResourceResponse
                                    ) {
                                        Log.w(TAG, "onReceivedHttpError: ${errorResponse.statusCode}")
                                        if (request.isForMainFrame) {
                                            scanMessage = "رفضت الصفحة التحميل: HTTP " + errorResponse.statusCode
                                        }
                                    }

                                    override fun onRenderProcessGone(
                                        wv: WebView,
                                        detail: RenderProcessGoneDetail
                                    ): Boolean {
                                        // The Chromium renderer process died (commonly OOM,
                                        // which is realistic here since several accounts can
                                        // each hold their own WebView/profile at once). If we
                                        // don't handle this, Android leaves the WebView's
                                        // surface attached but blank - a persistent white
                                        // screen with no crash and no error, exactly the
                                        // reported symptom. We must not touch `webView` after
                                        // this (it's already gone); just destroy it and show a
                                        // real, retryable error.
                                        Log.e(
                                            TAG,
                                            "onRenderProcessGone: crashed=${detail.didCrash()} " +
                                                "priority=${detail.rendererPriorityAtExit()}"
                                        )
                                        pageVisible = false
                                        fatalError = if (detail.didCrash()) {
                                            "توقف عارض الصفحة بشكل غير متوقع (قد يكون بسبب ضغط الذاكرة)"
                                        } else {
                                            "تم إنهاء عارض الصفحة بواسطة النظام لتحرير الذاكرة"
                                        }
                                        runCatching { wv.destroy() }
                                        // Clear the outer WebView state so the polling
                                        // DisposableEffect (keyed on it) tears itself down
                                        // instead of continuing to call evaluateJavascript
                                        // on a destroyed WebView.
                                        webView = null
                                        return true
                                    }
                                }
                                loadUrl(STARLINK_ACCOUNT_URL)
                            }
                            webView = view
                            view
                        },
                        update = { webView = it },
                        onRelease = { released ->
                            // Guaranteed to run whenever this WebView instance leaves
                            // composition - both on retry (key(retryToken) recreates
                            // the AndroidView) and on navigating away. This is the one
                            // place we can be sure destroy() always actually runs, so
                            // the DisposableEffect below only needs to stop the poller.
                            runCatching {
                                released.stopLoading()
                                released.webChromeClient = null
                                released.webViewClient = WebViewClient()
                                released.destroy()
                            }
                        }
                    )
                }
            }

            if (fatalError == null && !pageVisible) {
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

        var stopped = false
        var ticks = 0
        var loginPending = true
        var pagesScanned = 0

        val poller = object : Runnable {
            override fun run() {
                if (stopped || !view.isAttachedToWindow) return
                ticks++
                if (ticks > MAX_TICKS) {
                    if (!foundData) {
                        scanMessage = "انتهت مهلة الفحص التلقائي — اضغط تحديث أو فحص لإعادة المحاولة"
                    }
                    return
                }

                fun scheduleNext(activeCrawl: Boolean) {
                    if (stopped) return
                    val delay = if (activeCrawl) SCAN_INTERVAL_ACTIVE_MS else SCAN_INTERVAL_IDLE_MS
                    view.postDelayed(this, delay)
                }

                fun afterAutofill() {
                    StarlinkPageReader.read(view) { snapshot ->
                        if (StarlinkPageReader.hasData(snapshot)) {
                            foundData = true
                            loginPending = false
                            currentOnSnapshot(snapshot)
                            scanMessage = if (scanRequested) {
                                "تم استخراج معلومات وحفظها — جاري فحص صفحات إضافية ($pagesScanned)"
                            } else {
                                "تم استخراج معلومات وحفظها"
                            }
                        }
                        if (scanRequested) {
                            StarlinkPageReader.visitNextReadOnlyPage(view) { state ->
                                when {
                                    state == "DONE" -> {
                                        scanRequested = false
                                        scanMessage = if (foundData) {
                                            "اكتمل الفحص — تم فحص $pagesScanned صفحة إضافية"
                                        } else {
                                            "اكتمل الفحص ولم يُعثر على معلومات في الصفحات الآمنة"
                                        }
                                    }
                                    state == "LOGIN" -> {
                                        loginPending = true
                                    }
                                    state.startsWith("VISIT:") -> {
                                        pagesScanned++
                                    }
                                }
                                scheduleNext(activeCrawl = scanRequested)
                            }
                        } else {
                            scheduleNext(activeCrawl = false)
                        }
                    }
                }

                if (loginPending) {
                    val saved = currentAccount
                    StarlinkPageReader.autofillLogin(view, saved.email, saved.emailSecret) { result ->
                        if (!foundData) scanMessage = result
                        afterAutofill()
                    }
                } else {
                    afterAutofill()
                }
            }
        }
        view.post(poller)
        onDispose {
            // Actual WebView teardown (stopLoading/destroy) happens in
            // AndroidView's onRelease, which is guaranteed to fire whenever
            // this instance leaves composition - here we only need to stop
            // this instance's polling loop so it can't fire once, after
            // release, into a destroyed WebView.
            stopped = true
            view.removeCallbacks(poller)
        }
    }
}
