package com.starnetbroser.localbrowser;

import java.io.ByteArrayOutputStream;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

    /** The rep's twin of stoppedMessage - only his own devices. */
    static String repStoppedMessage(List<String> names) {
        StringBuilder out = new StringBuilder();
        out.append(names.size() == 1 ? "⛔ توقف جهاز من أجهزتك" : "⛔ توقف " + names.size() + " من أجهزتك");
        out.append(" - أوقفت Starlink الاشتراك، تواصل مع الزبون:");
        for (String name : names) out.append("\n• ").append(name);
        return truncate(out.toString(), MAX_MESSAGE_CHARS);
    }

    /** Stopped devices grouped by their rep (devices without a rep are left out), in order. */
    static Map<String, List<String>> groupByRep(List<String> repIds, List<String> names) {
        Map<String, List<String>> groups = new LinkedHashMap<>();
        for (int i = 0; i < repIds.size() && i < names.size(); i++) {
            String repId = repIds.get(i);
            if (repId == null || repId.isEmpty()) continue;
            groups.computeIfAbsent(repId, k -> new ArrayList<>()).add(names.get(i));
        }
        return groups;
    }

    /** "key=value" per line - ids never contain "=" or line breaks. */
    static String encodePairs(Map<String, String> pairs) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> e : pairs.entrySet()) {
            if (e.getKey() == null || e.getValue() == null) continue;
            String key = e.getKey().replace("=", "").replace("\n", "");
            String value = e.getValue().replace("=", "").replace("\n", "");
            if (key.isEmpty() || value.isEmpty()) continue;
            out.append(key).append('=').append(value).append('\n');
        }
        return out.toString();
    }

    static Map<String, String> decodePairs(String raw) {
        Map<String, String> pairs = new LinkedHashMap<>();
        if (raw == null) return pairs;
        for (String line : raw.split("\n")) {
            int eq = line.indexOf('=');
            if (eq <= 0 || eq == line.length() - 1) continue;
            pairs.put(line.substring(0, eq), line.substring(eq + 1));
        }
        return pairs;
    }

    private static void write(ByteArrayOutputStream out, String s) {
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        out.write(bytes, 0, bytes.length);
    }

    /** "count|MRU=15000.0;USD=50.0" plus one more amount -> {new raw, count}. Pure. */
    static String[] addToTally(String raw, String currency, double amount) {
        int count = 0;
        java.util.LinkedHashMap<String, Double> totals = new java.util.LinkedHashMap<>();
        if (raw != null && raw.contains("|")) {
            String[] parts = raw.split("\\|", 2);
            try {
                count = Integer.parseInt(parts[0]);
            } catch (NumberFormatException ignored) {
                count = 0;
            }
            for (String pair : parts[1].split(";")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) continue;
                try {
                    totals.put(pair.substring(0, eq), Double.parseDouble(pair.substring(eq + 1)));
                } catch (NumberFormatException ignored) {
                    // skip a broken pair
                }
            }
        }
        totals.put(currency, (totals.containsKey(currency) ? totals.get(currency) : 0) + amount);
        count += 1;
        StringBuilder out = new StringBuilder().append(count).append('|');
        boolean first = true;
        for (java.util.Map.Entry<String, Double> e : totals.entrySet()) {
            if (!first) out.append(';');
            first = false;
            out.append(e.getKey()).append('=').append(e.getValue());
        }
        return new String[] {out.toString(), String.valueOf(count)};
    }

    /** "MRU=15000.0;USD=50.0" part of a tally -> "15,000 أوقية + 50 دولار". */
    static String tallyLabel(String raw) {
        if (raw == null || !raw.contains("|")) return "";
        StringBuilder out = new StringBuilder();
        java.text.DecimalFormat format = new java.text.DecimalFormat("#,##0.##", java.text.DecimalFormatSymbols.getInstance(java.util.Locale.ROOT));
        for (String pair : raw.split("\\|", 2)[1].split(";")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            String code = pair.substring(0, eq);
            String name = "USD".equals(code) ? "دولار" : "SIFA".equals(code) ? "سيفا" : "أوقية";
            if (out.length() > 0) out.append(" + ");
            try {
                out.append(format.format(Double.parseDouble(pair.substring(eq + 1)))).append(' ').append(name);
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return out.toString();
    }
}
