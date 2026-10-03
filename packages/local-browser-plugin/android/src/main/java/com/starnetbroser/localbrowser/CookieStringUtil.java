package com.starnetbroser.localbrowser;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * android.webkit.CookieManager#getCookie(url) returns every cookie visible for that URL joined
 * into one string ("name1=value1; name2=value2"), with no per-cookie attributes (expiry, domain,
 * secure, ...) - that's the only bulk-read the public WebKit API offers. Restoring them requires
 * the opposite: CookieManager#setCookie(url, cookie) takes exactly ONE "name=value" pair per
 * call. This is the pure step between the two, kept separate from LocalBrowserPlugin so it can be
 * unit-tested without any Android/WebView dependency.
 */
final class CookieStringUtil {

    /** A restored login has to survive the app being closed: a cookie set with no Max-Age/Expires
     * is a session cookie that WebView drops as soon as the process dies, which is exactly what
     * a restored backup must never do. Starlink itself still decides whether the session behind
     * the cookie is valid - this only keeps the cookie around long enough to be sent. */
    static final int RESTORED_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

    /** One CookieManager#setCookie(url, cookie) call. */
    static final class RestoreCookie {
        final String url;
        final String cookie;

        RestoreCookie(String url, String cookie) {
            this.url = url;
            this.cookie = cookie;
        }
    }

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

    /**
     * Turns an export (url -> combined cookie string) back into setCookie calls that recreate the
     * session as closely as the attribute-less export allows:
     *
     * - A cookie read at the apex (https://{apexHost}/) is restored domain-wide
     *   (Domain={apexHost}), so it is sent to www/api/auth subdomains again - a host-only restore
     *   at the apex would silently drop it for every subdomain the login actually relies on.
     * - A cookie seen only on another host is restored host-only to that host; one seen only
     *   under a deeper path (e.g. https://api.x.com/auth) keeps that path.
     * - "__Host-" cookies are never given a Domain (the browser rejects them otherwise).
     * - Every cookie gets Secure and a long Max-Age, so it outlives the app process.
     *
     * URLs that aren't https or can't be parsed are skipped; the caller is still responsible for
     * only passing allow-listed ones.
     */
    static List<RestoreCookie> buildRestoreCookies(Map<String, String> cookiesByUrl, String apexHost) {
        List<RestoreCookie> result = new ArrayList<>();
        if (cookiesByUrl == null || apexHost == null) {
            return result;
        }
        String apex = apexHost.toLowerCase(Locale.ROOT);

        // host -> path -> pairs, in the export's own order.
        Map<String, Map<String, List<String>>> byHost = new LinkedHashMap<>();
        Map<String, String> urlForHostPath = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : cookiesByUrl.entrySet()) {
            URI uri;
            try {
                uri = new URI(entry.getKey());
            } catch (URISyntaxException | NullPointerException e) {
                continue;
            }
            if (uri.getHost() == null || !"https".equalsIgnoreCase(uri.getScheme())) {
                continue;
            }
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            String path = normalizePath(uri.getPath());
            List<String> pairs = byHost.computeIfAbsent(host, h -> new LinkedHashMap<>()).computeIfAbsent(path, p -> new ArrayList<>());
            pairs.addAll(splitCombinedCookieString(entry.getValue()));
            urlForHostPath.putIfAbsent(host + path, "https://" + host + path);
        }

        Set<String> apexRootPairs = new LinkedHashSet<>();
        Map<String, List<String>> apexPaths = byHost.get(apex);
        if (apexPaths != null && apexPaths.get("/") != null) {
            apexRootPairs.addAll(apexPaths.get("/"));
        }

        Set<String> emitted = new LinkedHashSet<>();
        // The apex first, so domain-wide cookies land before any host-only overrides.
        for (String pair : apexRootPairs) {
            boolean hostOnly = isHostPrefixed(pair);
            String cookie = pair + (hostOnly ? "" : "; Domain=" + apex) + attributes("/");
            if (emitted.add((hostOnly ? apex : "." + apex) + "|/|" + pair)) {
                result.add(new RestoreCookie("https://" + apex + "/", cookie));
            }
        }

        for (Map.Entry<String, Map<String, List<String>>> hostEntry : byHost.entrySet()) {
            String host = hostEntry.getKey();
            Map<String, List<String>> paths = hostEntry.getValue();
            Set<String> hostRootPairs = new LinkedHashSet<>();
            if (paths.get("/") != null) {
                hostRootPairs.addAll(paths.get("/"));
            }
            for (Map.Entry<String, List<String>> pathEntry : paths.entrySet()) {
                String path = pathEntry.getKey();
                for (String pair : pathEntry.getValue()) {
                    boolean hostPrefixed = isHostPrefixed(pair);
                    // Already restored domain-wide from the apex (and so visible here too).
                    if (!hostPrefixed && apexRootPairs.contains(pair)) {
                        continue;
                    }
                    // A root-path cookie of this host also shows up under its deeper paths.
                    if (!"/".equals(path) && hostRootPairs.contains(pair)) {
                        continue;
                    }
                    // __Host- cookies must have Path=/.
                    String cookiePath = hostPrefixed ? "/" : path;
                    if (emitted.add(host + "|" + cookiePath + "|" + pair)) {
                        result.add(new RestoreCookie(urlForHostPath.get(host + path), pair + attributes(cookiePath)));
                    }
                }
            }
        }
        return result;
    }

    private static String attributes(String path) {
        return "; Path=" + path + "; Max-Age=" + RESTORED_MAX_AGE_SECONDS + "; Secure";
    }

    private static boolean isHostPrefixed(String pair) {
        return pair.startsWith("__Host-");
    }

    private static String normalizePath(String path) {
        if (path == null || path.isEmpty()) {
            return "/";
        }
        return path;
    }
}
