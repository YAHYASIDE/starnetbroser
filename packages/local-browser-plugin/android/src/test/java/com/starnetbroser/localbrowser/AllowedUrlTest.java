package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AllowedUrlTest {

    @Test
    public void allowsTheApexDomainOverHttps() {
        assertTrue(AllowedUrl.isAllowed("https://starlink.com/account/home"));
    }

    @Test
    public void allowsASubdomainOverHttps() {
        assertTrue(AllowedUrl.isAllowed("https://www.starlink.com/account/home"));
        assertTrue(AllowedUrl.isAllowed("https://api.starlink.com/x"));
    }

    @Test
    public void isCaseInsensitiveOnHostAndScheme() {
        assertTrue(AllowedUrl.isAllowed("HTTPS://STARLINK.COM/account/home"));
    }

    @Test
    public void rejectsPlainHttp() {
        assertFalse(AllowedUrl.isAllowed("http://starlink.com/account/home"));
    }

    @Test
    public void rejectsFileScheme() {
        assertFalse(AllowedUrl.isAllowed("file:///etc/passwd"));
    }

    @Test
    public void rejectsJavascriptScheme() {
        assertFalse(AllowedUrl.isAllowed("javascript:alert(document.cookie)"));
    }

    @Test
    public void rejectsAnUnrelatedHttpsHost() {
        assertFalse(AllowedUrl.isAllowed("https://evil.com/"));
    }

    @Test
    public void rejectsAHostThatMerelyContainsTheAllowedDomain() {
        // Not a starlink.com subdomain - the real host is "attacker.net".
        assertFalse(AllowedUrl.isAllowed("https://starlink.com.attacker.net/"));
    }

    @Test
    public void rejectsAHostThatMerelyStartsWithTheAllowedDomain() {
        assertFalse(AllowedUrl.isAllowed("https://starlink.company.example/"));
    }

    @Test
    public void treatsUserinfoTricksAsTheRealHostOnly() {
        // The host here really is starlink.com; "evil.com" is just userinfo and never reaches
        // the network as a host - this must be allowed, not rejected as a bypass attempt.
        assertTrue(AllowedUrl.isAllowed("https://evil.com@starlink.com/"));
    }

    @Test
    public void rejectsNull() {
        assertFalse(AllowedUrl.isAllowed(null));
    }

    @Test
    public void rejectsMalformedUrls() {
        assertFalse(AllowedUrl.isAllowed("not a url"));
        assertFalse(AllowedUrl.isAllowed(""));
    }

    @Test
    public void rejectsArbitraryJavaScriptSuppliedUrls() {
        String[] attempts = {
            "http://starlink.com/",
            "ftp://starlink.com/",
            "file:///android_asset/index.html",
            "javascript:void(0)",
            "https://",
            "https://not-starlink.com/",
            "intent://starlink.com#Intent;scheme=https;end",
        };
        for (String attempt : attempts) {
            assertFalse("expected rejected: " + attempt, AllowedUrl.isAllowed(attempt));
        }
    }
}
