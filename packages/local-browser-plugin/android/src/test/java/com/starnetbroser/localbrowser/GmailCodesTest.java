package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.Test;

// Fake messages only.
public class GmailCodesTest {

    private static String b64url(String text) {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String message(long at, String subject, String snippet, String mime, String body) {
        return "{\"id\":\"m1\",\"internalDate\":\"" + at + "\",\"snippet\":\"" + snippet + "\","
            + "\"payload\":{\"mimeType\":\"multipart/alternative\",\"headers\":[{\"name\":\"Subject\",\"value\":\"" + subject + "\"}],"
            + "\"parts\":[{\"mimeType\":\"" + mime + "\",\"body\":{\"data\":\"" + b64url(body) + "\"}}]}}";
    }

    @Test
    public void readsMicrosoftsSecurityCodeFromTheMessage() {
        String json = message(2000, "Microsoft account security code", "Please use the following security code",
            "text/plain", "Please use the following security code for the Microsoft account de***@outlook.com.\nSecurity code: 4791\n");
        assertEquals("4791", GmailCodes.codeIn(json, 1000));
    }

    @Test
    public void readsTheCodeFromAnHtmlOnlyMessage() {
        String json = message(2000, "Verify your email address", "", "text/html",
            "<html><body><p>Your single-use code is:</p><p><b>583120</b></p><p>Thanks</p></body></html>");
        assertEquals("583120", GmailCodes.codeIn(json, 1000));
    }

    @Test
    public void ignoresMessagesFromBeforeThePageAsked() {
        String json = message(500, "Microsoft account security code", "", "text/plain", "Security code: 4791");
        assertNull(GmailCodes.codeIn(json, 1000));
        assertNull(GmailCodes.codeIn("not json", 0));
    }

    @Test
    public void listsIdsAndReadsTheAccount() {
        assertEquals(Arrays.asList("a1", "b2"), GmailCodes.parseIds("{\"messages\":[{\"id\":\"a1\"},{\"id\":\"b2\"}]}"));
        assertTrue(GmailCodes.parseIds("{\"resultSizeEstimate\":0}").isEmpty());
        assertEquals("demo@gmail.com", GmailCodes.profileEmail("{\"emailAddress\":\"Demo@Gmail.com\"}"));
        assertTrue(GmailCodes.listUrl().contains("newer_than%3A1d"));
    }

    @Test
    public void decodesBase64UrlWithoutPadding() {
        assertEquals("كود 1234 ?>", new String(GmailCodes.decodeBase64Url(b64url("كود 1234 ?>")), StandardCharsets.UTF_8));
    }

    @Test
    public void onlyMicrosoftsOwnStepsAreWatchedForACode() {
        assertTrue(GmailCodes.isMicrosoftStep("https://login.live.com/ppsecure/post.srf"));
        assertTrue(GmailCodes.isMicrosoftStep("https://signup.live.com/signup"));
        assertTrue(GmailCodes.isMicrosoftStep("https://account.live.com/proofs/Verify"));
        assertFalse(GmailCodes.isMicrosoftStep("https://outlook.live.com/mail/0/"));
        assertFalse(GmailCodes.isMicrosoftStep("https://login.example.com/"));
        assertFalse(GmailCodes.isMicrosoftStep(null));
    }

    @Test
    public void typesTheCodeWithoutPressingAnything() {
        String script = GmailCodes.fillScript("4791");
        assertTrue(script.endsWith("(\"4791\");"));
        assertFalse(script.contains(".click()"));
    }
}
