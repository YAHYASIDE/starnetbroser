package com.starnetbroser.localbrowser;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Whitelists the one thing this isolated browser is for: the real Starlink
 * account portal, over HTTPS. Rejects everything else - plain http, file:,
 * javascript:, or any other host - regardless of who is asking (the JS
 * bridge call in LocalBrowserPlugin, or a crafted Intent reaching
 * AccountBrowserActivity directly), so this screen can never be turned
 * into a way to load an arbitrary page - or run arbitrary script via a
 * javascript: URL - inside an isolated, cookie-bearing per-account
 * profile.
 */
public final class AllowedUrl {

    private static final String ALLOWED_HOST = "starlink.com";
    private static final String ALLOWED_HOST_SUFFIX = "." + ALLOWED_HOST;

    private AllowedUrl() {
    }

    public static boolean isAllowed(String url) {
        if (url == null) {
            return false;
        }
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return false;
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || !"https".equalsIgnoreCase(scheme)) {
            return false;
        }

        String lowerHost = host.toLowerCase(Locale.ROOT);
        return lowerHost.equals(ALLOWED_HOST) || lowerHost.endsWith(ALLOWED_HOST_SUFFIX);
    }
}
