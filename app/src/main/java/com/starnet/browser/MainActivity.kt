package com.starnet.browser

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.starnet.browser.browser.BrowserScreen
import com.starnet.browser.cloud.CloudAccountRepository
import com.starnet.browser.cloud.CloudAuthRepository
import com.starnet.browser.cloud.net.ApiClient
import com.starnet.browser.cloud.net.TokenStore
import com.starnet.browser.cloud.ui.CloudDevicesScreen
import com.starnet.browser.cloud.ui.CloudHomeScreen
import com.starnet.browser.cloud.ui.CloudLoginScreen
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.ui.AccountEditorDialog
import com.starnet.browser.ui.AccountListScreen
import com.starnet.browser.ui.AppViewModel
import com.starnet.browser.ui.theme.StarNetTheme

private enum class AppMode { LOCAL, CLOUD_LOGIN, CLOUD_HOME, CLOUD_DEVICES }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            StarNetTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    val context = LocalContext.current
                    val tokenStore = remember { TokenStore(context) }
                    val apiClient = remember { ApiClient(tokenStore) }
                    val authRepo = remember { CloudAuthRepository(tokenStore, apiClient) }
                    val accountRepo = remember { CloudAccountRepository(apiClient) }

                    var mode by remember {
                        mutableStateOf(if (tokenStore.isLoggedIn) AppMode.CLOUD_HOME else AppMode.LOCAL)
                    }

                    when (mode) {
                        AppMode.LOCAL -> LocalModeContent(onOpenCloudMode = {
                            mode = if (tokenStore.isLoggedIn) AppMode.CLOUD_HOME else AppMode.CLOUD_LOGIN
                        })
                        AppMode.CLOUD_LOGIN -> CloudLoginScreen(
                            tokenStore = tokenStore,
                            authRepo = authRepo,
                            onLoggedIn = { mode = AppMode.CLOUD_HOME }
                        )
                        AppMode.CLOUD_HOME -> CloudHomeScreen(
                            backendBaseUrl = tokenStore.backendBaseUrl,
                            repo = accountRepo,
                            onOpenDevices = { mode = AppMode.CLOUD_DEVICES },
                            onSignOut = {
                                authRepo.signOutThisDevice()
                                mode = AppMode.LOCAL
                            }
                        )
                        AppMode.CLOUD_DEVICES -> CloudDevicesScreen(
                            authRepo = authRepo,
                            onBack = { mode = AppMode.CLOUD_HOME },
                            onSignedOutEverywhere = { mode = AppMode.LOCAL }
                        )
                    }
                }
            }
        }
    }
}

/** The original, unchanged local-WebView flow - still the default on first
 * launch and whenever no cloud account is signed in. */
@Composable
private fun LocalModeContent(onOpenCloudMode: () -> Unit) {
    val model: AppViewModel = viewModel()
    var openId by remember { mutableStateOf<String?>(null) }
    var editor by remember { mutableStateOf<AccountProfile?>(null) }
    var editorIsNew by remember { mutableStateOf(false) }

    val openAccount = model.accounts.firstOrNull { it.id == openId }
    if (openAccount != null) {
        BrowserScreen(
            account = openAccount,
            onBack = { openId = null },
            onSnapshot = { model.applySnapshot(openAccount.id, it) }
        )
    } else {
        AccountListScreen(
            accounts = model.accounts,
            onAdd = {
                editor = AccountProfile()
                editorIsNew = true
            },
            onEdit = {
                editor = it
                editorIsNew = false
            },
            onOpen = { openId = it.id },
            onOpenCloudMode = onOpenCloudMode
        )
    }

    editor?.let { value ->
        AccountEditorDialog(
            initial = value,
            isNew = editorIsNew,
            onDismiss = { editor = null },
            onSave = {
                model.upsert(it)
                editor = null
            },
            onDelete = if (editorIsNew) null else ({
                model.remove(value.id)
                editor = null
            })
        )
    }
}
