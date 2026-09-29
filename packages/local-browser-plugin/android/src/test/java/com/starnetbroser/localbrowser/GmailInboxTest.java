package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.TimeZone;
import org.junit.Test;

public class GmailInboxTest {

    private static final long NOW = 1_790_000_000_000L;

    private static MailMessage starlink(String code, long at) {
        return new MailMessage("Starlink", "Your Starlink verification code", "Your one-time passcode is " + code + ".", at);
    }

    @Test
    public void htmlBodiesBecomeReadableText() {
        String text = MailMessages.htmlToText("<style>p{color:red}</style><p>Your code is <b>482913</b></p><p>Thanks&nbsp;&amp; bye</p>");
        assertEquals("Your code is 482913\nThanks & bye", text);
        assertEquals("", MailMessages.htmlToText(null));
        assertEquals("abc…", MailMessages.preview("abcdef", 3));
    }

    @Test
    public void onlyACodeThatArrivedAfterThePageIsTyped() {
        List<MailMessage> inbox = Arrays.asList(starlink("222222", NOW - 1000), starlink("111111", NOW - 3_600_000));
        assertEquals("222222", MailMessages.newCode(inbox, NOW - 60_000, ""));
        // the new one was already tried -> the old one (before the page) is never used
        assertNull(MailMessages.newCode(inbox, NOW - 60_000, "222222"));
        assertNull(MailMessages.newCode(Collections.singletonList(starlink("111111", NOW - 3_600_000)), NOW - 60_000, ""));
        assertEquals("222222", MailMessages.newestCode(inbox));
    }

    @Test
    public void theInboxPageEscapesEverythingFromAMessage() {
        MailMessage evil = new MailMessage("<script>x</script>", "a\"b", "hi <img src=x onerror=1>", NOW);
        String html = MailInboxHtml.inboxPage("me@gmail.com", Arrays.asList(evil, starlink("739015", NOW)), TimeZone.getTimeZone("UTC"));
        assertFalse(html.contains("<script>x"));
        assertFalse(html.contains("<img src=x"));
        assertTrue(html.contains("&lt;script&gt;x&lt;/script&gt;"));
        assertTrue(html.contains("StarNet.copy('739015')"));
        assertTrue(html.contains("me@gmail.com"));
    }

    @Test
    public void theSetupPageShowsTheEmailAndAnError() {
        String html = MailInboxHtml.setupPage("a<b@gmail.com", "رفضت");
        assertTrue(html.contains("a&lt;b@gmail.com"));
        assertTrue(html.contains("رفضت"));
        assertTrue(html.contains("StarNet.openGoogle('apppasswords')"));
        assertTrue(html.contains("StarNet.save("));
    }
}
