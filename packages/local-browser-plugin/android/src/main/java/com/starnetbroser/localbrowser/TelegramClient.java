package com.starnetbroser.localbrowser;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Minimal Telegram Bot API client (https://core.telegram.org/bots/api) over HttpURLConnection -
 * blocking, so only ever called off the main thread. The token is part of the request URL and is
 * never logged or put into an exception message.
 */
final class TelegramClient {

    private static final String API = "https://api.telegram.org/bot";
    private static final int TIMEOUT_MS = 20_000;

    /** A reply Telegram itself rejected (bad token, chat not found...) - retrying won't help. */
    static final class TelegramError extends Exception {
        final int code;

        TelegramError(int code, String description) {
            super(description);
            this.code = code;
        }
    }

    private TelegramClient() {
    }

    static JSONObject call(String token, String method, Map<String, String> params) throws IOException, TelegramError {
        byte[] body = TelegramText.formEncode(params).getBytes(StandardCharsets.UTF_8);
        return send(token, method, "application/x-www-form-urlencoded; charset=utf-8", body);
    }

    static JSONObject sendMessage(String token, String chatId, String text) throws IOException, TelegramError {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("chat_id", chatId);
        params.put("text", TelegramText.truncate(text, TelegramText.MAX_MESSAGE_CHARS));
        params.put("disable_web_page_preview", "true");
        return call(token, "sendMessage", params);
    }

    static JSONObject sendDocument(String token, String chatId, String fileName, byte[] file, String caption) throws IOException, TelegramError {
        String boundary = "starnet" + UUID.randomUUID().toString().replace("-", "");
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("chat_id", chatId);
        if (caption != null && !caption.isEmpty()) fields.put("caption", TelegramText.truncate(caption, TelegramText.MAX_CAPTION_CHARS));
        byte[] body = TelegramText.multipart(boundary, fields, "document", fileName, "application/pdf", file);
        return send(token, "sendDocument", "multipart/form-data; boundary=" + boundary, body);
    }

    private static JSONObject send(String token, String method, String contentType, byte[] body) throws IOException, TelegramError {
        HttpURLConnection connection = (HttpURLConnection) new URL(API + token + "/" + method).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", contentType);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body);
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = stream == null ? "" : readAll(stream);
            JSONObject json;
            try {
                json = new JSONObject(text);
            } catch (JSONException e) {
                throw new IOException("Telegram HTTP " + status);
            }
            if (!json.optBoolean("ok", false)) {
                if (status == 429 || status >= 500) throw new IOException("Telegram HTTP " + status);
                throw new TelegramError(json.optInt("error_code", status), json.optString("description", ""));
            }
            return json;
        } finally {
            connection.disconnect();
        }
    }

    private static String readAll(InputStream stream) throws IOException {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
