package com.starnet.browser.cloud.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.starnet.browser.cloud.CloudAuthRepository
import com.starnet.browser.cloud.net.CloudDevice
import kotlinx.coroutines.launch

/**
 * Lets the operator see every phone signed into their STAR NET management
 * account and revoke a lost one immediately, or sign out everywhere.
 * Revoking a device here NEVER deletes or signs out of any Starlink cloud
 * browser session - only that phone's access to this management account.
 */
@Composable
fun CloudDevicesScreen(
    authRepo: CloudAuthRepository,
    onBack: () -> Unit,
    onSignedOutEverywhere: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var devices by remember { mutableStateOf<List<CloudDevice>>(emptyList()) }
    var reloadToken by remember { mutableIntStateOf(0) }
    var confirmLogoutAll by remember { mutableStateOf(false) }

    LaunchedEffect(reloadToken) {
        devices = runCatching { authRepo.listDevices() }.getOrDefault(emptyList())
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onBack) { Text("رجوع") }
        }
        Text("الأجهزة المسجّلة", style = MaterialTheme.typography.headlineSmall)
        Text(
            "إلغاء وصول جهاز لا يمس أي جلسة Starlink سحابية - فقط وصول ذلك الجهاز لهذا الحساب الإداري.",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
            items(devices, key = { it.id }) { device ->
                Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(device.name + if (device.isCurrent) " (هذا الجهاز)" else "")
                            Text("آخر ظهور: ${device.lastSeenAt}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (!device.isCurrent) {
                            OutlinedButton(onClick = {
                                scope.launch {
                                    runCatching { authRepo.revokeDevice(device.id) }
                                    reloadToken++
                                }
                            }) { Text("إلغاء الوصول") }
                        }
                    }
                }
            }
        }

        if (confirmLogoutAll) {
            Column(modifier = Modifier.padding(top = 8.dp)) {
                Text("سيتم تسجيل الخروج من جميع الأجهزة بما فيها هذا الجهاز. تأكيد؟")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                    Button(onClick = {
                        scope.launch {
                            runCatching { authRepo.logoutAllDevices() }
                            onSignedOutEverywhere()
                        }
                    }) { Text("تأكيد تسجيل الخروج من الكل") }
                    TextButton(onClick = { confirmLogoutAll = false }) { Text("إلغاء") }
                }
            }
        } else {
            OutlinedButton(onClick = { confirmLogoutAll = true }, modifier = Modifier.fillMaxWidth()) {
                Text("تسجيل الخروج من جميع الأجهزة")
            }
        }
    }
}
