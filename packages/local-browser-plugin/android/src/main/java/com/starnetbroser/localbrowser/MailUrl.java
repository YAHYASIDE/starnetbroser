package com.starnetbroser.localbrowser;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * The device's own mailbox (📧 البريد): Outlook on the web and the Microsoft sign-in pages, over
 * HTTPS only. Like AllowedUrl for Starlink, this decides what the mail browser may be opened on
 * and where it may read a verification code from - never an arbitrary page. Pure, unit-tested.
 */
public final class MailUrl {

    /** Outlook's inbox - it sends a signed-out visitor to the Microsoft sign-in page by itself. */
    public static final String INBOX_URL = "https://outlook.live.com/mail/0/";

    private static final String[] ALLOWED_HOSTS = {
        "outlook.live.com", "outlook.com", "live.com", "hotmail.com",
        "microsoft.com", "microsoftonline.com", "office.com",
    };

    private MailUrl() {}

    public static boolean isAllowed(String url) {
        if (url == null) return false;
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return false;
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || !"https".equalsIgnoreCase(scheme)) return false;
        String lower = host.toLowerCase(Locale.ROOT);
        for (String allowed : ALLOWED_HOSTS) {
            if (lower.equals(allowed) || lower.endsWith("." + allowed)) return true;
        }
        return false;
    }

    /** The inbox, with the email as a sign-in hint when there is one. */
    public static String inboxUrlFor(String email) {
        if (email == null || email.trim().isEmpty()) return INBOX_URL;
        return INBOX_URL + "?login_hint=" + urlEncode(email.trim());
    }

    private static String urlEncode(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e); // UTF-8 always exists
        }
    }
}
