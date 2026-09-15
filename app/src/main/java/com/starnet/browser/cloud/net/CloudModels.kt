package com.starnet.browser.cloud.net

import org.json.JSONObject

data class TokenPair(val accessToken: String, val refreshToken: String, val deviceId: String) {
    companion object {
        fun fromJson(o: JSONObject) = TokenPair(
            accessToken = o.getString("access_token"),
            refreshToken = o.getString("refresh_token"),
            deviceId = o.getString("device_id")
        )
    }
}

data class CloudDevice(
    val id: String,
    val name: String,
    val createdAt: String,
    val lastSeenAt: String,
    val isCurrent: Boolean
) {
    companion object {
        fun fromJson(o: JSONObject) = CloudDevice(
            id = o.getString("id"),
            name = o.optString("name"),
            createdAt = o.optString("created_at"),
            lastSeenAt = o.optString("last_seen_at"),
            isCurrent = o.optBoolean("is_current")
        )
    }
}

data class CloudAccountSummary(
    val id: String,
    val name: String,
    val deviceName: String,
    val kitNumber: String,
    val serialNumber: String,
    val standbyDate: String,
    val rechargeDate: String,
    val balanceDue: String,
    val currency: String,
    val dishStatus: String,
    val wifiStatus: String,
    val alertReason: String,
    val lastUpdated: String,
    val planName: String
) {
    companion object {
        fun fromJson(o: JSONObject) = CloudAccountSummary(
            id = o.getString("id"),
            name = o.optString("name"),
            deviceName = o.optString("device_name"),
            kitNumber = o.optString("kit_number"),
            serialNumber = o.optString("serial_number"),
            standbyDate = o.optString("standby_date"),
            rechargeDate = o.optString("recharge_date"),
            balanceDue = o.optString("balance_due"),
            currency = o.optString("currency", "$"),
            dishStatus = o.optString("dish_status", "UNKNOWN"),
            wifiStatus = o.optString("wifi_status", "UNKNOWN"),
            alertReason = o.optString("alert_reason"),
            lastUpdated = o.optString("last_updated"),
            planName = o.optString("plan_name")
        )
    }
}

data class CloudAccountDetail(
    val summary: CloudAccountSummary,
    val email: String,
    val emailSecret: String,
    val wifiCode: String,
    val notes: String,
    val accountNumber: String,
    val subscriptionId: String,
    val starlinkId: String,
    val serviceStatus: String,
    val serviceLocation: String,
    val billingPeriod: String,
    val paymentDueDate: String,
    val softwareVersion: String,
    val uptime: String,
    val lastSuccessfulScanAt: String?
) {
    companion object {
        fun fromJson(o: JSONObject) = CloudAccountDetail(
            summary = CloudAccountSummary.fromJson(o),
            email = o.optString("email"),
            emailSecret = o.optString("email_secret"),
            wifiCode = o.optString("wifi_code"),
            notes = o.optString("notes"),
            accountNumber = o.optString("account_number"),
            subscriptionId = o.optString("subscription_id"),
            starlinkId = o.optString("starlink_id"),
            serviceStatus = o.optString("service_status"),
            serviceLocation = o.optString("service_location"),
            billingPeriod = o.optString("billing_period"),
            paymentDueDate = o.optString("payment_due_date"),
            softwareVersion = o.optString("software_version"),
            uptime = o.optString("uptime"),
            lastSuccessfulScanAt = o.optString("last_successful_scan_at").ifBlank { null }
        )
    }
}

data class BrowserStatus(
    val status: String,
    val lastStartedAt: String?,
    val lastStoppedAt: String?,
    val lastActivityAt: String?
) {
    companion object {
        fun fromJson(o: JSONObject) = BrowserStatus(
            status = o.optString("status"),
            lastStartedAt = o.optString("last_started_at").ifBlank { null },
            lastStoppedAt = o.optString("last_stopped_at").ifBlank { null },
            lastActivityAt = o.optString("last_activity_at").ifBlank { null }
        )
    }
}
