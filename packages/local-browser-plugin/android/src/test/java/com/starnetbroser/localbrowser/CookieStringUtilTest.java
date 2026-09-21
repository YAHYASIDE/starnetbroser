package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
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
}
