package com.starnet.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
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
    var selected by remember { mutableStateOf<AccountProfile?>(null) }
    val filtered = accounts.filter {
        search.isBlank() ||
            it.name.contains(search, true) ||
            it.deviceName.contains(search, true) ||
            it.kitNumber.contains(search, true) ||
            it.serialNumber.contains(search, true) ||
            it.email.contains(search, true)
    }
    val groups = filtered.groupBy { expiryDay(it.standbyDate.ifBlank { it.rechargeDate }) }
        .toSortedMap(compareBy { it ?: 99 })

    Column(modifier = Modifier.background(Color(0xFFF3F7F5))) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().background(Color(0xFF07130F)).padding(16.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Text("STAR NET", color = Color.White, style = MaterialTheme.typography.headlineSmall)
                Text("الحسابات مرتبة حسب يوم الانتهاء", color = Color(0xFF9CCAB8))
            }
            Button(onClick = onAdd) { Text("+ إضافة") }
        }
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("بحث بالاسم أو KIT أو Serial أو البريد") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(12.dp)
        )

        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(12.dp)
        ) {
            if (filtered.isEmpty()) {
                Text(
                    if (accounts.isEmpty()) "لم تُضف أي حساب بعد" else "لا توجد نتيجة",
                    modifier = Modifier.fillMaxWidth().padding(30.dp),
                    textAlign = TextAlign.Center
                )
            }
            groups.forEach { (day, dayAccounts) ->
                Text(
                    if (day == null) "بدون يوم محدد" else "يوم $day",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color(0xFF174D39),
                    modifier = Modifier.padding(top = 6.dp)
                )
                dayAccounts.chunked(4).forEach { rowAccounts ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        rowAccounts.forEach { account ->
                            AccountCircle(
                                account = account,
                                day = day,
                                onClick = { selected = account },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        repeat(4 - rowAccounts.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }

    selected?.let { account ->
        AccountDetailsDialog(
            account = account,
            onDismiss = { selected = null },
            onOpen = {
                selected = null
                onOpen(account)
            },
            onEdit = {
                selected = null
                onEdit(account)
            }
        )
    }
}

@Composable
private fun AccountCircle(
    account: AccountProfile,
    day: Int?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val ring = overallColor(account)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 4.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(66.dp)
                .clip(CircleShape)
                .background(Color.White)
                .border(4.dp, ring, CircleShape)
        ) {
            Text(
                day?.toString() ?: "—",
                style = MaterialTheme.typography.headlineSmall,
                color = Color(0xFF123F30)
            )
        }
        Text(
            account.deviceName.ifBlank { account.name },
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(top = 3.dp)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            StatusDot(account.dishStatus)
            StatusDot(account.wifiStatus)
        }
    }
}

@Composable
private fun AccountDetailsDialog(
    account: AccountProfile,
    onDismiss: () -> Unit,
    onOpen: () -> Unit,
    onEdit: () -> Unit
) {
    var showSecrets by remember { mutableStateOf(false) }
    val amount = account.balanceDue.replace(",", "").toDoubleOrNull()
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(
                verticalArrangement = Arrangement.spacedBy(7.dp),
                modifier = Modifier.padding(16.dp).verticalScroll(rememberScrollState())
            ) {
                Text(account.name, style = MaterialTheme.typography.titleLarge)
                Line("اسم الجهاز", account.deviceName)
                Line("تاريخ الانتهاء", account.standbyDate.ifBlank { account.rechargeDate })
                Line("الخطة", account.planName)
                Line("حالة الخدمة", account.serviceStatus)
                Text(
                    when {
                        account.balanceDue.isBlank() -> "الرصيد: لم تتم قراءته"
                        amount == 0.0 -> "لا يوجد رصيد مستحق"
                        else -> "الرصيد المستحق: ${account.currency}${account.balanceDue}"
                    },
                    color = if (amount == 0.0) Color(0xFF11834F) else Color(0xFFB02B3A)
                )
                StatusRow("STARLINK", account.dishStatus)
                StatusRow("Wi‑Fi", account.wifiStatus)
                Line("سبب التنبيه", account.alertReason)
                Line("آخر تحديث", account.lastUpdated)
                Line("KIT", account.kitNumber)
                Line("Serial", account.serialNumber)
                Line("معرف Starlink", account.starlinkId)
                Line("رقم الحساب", account.accountNumber)
                Line("رقم الاشتراك", account.subscriptionId)
                Line("دورة الفوترة", account.billingPeriod)
                Line("استحقاق الدفع", account.paymentDueDate)
                Line("موقع الخدمة", account.serviceLocation)
                Line("إصدار البرنامج", account.softwareVersion)
                Line("مدة التشغيل", account.uptime)

                TextButton(onClick = { showSecrets = !showSecrets }) {
                    Text(if (showSecrets) "إخفاء بيانات الدخول" else "إظهار بيانات الدخول")
                }
                if (showSecrets) {
                    Line("البريد", account.email)
                    Line("كلمة المرور", account.emailSecret)
                    Line("كود Wi‑Fi", account.wifiCode)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Button(onClick = onOpen, modifier = Modifier.weight(1f)) {
                        Text("فتح وفحص")
                    }
                    OutlinedButton(onClick = onEdit) { Text("تعديل") }
                    TextButton(onClick = onDismiss) { Text("إغلاق") }
                }
            }
        }
    }
}

