package com.starnet.browser.cloud.ui

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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import com.starnet.browser.cloud.CloudAccountRepository
import com.starnet.browser.cloud.net.ApiException
import com.starnet.browser.cloud.toAccountProfile
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.ui.AccountEditorDialog
import com.starnet.browser.ui.AccountListScreen
import kotlinx.coroutines.launch

/**
 * Cloud-backed counterpart to the local [com.starnet.browser.MainActivity]
 * account list flow: same list/editor UI, but accounts and their live
 * status come from the backend API instead of the on-device encrypted
 * store, and "open" launches [RemoteBrowserScreen] (a remote VNC view)
 * instead of a local WebView.
 */
@Composable
fun CloudHomeScreen(
    backendBaseUrl: String,
    repo: CloudAccountRepository,
    onOpenDevices: () -> Unit,
    onSignOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var accounts by remember { mutableStateOf<List<AccountProfile>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf("") }
    var reloadToken by remember { mutableIntStateOf(0) }
    var editorTarget by remember { mutableStateOf<AccountProfile?>(null) }
    var editorIsNew by remember { mutableStateOf(false) }
    var editorLoadError by remember { mutableStateOf("") }
    var openAccountId by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        loading = true
        errorMessage = ""
        try {
            accounts = repo.list().map { it.toAccountProfile() }
        } catch (e: ApiException) {
            errorMessage = if (e.code == 0) "تعذر الاتصال بالخادم" else e.message ?: "خطأ من الخادم"
        } catch (e: Exception) {
            errorMessage = "خطأ غير متوقع: ${e.message}"
        }
        loading = false
    }

    LaunchedEffect(reloadToken) { reload() }

    val openingAccount = accounts.firstOrNull { it.id == openAccountId }
    if (openingAccount != null) {
        RemoteBrowserScreen(
            accountId = openingAccount.id,
            accountName = openingAccount.name,
            backendBaseUrl = backendBaseUrl,
            repo = repo,
            onBack = { openAccountId = null; reloadToken++ }
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            horizontalArrangement = Arrangement.End,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
        ) {
            TextButton(onClick = onOpenDevices) { Text("الأجهزة المسجّلة") }
            TextButton(onClick = onSignOut) { Text("تسجيل الخروج") }
        }
        if (editorLoadError.isNotBlank()) {
            Text(
                editorLoadError,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)
            )
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (errorMessage.isNotBlank() && accounts.isEmpty() && !loading) {
                Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Text("تعذر تحميل الحسابات السحابية", style = MaterialTheme.typography.titleMedium)
                    Text(errorMessage, modifier = Modifier.padding(vertical = 12.dp))
                    Button(onClick = { reloadToken++ }) { Text("إعادة المحاولة") }
                }
            } else {
                AccountListScreen(
                    accounts = accounts,
                    onAdd = { editorTarget = AccountProfile(); editorIsNew = true },
                    onEdit = { summary ->
                        // `summary` only carries the list-view fields (no
                        // email/password/wifi code/notes) - fetch the full
                        // detail first so saving the editor never blanks
                        // out secrets the list view never had in the first
                        // place.
                        scope.launch {
                            editorLoadError = ""
                            val detail = runCatching { repo.get(summary.id) }
                            detail.onSuccess {
                                editorTarget = it.toAccountProfile()
                                editorIsNew = false
                            }.onFailure { e ->
                                editorLoadError = if (e is ApiException) {
                                    e.message ?: "تعذر تحميل بيانات الحساب"
                                } else {
                                    "تعذر تحميل بيانات الحساب: ${e.message}"
                                }
                            }
                        }
                    },
                    onOpen = { openAccountId = it.id }
                )
            }

            if (loading && accounts.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }

    editorTarget?.let { value ->
        AccountEditorDialog(
            initial = value,
            isNew = editorIsNew,
            onDismiss = { editorTarget = null },
            onSave = { updated ->
                editorTarget = null
                scope.launch {
                    runCatching {
                        if (editorIsNew) {
                            repo.create(
                                name = updated.name,
                                email = updated.email,
                                emailSecret = updated.emailSecret,
                                wifiCode = updated.wifiCode,
                                kitNumber = updated.kitNumber,
                                serialNumber = updated.serialNumber,
                                accountNumber = updated.accountNumber,
                                subscriptionId = updated.subscriptionId,
                                rechargeDate = updated.rechargeDate,
                                notes = updated.notes
                            )
                        } else {
                            repo.update(
                                accountId = updated.id,
                                name = updated.name,
                                email = updated.email,
                                emailSecret = updated.emailSecret,
                                wifiCode = updated.wifiCode,
                                kitNumber = updated.kitNumber,
                                serialNumber = updated.serialNumber,
                                accountNumber = updated.accountNumber,
                                subscriptionId = updated.subscriptionId,
                                rechargeDate = updated.rechargeDate,
                                notes = updated.notes
                            )
                        }
                    }
                    reloadToken++
                }
            },
            onDelete = if (editorIsNew) null else ({
                val id = value.id
                editorTarget = null
                scope.launch {
                    runCatching { repo.delete(id) }
                    reloadToken++
                }
            })
        )
    }
}
