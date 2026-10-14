package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

// Shaped like the no-reply card-confirmation mail (Gmail API message) - fake code only.
public class GmailPaymentCodeTest {

    private static String message(long date, String subject, String body) {
        String data = base64Url(body);
        return "{\"internalDate\":\"" + date + "\",\"snippet\":\"Please confirm the following payment\","
            + "\"payload\":{\"headers\":[{\"name\":\"Subject\",\"value\":\"" + subject + "\"},"
            + "{\"name\":\"From\",\"value\":\"no-reply@processor.example\"}],"
            + "\"mimeType\":\"text/plain\",\"body\":{\"data\":\"" + data + "\"}}}";
    }

    private static String base64Url(String text) {
        byte[] b = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String std = java.util.Base64.getEncoder().encodeToString(b);
        return std.replace('+', '-').replace('/', '_');
    }

    @Test
    public void readsTheCodeFromTheMailBody() {
        String body = "Please confirm your payment of €0.00 to STARLINK INTERNET using the following code: 123456";
        assertEquals("123456", GmailCodes.paymentCodeIn(message(5000, "STARLINK INTERNET", body), 1000));
    }

    @Test
    public void ignoresOldMailAndKastCodes() {
        String body = "confirm your payment using the following code: 123456";
        assertNull("too old", GmailCodes.paymentCodeIn(message(500, "STARLINK INTERNET", body), 1000));
        assertNull("kast is not this code", GmailCodes.paymentCodeIn(message(5000, "Your KAST verification code", "KAST code 999999"), 1000));
    }
}
