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
    private static final String FILE_API = "https://api.telegram.org/file/bot";
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
        return call(token, method, params, TIMEOUT_MS);
    }

    /** With a longer read timeout - a long-polling getUpdates holds the request open. */
    static JSONObject call(String token, String method, Map<String, String> params, int readTimeoutMs) throws IOException, TelegramError {
        byte[] body = TelegramText.formEncode(params).getBytes(StandardCharsets.UTF_8);
        return send(token, method, "application/x-www-form-urlencoded; charset=utf-8", body, readTimeoutMs);
    }

    static JSONObject sendMessage(String token, String chatId, String text) throws IOException, TelegramError {
        return sendMessage(token, chatId, text, null);
    }

    /** `replyMarkup`: Telegram reply_markup JSON (buttons), or null. */
    static JSONObject sendMessage(String token, String chatId, String text, String replyMarkup) throws IOException, TelegramError {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("chat_id", chatId);
        params.put("text", TelegramText.truncate(text, TelegramText.MAX_MESSAGE_CHARS));
        params.put("disable_web_page_preview", "true");
        if (replyMarkup != null && !replyMarkup.isEmpty()) params.put("reply_markup", replyMarkup);
        return call(token, "sendMessage", params);
    }

    /** Stops the button's spinner (optionally with a short toast). */
    static void answerCallbackQuery(String token, String callbackId, String text) throws IOException, TelegramError {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("callback_query_id", callbackId);
        if (text != null && !text.isEmpty()) params.put("text", text);
        call(token, "answerCallbackQuery", params);
    }

    /** Replaces a message's text (and drops its buttons). */
    static void editMessageText(String token, String chatId, long messageId, String text) throws IOException, TelegramError {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("chat_id", chatId);
        params.put("message_id", String.valueOf(messageId));
        params.put("text", TelegramText.truncate(text, TelegramText.MAX_MESSAGE_CHARS));
        call(token, "editMessageText", params);
    }

    static JSONObject sendDocument(String token, String chatId, String fileName, byte[] file, String caption) throws IOException, TelegramError {
        String boundary = "starnet" + UUID.randomUUID().toString().replace("-", "");
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("chat_id", chatId);
        if (caption != null && !caption.isEmpty()) fields.put("caption", TelegramText.truncate(caption, TelegramText.MAX_CAPTION_CHARS));
        byte[] body = TelegramText.multipart(boundary, fields, "document", fileName, "application/pdf", file);
        return send(token, "sendDocument", "multipart/form-data; boundary=" + boundary, body, TIMEOUT_MS);
    }

    /** A file someone sent the bot (getFile, then the file itself), as UTF-8 text. Refuses files
     * over `maxBytes` - the rep's device file is a few KB. */
    static String downloadText(String token, String fileId, int maxBytes) throws IOException, TelegramError {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("file_id", fileId);
        JSONObject file = call(token, "getFile", params).optJSONObject("result");
        String path = file != null ? file.optString("file_path", "") : "";
        if (path.isEmpty()) throw new TelegramError(400, "no file");
        if (file.optLong("file_size", 0) > maxBytes) throw new TelegramError(400, "file too big");
        HttpURLConnection connection = (HttpURLConnection) new URL(FILE_API + token + "/" + path).openConnection();
        try {
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            int status = connection.getResponseCode();
            if (status >= 400) throw new IOException("Telegram HTTP " + status);
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    if (out.size() > maxBytes) throw new TelegramError(400, "file too big");
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static JSONObject send(String token, String method, String contentType, byte[] body, int readTimeoutMs) throws IOException, TelegramError {
        HttpURLConnection connection = (HttpURLConnection) new URL(API + token + "/" + method).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(readTimeoutMs);
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
