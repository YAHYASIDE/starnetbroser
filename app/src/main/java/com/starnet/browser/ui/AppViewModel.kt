package com.starnet.browser.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.data.DeviceStatus
import com.starnet.browser.data.PageSnapshot
import com.starnet.browser.data.SecureAccountStore

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SecureAccountStore(application)

    var accounts by mutableStateOf(store.load())
        private set

    fun upsert(profile: AccountProfile) {
        accounts = if (accounts.any { it.id == profile.id }) {
            accounts.map { if (it.id == profile.id) profile else it }
        } else {
            accounts + profile
        }
        store.save(accounts)
    }

    fun remove(id: String) {
        accounts = accounts.filterNot { it.id == id }
        store.save(accounts)
    }

    fun applySnapshot(id: String, snapshot: PageSnapshot) {
        val current = accounts.firstOrNull { it.id == id } ?: return
        val updated = current.copy(
            balanceDue = snapshot.balanceDue.ifBlank { current.balanceDue },
            currency = snapshot.currency.ifBlank { current.currency },
            standbyDate = snapshot.standbyDate.ifBlank { current.standbyDate },
            kitNumber = snapshot.kitNumber.ifBlank { current.kitNumber },
            serialNumber = snapshot.serialNumber.ifBlank { current.serialNumber },
            subscriptionId = snapshot.subscriptionId.ifBlank { current.subscriptionId },
            accountNumber = snapshot.accountNumber.ifBlank { current.accountNumber },
            deviceName = snapshot.deviceName.ifBlank { current.deviceName },
            starlinkId = snapshot.starlinkId.ifBlank { current.starlinkId },
            dishStatus = snapshot.dishStatus.takeUnless { it == DeviceStatus.UNKNOWN }
                ?: current.dishStatus,
            wifiStatus = snapshot.wifiStatus.takeUnless { it == DeviceStatus.UNKNOWN }
                ?: current.wifiStatus,
            alertReason = snapshot.alertReason.ifBlank { current.alertReason },
            lastUpdated = snapshot.lastUpdated.ifBlank { current.lastUpdated },
            planName = snapshot.planName.ifBlank { current.planName },
            serviceStatus = snapshot.serviceStatus.ifBlank { current.serviceStatus },
            serviceLocation = snapshot.serviceLocation.ifBlank { current.serviceLocation },
            billingPeriod = snapshot.billingPeriod.ifBlank { current.billingPeriod },
            paymentDueDate = snapshot.paymentDueDate.ifBlank { current.paymentDueDate },
            softwareVersion = snapshot.softwareVersion.ifBlank { current.softwareVersion },
            uptime = snapshot.uptime.ifBlank { current.uptime }
        )
        upsert(updated)
    }
}
