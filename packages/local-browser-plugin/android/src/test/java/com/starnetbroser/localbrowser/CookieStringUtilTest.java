package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class CookieStringUtilTest {

    @Test
    public void splitsAStandardMultiCookieString() {
        List<String> result = CookieStringUtil.splitCombinedCookieString("session=abc123; csrf=xyz789");
        assertEquals(Arrays.asList("session=abc123", "csrf=xyz789"), result);
    }

    @Test
    public void splitsASingleCookie() {
        assertEquals(Arrays.asList("session=abc123"), CookieStringUtil.splitCombinedCookieString("session=abc123"));
    }

    @Test
    public void nullInputYieldsAnEmptyListRatherThanThrowing() {
        assertTrue(CookieStringUtil.splitCombinedCookieString(null).isEmpty());
    }

    @Test
    public void emptyOrBlankInputYieldsAnEmptyList() {
        assertTrue(CookieStringUtil.splitCombinedCookieString("").isEmpty());
        assertTrue(CookieStringUtil.splitCombinedCookieString("   ").isEmpty());
    }

    @Test
    public void toleratesStrayOrDoubledSeparatorsWithoutProducingBlankEntries() {
        List<String> result = CookieStringUtil.splitCombinedCookieString("a=1;; b=2;   ;c=3;");
        assertEquals(Arrays.asList("a=1", "b=2", "c=3"), result);
    }

    @Test
    public void trimsSurroundingWhitespacePerEntry() {
        assertEquals(Arrays.asList("a=1", "b=2"), CookieStringUtil.splitCombinedCookieString("  a=1  ;  b=2  "));
    }

    private static final String KEEP = "; Max-Age=" + CookieStringUtil.RESTORED_MAX_AGE_SECONDS + "; Secure";

    private static List<String> restore(Map<String, String> exported) {
        List<String> out = new ArrayList<>();
        for (CookieStringUtil.RestoreCookie c : CookieStringUtil.buildRestoreCookies(exported, "starlink.com")) {
            out.add(c.url + " -> " + c.cookie);
        }
        return out;
    }

    @Test
    public void apexCookiesAreRestoredDomainWideAndPersistent() {
        Map<String, String> exported = new LinkedHashMap<>();
        exported.put("https://starlink.com", "access=a1; refresh=r1");
        exported.put("https://www.starlink.com", "access=a1; refresh=r1");
        assertEquals(
            Arrays.asList(
                "https://starlink.com/ -> access=a1; Domain=starlink.com; Path=/" + KEEP,
                "https://starlink.com/ -> refresh=r1; Domain=starlink.com; Path=/" + KEEP
            ),
            restore(exported)
        );
    }

    @Test
    public void cookiesSeenOnlyOnASubdomainStayHostOnlyThere() {
        Map<String, String> exported = new LinkedHashMap<>();
        exported.put("https://www.starlink.com", "shared=1; wwwOnly=2");
        exported.put("https://starlink.com", "shared=1");
        exported.put("https://api.starlink.com", "shared=1; apiOnly=3");
        assertEquals(
            Arrays.asList(
                "https://starlink.com/ -> shared=1; Domain=starlink.com; Path=/" + KEEP,
                "https://www.starlink.com/ -> wwwOnly=2; Path=/" + KEEP,
                "https://api.starlink.com/ -> apiOnly=3; Path=/" + KEEP
            ),
            restore(exported)
        );
    }

    @Test
    public void aDeeperPathKeepsItsPathButRootCookiesAreNotDuplicated() {
        Map<String, String> exported = new LinkedHashMap<>();
        exported.put("https://api.starlink.com", "root=1");
        exported.put("https://api.starlink.com/auth-rp/auth", "root=1; refresh=9");
        assertEquals(
            Arrays.asList(
                "https://api.starlink.com/ -> root=1; Path=/" + KEEP,
                "https://api.starlink.com/auth-rp/auth -> refresh=9; Path=/auth-rp/auth" + KEEP
            ),
            restore(exported)
        );
    }

    @Test
    public void hostPrefixedCookiesNeverGetADomain() {
        Map<String, String> exported = new LinkedHashMap<>();
        exported.put("https://starlink.com", "__Host-csrf=x");
        exported.put("https://www.starlink.com", "__Host-csrf=y");
        assertEquals(
            Arrays.asList(
                "https://starlink.com/ -> __Host-csrf=x; Path=/" + KEEP,
                "https://www.starlink.com/ -> __Host-csrf=y; Path=/" + KEEP
            ),
            restore(exported)
        );
    }

    @Test
    public void nonHttpsOrBrokenUrlsAndEmptyInputsAreSkipped() {
        Map<String, String> exported = new LinkedHashMap<>();
        exported.put("http://starlink.com", "a=1");
        exported.put("not a url", "b=2");
        exported.put("https://www.starlink.com", "");
        assertTrue(restore(exported).isEmpty());
        assertTrue(CookieStringUtil.buildRestoreCookies(null, "starlink.com").isEmpty());
    }
}
