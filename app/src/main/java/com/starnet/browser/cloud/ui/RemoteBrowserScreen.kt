package com.starnet.browser.cloud.ui

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.starnet.browser.cloud.CloudAccountRepository
import com.starnet.browser.cloud.net.ApiException
import kotlinx.coroutines.launch
import java.net.URLEncoder

private enum class RemotePhase { STARTING, CONNECTING, CONNECTED, ERROR }

/**
 * Shows the live cloud browser for one account. Unlike the old local
 * WebView screen, this never renders Starlink's page directly - it renders
 * the bundled noVNC client (app/src/main/assets/novnc), which streams the
 * REMOTE, server-side browser's screen over an authenticated WebSocket
 * (see app/browser/routes.py:vnc_proxy on the backend). The native chrome
 * (back/retry buttons, error panel) is drawn by Compose and stays visible
 * regardless of what happens inside the WebView - a failure there can never
 * produce a bare white screen with no way back or forward.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun RemoteBrowserScreen(
    accountId: String,
    accountName: String,
    backendBaseUrl: String,
    repo: CloudAccountRepository,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var phase by remember { mutableStateOf(RemotePhase.STARTING) }
    var errorMessage by remember { mutableStateOf("") }
    var statusMessage by remember { mutableStateOf("جاري تشغيل المتصفح السحابي…") }
    var scanning by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var retryToken by remember { mutableIntStateOf(0) }

    fun humanError(e: Throwable): String = when (e) {
        is ApiException -> when (e.code) {
            0 -> "تعذر الاتصال بالخادم — تحقق من الشبكة أو عنوان الخادم"
            503 -> "الجلسات السحابية غير مفعّلة على هذا الخادم حاليًا"
            409 -> "الحساب قيد الاستخدام في عملية أخرى الآن — حاول بعد لحظات"
            429 -> "الخادم وصل للحد الأقصى من المتصفحات المتزامنة — حاول بعد لحظات"
            401 -> "انتهت صلاحية الجلسة — سجّل الدخول من جديد"
            else -> e.message ?: "خطأ من الخادم (${e.code})"
        }
        else -> "خطأ غير متوقع: ${e.message}"
    }

    suspend fun startFlow() {
        phase = RemotePhase.STARTING
        errorMessage = ""
        statusMessage = "جاري تشغيل المتصفح السحابي…"
        try {
            repo.startBrowser(accountId)
            statusMessage = "جاري فتح الاتصال المرئي…"
            val ticket = repo.vncTicket(accountId)
            val host = backendBaseUrl
                .removePrefix("https://")
                .removePrefix("http://")
                .substringBefore("/")
            val wsPath = "accounts/$accountId/browser/vnc?ticket=" +
                URLEncoder.encode(ticket, "UTF-8")
            val assetUrl = "https://appassets.androidplatform.net/assets/novnc/vnc_lite.html" +
                "?host=" + URLEncoder.encode(host, "UTF-8") +
                "&path=" + URLEncoder.encode(wsPath, "UTF-8")
            phase = RemotePhase.CONNECTING
            webView?.loadUrl(assetUrl)

            // Navigates the remote browser to the Starlink login/account
            // page and autofills the saved email/password (never clicks
            // Sign In - the user does that themselves, watching it happen
            // live over the VNC view above). Also does a first read so
            // already-logged-in accounts show fresh data immediately
            // without the user having to press "فحص".
            runCatching { repo.scanNow(accountId) }
        } catch (e: Exception) {
            phase = RemotePhase.ERROR
            errorMessage = humanError(e)
        }
    }

    suspend fun scanNow() {
        scanning = true
        try {
            val (reachable, message) = repo.scanNow(accountId)
            statusMessage = if (reachable) message else "تعذر الفحص: $message"
        } catch (e: Exception) {
            statusMessage = "تعذر الفحص: ${humanError(e)}"
        }
        scanning = false
    }

    LaunchedEffect(retryToken) { startFlow() }

    BackHandler {
        scope.launch { runCatching { repo.stopBrowser(accountId) } }
        onBack()
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFFF3F7F5))) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().background(Color(0xFF07130F)).padding(8.dp)
        ) {
            OutlinedButton(onClick = {
                scope.launch { runCatching { repo.stopBrowser(accountId) } }
                onBack()
            }) { Text("رجوع", color = Color.White) }
            Text(
                accountName,
                color = Color.White,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleSmall
            )
            OutlinedButton(
                onClick = { scope.launch { scanNow() } },
                enabled = !scanning && phase == RemotePhase.CONNECTED
            ) { Text(if (scanning) "جاري الفحص…" else "فحص", color = Color.White) }
            OutlinedButton(onClick = { retryToken++ }) { Text("إعادة الاتصال", color = Color.White) }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
            Text(statusMessage, style = MaterialTheme.typography.bodySmall, color = Color(0xFF6E5A20))
        }

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.weight(1f).fillMaxWidth().background(Color(0xFF111111))
        ) {
            if (phase == RemotePhase.ERROR) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                    Text("تعذر فتح المتصفح السحابي", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Text(errorMessage, color = Color(0xFFE0B0B0), modifier = Modifier.padding(vertical = 12.dp))
                    Button(onClick = { retryToken++ }) { Text("إعادة المحاولة") }
                }
            } else {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        val assetLoader = WebViewAssetLoader.Builder()
                            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx))
                            .build()
                        WebView(ctx).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            webViewClient = object : WebViewClientCompat() {
                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest
                                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                                override fun onPageFinished(view: WebView, url: String?) {
                                    // The page has loaded and handed off to noVNC's own
                                    // connection UI, which shows its own status text
                                    // inside the page; we stop showing our own spinner.
                                    phase = RemotePhase.CONNECTED
                                    statusMessage = "متصل — يمكنك التحكم في المتصفح مباشرة"
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    error: WebResourceErrorCompat
                                ) {
                                    if (request.isForMainFrame) {
                                        phase = RemotePhase.ERROR
                                        errorMessage = "خطأ تحميل: ${error.description}"
                                    }
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    errorCode: Int,
                                    description: String?,
                                    failingUrl: String?
                                ) {
                                    phase = RemotePhase.ERROR
                                    errorMessage = "خطأ تحميل: ${description ?: errorCode}"
                                }
                            }
                            webView = this
                        }
                    },
                    update = { webView = it }
                )
            }

            if (phase == RemotePhase.STARTING || phase == RemotePhase.CONNECTING) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF19A463))
                    Text(statusMessage, color = Color.White, modifier = Modifier.padding(top = 12.dp))
                }
            }
        }
    }
}
