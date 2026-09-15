package com.starnet.browser.cloud.ui

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.starnet.browser.cloud.CloudAuthRepository
import com.starnet.browser.cloud.TotpRequiredException
import com.starnet.browser.cloud.net.ApiException
import com.starnet.browser.cloud.net.TokenStore
import kotlinx.coroutines.launch

/**
 * Entry point for the cloud flow: pick the backend server, then
 * register/log in. Signing in here only ever creates a STAR NET management
 * session for THIS device - it never touches any Starlink account's
 * browser session (those are opened per-account afterwards, in
 * [CloudHomeScreen]).
 */
@Composable
fun CloudLoginScreen(
    tokenStore: TokenStore,
    authRepo: CloudAuthRepository,
    onLoggedIn: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var backendUrl by remember { mutableStateOf(tokenStore.backendBaseUrl) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }
    var needsTotp by remember { mutableStateOf(false) }
    var isRegisterMode by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }

    fun submit() {
        val trimmedUrl = backendUrl.trim().trimEnd('/')
        if (trimmedUrl.isBlank()) {
            errorMessage = "أدخل عنوان الخادم السحابي أولًا"
            return
        }
        tokenStore.backendBaseUrl = trimmedUrl
        errorMessage = ""
        busy = true
        scope.launch {
            try {
                if (isRegisterMode) {
                    authRepo.register(email.trim(), password, deviceName())
                    onLoggedIn()
                } else {
                    authRepo.login(email.trim(), password, totpCode.ifBlank { null }, deviceName())
                    onLoggedIn()
                }
            } catch (_: TotpRequiredException) {
                needsTotp = true
                errorMessage = "أدخل رمز التحقق بخطوتين"
            } catch (e: ApiException) {
                errorMessage = when (e.code) {
                    0 -> "تعذر الاتصال بالخادم: ${e.message}"
                    401 -> "بيانات الدخول غير صحيحة"
                    409 -> "هذا البريد مسجّل مسبقًا"
                    429 -> "محاولات كثيرة جدًا — حاول لاحقًا"
                    else -> e.message ?: "خطأ من الخادم"
                }
            } catch (e: Exception) {
                errorMessage = "خطأ غير متوقع: ${e.message}"
            } finally {
                busy = false
            }
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)
    ) {
        Text("الدخول إلى STAR NET السحابي", style = MaterialTheme.typography.headlineSmall)
        Text(
            "هذا حساب إدارة التطبيق فقط - لا علاقة له بحسابات Starlink نفسها.",
            style = MaterialTheme.typography.bodySmall
        )

        OutlinedTextField(
            value = backendUrl,
            onValueChange = { backendUrl = it },
            label = { Text("عنوان الخادم (https://...)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("البريد الإلكتروني") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("كلمة المرور") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        if (needsTotp) {
            OutlinedTextField(
                value = totpCode,
                onValueChange = { totpCode = it },
                label = { Text("رمز التحقق بخطوتين") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        if (errorMessage.isNotBlank()) {
            Text(errorMessage, color = MaterialTheme.colorScheme.error)
        }

        Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
            Text(if (busy) "جاري المعالجة…" else if (isRegisterMode) "إنشاء حساب" else "دخول")
        }
        TextButton(onClick = { isRegisterMode = !isRegisterMode; errorMessage = "" }) {
            Text(if (isRegisterMode) "لديك حساب؟ دخول" else "حساب جديد؟ إنشاء حساب إدارة")
        }
    }
}

private fun deviceName(): String {
    val model = Build.MODEL ?: "Android"
    val manufacturer = Build.MANUFACTURER ?: ""
    val label = if (manufacturer.isNotBlank() && !model.startsWith(manufacturer, ignoreCase = true)) {
        "$manufacturer $model"
    } else {
        model
    }
    return label.ifBlank { "جهاز Android" }
}
