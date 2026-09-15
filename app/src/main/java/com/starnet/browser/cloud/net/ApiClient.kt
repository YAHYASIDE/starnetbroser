package com.starnet.browser.cloud.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiException(val code: Int, message: String) : Exception(message)

/**
 * Minimal JSON REST client for the cloud backend. Automatically retries a
 * request exactly once after a transparent token refresh on 401, so callers
 * never have to think about token expiry themselves. `password`/secret
 * values passed in request bodies are never logged here or anywhere below
 * this layer.
 */
class ApiClient(private val tokenStore: TokenStore) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun get(path: String, auth: Boolean = true): JSONObject = request("GET", path, null, auth)
    suspend fun post(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        request("POST", path, body ?: JSONObject(), auth)
    suspend fun put(path: String, body: JSONObject, auth: Boolean = true): JSONObject = request("PUT", path, body, auth)
    suspend fun delete(path: String, auth: Boolean = true): JSONObject = request("DELETE", path, null, auth)

    suspend fun getArray(path: String, auth: Boolean = true): JSONArray = withContext(Dispatchers.IO) {
        val text = rawRequest("GET", path, null, auth)
        JSONArray(text.ifBlank { "[]" })
    }

    private suspend fun request(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean
    ): JSONObject = withContext(Dispatchers.IO) {
        val text = rawRequest(method, path, body, auth)
        if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    private suspend fun rawRequest(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean,
        allowRefreshRetry: Boolean = true
    ): String {
        if (tokenStore.backendBaseUrl.isBlank()) {
            throw ApiException(0, "لم يتم ضبط عنوان الخادم السحابي")
        }
        val urlBuilder = Request.Builder().url(tokenStore.backendBaseUrl + path)
        if (auth) {
            tokenStore.accessToken?.let { urlBuilder.addHeader("Authorization", "Bearer $it") }
        }
        val requestBody = body?.toString()?.toRequestBody(jsonMedia)
        when (method) {
            "GET" -> urlBuilder.get()
            "POST" -> urlBuilder.post(requestBody ?: "{}".toRequestBody(jsonMedia))
            "PUT" -> urlBuilder.put(requestBody ?: "{}".toRequestBody(jsonMedia))
            "DELETE" -> urlBuilder.delete()
        }

        val response = try {
            client.newCall(urlBuilder.build()).execute()
        } catch (io: java.io.IOException) {
            throw ApiException(0, "تعذر الاتصال بالخادم: ${io.message}")
        }
        response.use { resp ->
            val text = resp.body?.string().orEmpty()
            if (resp.code == 401 && auth && allowRefreshRetry && tryRefresh()) {
                return rawRequest(method, path, body, auth, allowRefreshRetry = false)
            }
            if (!resp.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("detail") }.getOrNull()
                throw ApiException(resp.code, message?.ifBlank { null } ?: "HTTP ${resp.code}")
            }
            return text
        }
    }

    /** Uses the refresh token to get a new access+refresh pair. Never
     * retried recursively, and never logs the token values. */
    private fun tryRefresh(): Boolean {
        val refresh = tokenStore.refreshToken ?: return false
        return try {
            val body = JSONObject().put("refresh_token", refresh).toString().toRequestBody(jsonMedia)
            val req = Request.Builder()
                .url(tokenStore.backendBaseUrl + "/auth/refresh")
                .post(body)
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    tokenStore.clearTokens()
                    return false
                }
                val json = JSONObject(resp.body?.string().orEmpty())
                tokenStore.saveTokens(json.getString("access_token"), json.getString("refresh_token"))
                true
            }
        } catch (_: Exception) {
            false
        }
    }
}
