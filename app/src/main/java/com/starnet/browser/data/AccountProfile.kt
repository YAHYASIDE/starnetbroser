package com.starnet.browser.data

import org.json.JSONObject
import java.util.UUID

enum class DeviceStatus {
    UNKNOWN, GREEN, YELLOW, RED, GRAY;

    companion object {
        fun from(value: String?): DeviceStatus =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: UNKNOWN
    }
}

data class AccountProfile(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val email: String = "",
    val emailSecret: String = "",
    val wifiCode: String = "",
    val kitNumber: String = "",
    val serialNumber: String = "",
    val subscriptionId: String = "",
    val rechargeDate: String = "",
    val standbyDate: String = "",
    val balanceDue: String = "",
    val currency: String = "$",
    val dishStatus: DeviceStatus = DeviceStatus.UNKNOWN,
    val wifiStatus: DeviceStatus = DeviceStatus.UNKNOWN,
    val alertReason: String = "",
    val lastUpdated: String = "",
    val notes: String = ""
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("email", email)
        put("emailSecret", emailSecret)
        put("wifiCode", wifiCode)
        put("kitNumber", kitNumber)
        put("serialNumber", serialNumber)
        put("subscriptionId", subscriptionId)
        put("rechargeDate", rechargeDate)
        put("standbyDate", standbyDate)
        put("balanceDue", balanceDue)
        put("currency", currency)
        put("dishStatus", dishStatus.name)
        put("wifiStatus", wifiStatus.name)
        put("alertReason", alertReason)
        put("lastUpdated", lastUpdated)
        put("notes", notes)
    }

    companion object {
        fun fromJson(o: JSONObject) = AccountProfile(
            id = o.optString("id").ifBlank { UUID.randomUUID().toString() },
            name = o.optString("name"),
            email = o.optString("email"),
            emailSecret = o.optString("emailSecret"),
            wifiCode = o.optString("wifiCode"),
            kitNumber = o.optString("kitNumber"),
            serialNumber = o.optString("serialNumber"),
            subscriptionId = o.optString("subscriptionId"),
            rechargeDate = o.optString("rechargeDate"),
            standbyDate = o.optString("standbyDate"),
            balanceDue = o.optString("balanceDue"),
            currency = o.optString("currency", "$"),
            dishStatus = DeviceStatus.from(o.optString("dishStatus")),
            wifiStatus = DeviceStatus.from(o.optString("wifiStatus")),
            alertReason = o.optString("alertReason"),
            lastUpdated = o.optString("lastUpdated"),
            notes = o.optString("notes")
        )
    }
}

data class PageSnapshot(
    val balanceDue: String = "",
    val currency: String = "",
    val standbyDate: String = "",
    val kitNumber: String = "",
    val serialNumber: String = "",
    val subscriptionId: String = "",
    val dishStatus: DeviceStatus = DeviceStatus.UNKNOWN,
    val wifiStatus: DeviceStatus = DeviceStatus.UNKNOWN,
    val alertReason: String = "",
    val lastUpdated: String = ""
)
