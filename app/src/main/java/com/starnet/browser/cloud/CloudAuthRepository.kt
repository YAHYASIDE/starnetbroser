package com.starnet.browser.cloud

import com.starnet.browser.cloud.net.ApiClient
import com.starnet.browser.cloud.net.ApiException
import com.starnet.browser.cloud.net.CloudDevice
import com.starnet.browser.cloud.net.TokenPair
import com.starnet.browser.cloud.net.TokenStore
import org.json.JSONObject

/** True when the server rejected login specifically because a TOTP code is required. */
class TotpRequiredException : Exception("totp_required")

class CloudAuthRepository(private val tokenStore: TokenStore, private val api: ApiClient) {

    val isLoggedIn: Boolean get() = tokenStore.isLoggedIn

    suspend fun register(email: String, password: String, deviceName: String) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("device_name", deviceName)
        val pair = TokenPair.fromJson(api.post("/auth/register", body, auth = false))
        tokenStore.saveTokens(pair.accessToken, pair.refreshToken)
    }

    suspend fun login(email: String, password: String, totpCode: String?, deviceName: String) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("device_name", deviceName)
        if (!totpCode.isNullOrBlank()) body.put("totp_code", totpCode)
        try {
            val pair = TokenPair.fromJson(api.post("/auth/login", body, auth = false))
            tokenStore.saveTokens(pair.accessToken, pair.refreshToken)
        } catch (e: ApiException) {
            if (e.code == 401 && e.message?.contains("totp_required") == true) {
                throw TotpRequiredException()
            }
            throw e
        }
    }

    suspend fun enrollTotp(): Pair<String, String> {
        val json = api.post("/auth/totp/enroll")
        return json.getString("secret") to json.getString("provisioning_uri")
    }

    suspend fun verifyTotp(code: String): Boolean {
        val json = api.post("/auth/totp/verify", JSONObject().put("code", code))
        return json.optBoolean("totp_enabled")
    }

    suspend fun listDevices(): List<CloudDevice> {
        val array = api.getArray("/auth/devices")
        return (0 until array.length()).map { CloudDevice.fromJson(array.getJSONObject(it)) }
    }

    suspend fun revokeDevice(deviceId: String) {
        api.delete("/auth/devices/$deviceId")
    }

    /** Revokes every device, including this one - signs the whole account
     * out everywhere. Never touches any Starlink cloud browser session. */
    suspend fun logoutAllDevices() {
        api.post("/auth/logout-all")
        tokenStore.clearTokens()
    }

    /** Only clears THIS device's local tokens. Starlink cloud sessions are
     * untouched - a separate, explicitly confirmed action deletes those. */
    fun signOutThisDevice() {
        tokenStore.clearTokens()
    }
}
