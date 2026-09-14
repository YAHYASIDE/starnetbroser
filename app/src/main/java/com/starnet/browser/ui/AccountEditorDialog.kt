package com.starnet.browser.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.starnet.browser.data.AccountProfile

@Composable
fun AccountEditorDialog(
    initial: AccountProfile,
    isNew: Boolean,
    onDismiss: () -> Unit,
    onSave: (AccountProfile) -> Unit,
    onDelete: (() -> Unit)?
) {
    var name by remember { mutableStateOf(initial.name) }
    var rechargeDate by remember { mutableStateOf(initial.rechargeDate) }
    var email by remember { mutableStateOf(initial.email) }
    var emailSecret by remember { mutableStateOf(initial.emailSecret) }
    var wifiCode by remember { mutableStateOf(initial.wifiCode) }
    var kit by remember { mutableStateOf(initial.kitNumber) }
    var serial by remember { mutableStateOf(initial.serialNumber) }
    var subscription by remember { mutableStateOf(initial.subscriptionId) }
    var notes by remember { mutableStateOf(initial.notes) }
    var showSecret by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .padding(16.dp)
                    .heightIn(max = 700.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    if (isNew) "إضافة نافذة حساب" else "تعديل بيانات الحساب",
                    style = MaterialTheme.typography.titleLarge
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("اسم النافذة") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = rechargeDate,
                    onValueChange = { rechargeDate = it },
                    label = { Text("تاريخ الشحن أو الانتهاء") },
                    placeholder = { Text("مثال: 13 أكتوبر 2026") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("البريد الإلكتروني") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = emailSecret,
                    onValueChange = { emailSecret = it },
                    label = { Text("كلمة مرور/كود البريد") },
                    visualTransformation =
                        if (showSecret) androidx.compose.ui.text.input.VisualTransformation.None
                        else PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                TextButton(onClick = { showSecret = !showSecret }) {
                    Text(if (showSecret) "إخفاء الكود" else "إظهار الكود")
                }
                OutlinedTextField(
                    value = wifiCode,
                    onValueChange = { wifiCode = it },
                    label = { Text("كود Wi‑Fi") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = kit,
                    onValueChange = { kit = it },
                    label = { Text("رقم KIT") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = serial,
                    onValueChange = { serial = it },
                    label = { Text("الرقم التسلسلي") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = subscription,
                    onValueChange = { subscription = it },
                    label = { Text("رقم الاشتراك — محفوظ وغير ظاهر في البطاقة") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("ملاحظات") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedButton(onClick = onDismiss) { Text("إلغاء") }
                    Button(
                        enabled = name.isNotBlank(),
                        onClick = {
                            onSave(
                                initial.copy(
                                    name = name.trim(),
                                    rechargeDate = rechargeDate.trim(),
                                    email = email.trim(),
                                    emailSecret = emailSecret,
                                    wifiCode = wifiCode,
                                    kitNumber = kit.trim(),
                                    serialNumber = serial.trim(),
                                    subscriptionId = subscription.trim(),
                                    notes = notes.trim()
                                )
                            )
                        }
                    ) { Text("حفظ") }
                    if (!isNew && onDelete != null) {
                        TextButton(onClick = onDelete) { Text("حذف") }
                    }
                }
            }
        }
    }
}
