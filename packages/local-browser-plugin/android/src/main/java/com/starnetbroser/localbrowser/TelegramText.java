package com.starnetbroser.localbrowser;

import java.io.ByteArrayOutputStream;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Pure helpers for the Telegram bot (TelegramClient): message limits, form/multipart bodies and
 * the "stopped devices" text. No Android or org.json types, so it's unit-tested (TelegramTextTest).
 */
final class TelegramText {

    /** Telegram rejects messages over 4096 characters - stay under with room for the "…". */
    static final int MAX_MESSAGE_CHARS = 4000;
    /** Captions on a document are limited to 1024 characters. */
    static final int MAX_CAPTION_CHARS = 1000;

    private TelegramText() {
    }

    static String truncate(String text, int max) {
        if (text == null) return "";
        if (text.length() <= max) return text;
        return text.substring(0, max - 1) + "…";
    }

    static String formEncode(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> e : params.entrySet()) {
            if (e.getValue() == null) continue;
            if (out.length() > 0) out.append('&');
            try {
                out.append(URLEncoder.encode(e.getKey(), "UTF-8")).append('=').append(URLEncoder.encode(e.getValue(), "UTF-8"));
            } catch (UnsupportedEncodingException impossible) {
                throw new IllegalStateException(impossible);
            }
        }
        return out.toString();
    }

    /** A multipart/form-data body: every text field, then one file part. */
    static byte[] multipart(String boundary, Map<String, String> fields, String fileField, String fileName, String contentType, byte[] file) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (Map.Entry<String, String> e : fields.entrySet()) {
            if (e.getValue() == null) continue;
            write(out, "--" + boundary + "\r\n");
            write(out, "Content-Disposition: form-data; name=\"" + e.getKey() + "\"\r\n\r\n");
            write(out, e.getValue() + "\r\n");
        }
        write(out, "--" + boundary + "\r\n");
        write(out, "Content-Disposition: form-data; name=\"" + fileField + "\"; filename=\"" + safeFileName(fileName) + "\"\r\n");
        write(out, "Content-Type: " + contentType + "\r\n\r\n");
        out.write(file, 0, file.length);
        write(out, "\r\n--" + boundary + "--\r\n");
        return out.toByteArray();
    }

    /** Quotes and line breaks would break the multipart header. */
    static String safeFileName(String name) {
        String cleaned = name == null ? "" : name.replace("\"", "").replace("\r", "").replace("\n", "").trim();
        return cleaned.isEmpty() ? "document.pdf" : cleaned;
    }

    /** "⛔ توقف 3 أجهزة" + one name per line - the Telegram twin of the phone notification. */
    static String stoppedMessage(List<String> names) {
        StringBuilder out = new StringBuilder();
        out.append(names.size() == 1 ? "⛔ توقف جهاز" : "⛔ توقف " + names.size() + " أجهزة");
        out.append(" - أوقفت Starlink الاشتراك:");
        for (String name : names) out.append("\n• ").append(name);
        return truncate(out.toString(), MAX_MESSAGE_CHARS);
    }

    private static void write(ByteArrayOutputStream out, String s) {
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        out.write(bytes, 0, bytes.length);
    }
}
