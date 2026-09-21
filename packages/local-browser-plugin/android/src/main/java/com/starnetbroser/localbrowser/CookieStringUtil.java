package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;

/**
 * android.webkit.CookieManager#getCookie(url) returns every cookie visible for that URL joined
 * into one string ("name1=value1; name2=value2"), with no per-cookie attributes (expiry, domain,
 * secure, ...) - that's the only bulk-read the public WebKit API offers. Restoring them requires
 * the opposite: CookieManager#setCookie(url, cookie) takes exactly ONE "name=value" pair per
 * call. This is the pure splitting step between the two, kept separate from LocalBrowserPlugin so
 * it can be unit-tested without any Android/WebView dependency.
 */
final class CookieStringUtil {

    private CookieStringUtil() {
    }

    /** Never throws - a null, empty, or malformed (stray/doubled separators) input simply yields
     * fewer entries, never a crash mid-restore. */
    static List<String> splitCombinedCookieString(String combined) {
        List<String> result = new ArrayList<>();
        if (combined == null) {
            return result;
        }
        for (String part : combined.split(";")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }
}
