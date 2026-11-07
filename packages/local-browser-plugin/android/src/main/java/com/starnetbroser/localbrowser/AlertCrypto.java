package com.starnetbroser.localbrowser;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * 🔴🟡 The alerts' seal opened on the phone while the app is closed (his Nov 7 2026 choice «نعم، عبر خدمة الخلفية»): the
 * same AES-256-GCM as the app (apps/web lib/deviceSyncCrypto.ts - a 64-hex key, `{iv, data}` in standard base64, the tag
 * at the end of `data`), and the notification's words. Pure (no android.*), JUnit: AlertCryptoTest.
 */
final class AlertCrypto {

    private AlertCrypto() {}

    /** The text, or null on a wrong key / damaged data. */
    static String open(String ivBase64, String dataBase64, String keyHex) {
        try {
            byte[] key = fromHex(keyHex);
            if (key == null || key.length != 32) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, fromBase64(ivBase64)));
            return new String(cipher.doFinal(fromBase64(dataBase64)), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }

    /** «🔴 مستعجل - 🚩 تحذير من المندوب الحسين» + device + note (as the app's own message). */
    static String repFlagText(String level, String repName, String deviceName, String note) {
        String rep = repName == null ? "" : repName.trim();
        return levelMark(level) + "🚩 تحذير من المندوب" + (rep.isEmpty() ? "" : " " + rep) + "\n📡 " + clean(deviceName) + "\n📝 " + clean(note);
    }

    /** «🔴 مستعجل - 🚩 تنبيه من المسؤول 2» + device + note. */
    static String teamFlagText(String level, String by, String deviceName, String note) {
        String who = by == null || by.trim().isEmpty() ? "مسؤول" : by.trim();
        return levelMark(level) + "🚩 تنبيه من " + who + "\n📡 " + clean(deviceName) + "\n📝 " + clean(note);
    }

    /** «💬 المسؤول 2: الطبق لا يتصل» - or «📷 صورة» / «📡 DEMO 1» when there is no text (as the app's own). */
    static String chatText(String by, String text, boolean image, String deviceName) {
        String who = by == null || by.trim().isEmpty() ? "رسالة" : by.trim();
        String t = text == null ? "" : text.trim();
        String what = !t.isEmpty() ? (t.length() > 80 ? t.substring(0, 80) + "…" : t) : image ? "📷 صورة" : deviceName != null && !deviceName.trim().isEmpty() ? "📡 " + deviceName.trim() : "";
        return "💬 " + who + ": " + what;
    }

    /** The chat documents' `at` (zero-padded) - text order = time order. */
    static String atKey(long at) {
        String s = String.valueOf(Math.max(0, at));
        StringBuilder out = new StringBuilder();
        for (int i = s.length(); i < 15; i++) out.append('0');
        return out.append(s).toString();
    }

    private static String levelMark(String level) {
        return "urgent".equals(level) ? "🔴 مستعجل - " : "🟡 ";
    }

    private static String clean(String text) {
        String t = text == null ? "" : text.trim();
        return t.length() > 300 ? t.substring(0, 300) + "…" : t;
    }

    /** A document made after the app last looked (its server time vs the phone's - a few seconds of slack). */
    static boolean isNewSince(long createdAtMs, long appSeenUntilMs) {
        return createdAtMs <= 0 || createdAtMs > appSeenUntilMs - 5_000;
    }

    static byte[] fromHex(String hex) {
        if (hex == null || hex.length() % 2 != 0) return null;
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = Character.digit(hex.charAt(i * 2), 16);
            int lo = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (hi < 0 || lo < 0) return null;
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }

    /** Standard base64 (java.util.Base64 is missing on this app's oldest Androids). */
    static byte[] fromBase64(String text) {
        String s = text.replaceAll("[\\s=]", "");
        byte[] out = new byte[s.length() * 3 / 4];
        int buffer = 0;
        int bits = 0;
        int n = 0;
        for (int i = 0; i < s.length(); i++) {
            int v = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(s.charAt(i));
            if (v < 0) throw new IllegalArgumentException("not base64");
            buffer = (buffer << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out[n++] = (byte) ((buffer >> bits) & 0xff);
            }
        }
        if (n == out.length) return out;
        byte[] exact = new byte[n];
        System.arraycopy(out, 0, exact, 0, n);
        return exact;
    }
}
