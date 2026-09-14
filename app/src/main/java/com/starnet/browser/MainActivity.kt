package com.starnet.browser

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.starnet.browser.browser.BrowserScreen
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.ui.AccountEditorDialog
import com.starnet.browser.ui.AccountListScreen
import com.starnet.browser.ui.AppViewModel
import com.starnet.browser.ui.theme.StarNetTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            StarNetTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
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
                            onOpen = { openId = it.id }
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
            }
        }
    }
}
