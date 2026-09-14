package com.starnet.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.data.DeviceStatus

@Composable
fun AccountListScreen(
    accounts: List<AccountProfile>,
    onAdd: () -> Unit,
    onEdit: (AccountProfile) -> Unit,
    onOpen: (AccountProfile) -> Unit
) {
    var search by remember { mutableStateOf("") }
    val reveal = remember { mutableStateMapOf<String, Boolean>() }
    val filtered = accounts.filter {
        search.isBlank() ||
            it.name.contains(search, ignoreCase = true) ||
            it.kitNumber.contains(search, ignoreCase = true) ||
            it.email.contains(search, ignoreCase = true)
    }

    Column(modifier = Modifier.background(Color(0xFFF3F7F5))) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().background(Color(0xFF07130F)).padding(16.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Text("STAR NET", color = Color.White, style = MaterialTheme.typography.headlineSmall)
                Text("متصفح الحسابات المعزولة", color = Color(0xFF9CCAB8))
            }
            Button(onClick = onAdd) { Text("+ إضافة") }
        }
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("بحث بالاسم أو KIT أو البريد") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(12.dp)
        )
        if (filtered.isEmpty()) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().padding(40.dp)
            ) {
                Text(if (accounts.isEmpty()) "لم تُضف أي نافذة بعد" else "لا توجد نتيجة")
                if (accounts.isEmpty()) {
                    Button(onClick = onAdd, modifier = Modifier.padding(top = 12.dp)) {
                        Text("إضافة أول حساب")
                    }
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                items(filtered, key = { it.id }) { account ->
                    AccountCard(
                        account = account,
                        revealed = reveal[account.id] == true,
                        onReveal = { reveal[account.id] = !(reveal[account.id] == true) },
                        onOpen = { onOpen(account) },
                        onEdit = { onEdit(account) }
                    )
                }
                item { Spacer(Modifier.size(24.dp)) }
            }
        }
    }
}

@Composable
private fun AccountCard(
    account: AccountProfile,
    revealed: Boolean,
    onReveal: () -> Unit,
    onOpen: () -> Unit,
    onEdit: () -> Unit
) {
    val amount = account.balanceDue.replace(",", "").toDoubleOrNull()
    val noBalance = amount == 0.0
    val balanceColor = when {
        account.balanceDue.isBlank() -> Color(0xFF68746F)
        noBalance -> Color(0xFF11834F)
        else -> Color(0xFFBE2F3D)
    }
    val endDate = account.standbyDate.ifBlank { account.rechargeDate }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier.padding(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(account.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                TextButton(onClick = onReveal) {
                    Text(if (revealed) "إخفاء" else "إظهار")
                }
            }
            if (endDate.isNotBlank()) {
                Text("ينتهي يوم $endDate", color = Color(0xFF7B4D00))
            }
            Text(
                when {
                    account.balanceDue.isBlank() -> "الرصيد: لم تتم قراءته"
                    noBalance -> "● لا يوجد رصيد مستحق"
                    else -> "● رصيد مستحق: ${account.currency}${account.balanceDue}"
                },
                color = balanceColor
            )
            StatusLine("STARLINK", account.dishStatus)
            StatusLine("Wi‑Fi", account.wifiStatus)
            if (account.alertReason.isNotBlank()) {
                Text("سبب التنبيه: ${account.alertReason}", color = Color(0xFFB02B3A))
            }
            if (account.lastUpdated.isNotBlank()) {
                Text("آخر تحديث: ${account.lastUpdated}", style = MaterialTheme.typography.bodySmall)
            }

            if (revealed) {
                SensitiveLine("البريد", account.email)
                SensitiveLine("كود البريد", account.emailSecret)
                SensitiveLine("كود Wi‑Fi", account.wifiCode)
                SensitiveLine("KIT", account.kitNumber)
                SensitiveLine("Serial", account.serialNumber)
                if (account.notes.isNotBlank()) SensitiveLine("ملاحظات", account.notes)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onOpen, modifier = Modifier.weight(1f)) {
                    Text("فتح الحساب")
                }
                OutlinedButton(onClick = onEdit) { Text("تعديل") }
            }
        }
    }
}

@Composable
private fun StatusLine(label: String, status: DeviceStatus) {
    val color = when (status) {
        DeviceStatus.GREEN -> Color(0xFF17A65B)
        DeviceStatus.YELLOW -> Color(0xFFF0A51A)
        DeviceStatus.RED -> Color(0xFFE53945)
        DeviceStatus.GRAY -> Color(0xFF8C9691)
        DeviceStatus.UNKNOWN -> Color(0xFFD0D5D2)
    }
    val text = when (status) {
        DeviceStatus.GREEN -> "متصل ويعمل"
        DeviceStatus.YELLOW -> "متصل مع تنبيه"
        DeviceStatus.RED -> "غير متصل أو عطل"
        DeviceStatus.GRAY -> "لا توجد بيانات حديثة"
        DeviceStatus.UNKNOWN -> "لم تتم القراءة"
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).background(color, CircleShape))
        Text("  $label: $text")
    }
}

@Composable
private fun SensitiveLine(label: String, value: String) {
    if (value.isNotBlank()) Text("$label: $value")
}