private fun expiryDay(value: String): Int? {
    val text = value.trim()
    Regex("""^d{4}[-/]d{1,2}[-/](d{1,2})""").find(text)
        ?.groupValues?.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..31 }?.let { return it }
    Regex("""^d{1,2}[-/](d{1,2})[-/]d{4}""").find(text)
        ?.groupValues?.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..31 }?.let { return it }
    Regex("""([12]?d|3[01])""").findAll(text).mapNotNull {
        it.groupValues[1].toIntOrNull()
    }.lastOrNull()?.takeIf { it in 1..31 }?.let { return it }
    return null
}

private fun overallColor(account: AccountProfile): Color = when {
    account.dishStatus == DeviceStatus.RED || account.wifiStatus == DeviceStatus.RED ->
        Color(0xFFE53945)
    account.dishStatus == DeviceStatus.YELLOW || account.wifiStatus == DeviceStatus.YELLOW ->
        Color(0xFFF0A51A)
    account.dishStatus == DeviceStatus.GREEN && account.wifiStatus == DeviceStatus.GREEN ->
        Color(0xFF17A65B)
    account.dishStatus == DeviceStatus.GRAY || account.wifiStatus == DeviceStatus.GRAY ->
        Color(0xFF8C9691)
    else -> Color(0xFFD0D5D2)
}

@Composable
private fun StatusDot(status: DeviceStatus) {
    val color = when (status) {
        DeviceStatus.GREEN -> Color(0xFF17A65B)
        DeviceStatus.YELLOW -> Color(0xFFF0A51A)
        DeviceStatus.RED -> Color(0xFFE53945)
        DeviceStatus.GRAY -> Color(0xFF8C9691)
        DeviceStatus.UNKNOWN -> Color(0xFFD0D5D2)
    }
    Box(Modifier.size(9.dp).background(color, CircleShape))
}

@Composable
private fun StatusRow(label: String, status: DeviceStatus) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        StatusDot(status)
        Text("  $label: " + when (status) {
            DeviceStatus.GREEN -> "متصل ويعمل"
            DeviceStatus.YELLOW -> "متصل مع تنبيه"
            DeviceStatus.RED -> "غير متصل أو عطل"
            DeviceStatus.GRAY -> "لا توجد بيانات حديثة"
            DeviceStatus.UNKNOWN -> "لم تتم القراءة"
        })
    }
}

@Composable
private fun Line(label: String, value: String) {
    if (value.isNotBlank()) Text("$label: $value")
}
