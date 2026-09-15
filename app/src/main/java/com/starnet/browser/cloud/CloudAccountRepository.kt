package com.starnet.browser.cloud

import com.starnet.browser.cloud.net.ApiClient
import com.starnet.browser.cloud.net.BrowserStatus
import com.starnet.browser.cloud.net.CloudAccountDetail
import com.starnet.browser.cloud.net.CloudAccountSummary
import org.json.JSONObject

class CloudAccountRepository(private val api: ApiClient) {

    suspend fun list(): List<CloudAccountSummary> {
        val array = api.getArray("/accounts")
        return (0 until array.length()).map { CloudAccountSummary.fromJson(array.getJSONObject(it)) }
    }

    suspend fun get(accountId: String): CloudAccountDetail =
        CloudAccountDetail.fromJson(api.get("/accounts/$accountId"))

    suspend fun create(
        name: String,
        email: String,
        emailSecret: String,
        wifiCode: String,
        kitNumber: String,
        serialNumber: String,
        accountNumber: String,
        subscriptionId: String,
        rechargeDate: String,
        notes: String
    ): CloudAccountDetail {
        val body = accountBody(
            name, email, emailSecret, wifiCode, kitNumber, serialNumber, accountNumber, subscriptionId,
            rechargeDate, notes
        )
        return CloudAccountDetail.fromJson(api.post("/accounts", body))
    }

    suspend fun update(
        accountId: String,
        name: String,
        email: String,
        emailSecret: String,
        wifiCode: String,
        kitNumber: String,
        serialNumber: String,
        accountNumber: String,
        subscriptionId: String,
        rechargeDate: String,
        notes: String
    ): CloudAccountDetail {
        val body = accountBody(
            name, email, emailSecret, wifiCode, kitNumber, serialNumber, accountNumber, subscriptionId,
            rechargeDate, notes
        )
        return CloudAccountDetail.fromJson(api.put("/accounts/$accountId", body))
    }

    /** Irreversibly deletes the account AND its cloud browser profile -
     * caller must have already shown a double-confirmation dialog. */
    suspend fun delete(accountId: String) {
        api.delete("/accounts/$accountId")
    }

    suspend fun browserStatus(accountId: String): BrowserStatus =
        BrowserStatus.fromJson(api.get("/accounts/$accountId/browser/status"))

    suspend fun startBrowser(accountId: String): BrowserStatus =
        BrowserStatus.fromJson(api.post("/accounts/$accountId/browser/start"))

    suspend fun stopBrowser(accountId: String): BrowserStatus =
        BrowserStatus.fromJson(api.post("/accounts/$accountId/browser/stop"))

    suspend fun scanNow(accountId: String): Pair<Boolean, String> {
        val json = api.post("/accounts/$accountId/browser/scan")
        return json.optBoolean("reachable") to json.optString("message")
    }

    suspend fun vncTicket(accountId: String): String =
        api.post("/accounts/$accountId/browser/vnc-ticket").getString("ticket")

    private fun accountBody(
        name: String,
        email: String,
        emailSecret: String,
        wifiCode: String,
        kitNumber: String,
        serialNumber: String,
        accountNumber: String,
        subscriptionId: String,
        rechargeDate: String,
        notes: String
    ) = JSONObject()
        .put("name", name)
        .put("email", email)
        .put("email_secret", emailSecret)
        .put("wifi_code", wifiCode)
        .put("kit_number", kitNumber)
        .put("serial_number", serialNumber)
        .put("account_number", accountNumber)
        .put("subscription_id", subscriptionId)
        .put("recharge_date", rechargeDate)
        .put("notes", notes)
}
