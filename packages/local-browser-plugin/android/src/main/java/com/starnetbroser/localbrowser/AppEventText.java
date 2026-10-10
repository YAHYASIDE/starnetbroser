package com.starnetbroser.localbrowser;

/**
 * Pure: how an app event's text (often a multi-line Telegram message) becomes a phone
 * notification - the first non-empty line is the title, the rest the body - and the page a tap
 * opens. No android.* import, so it's JUnit-tested.
 */
final class AppEventText {

    static final String REPS_ROUTE = "/representatives";
    static final String HOME_ROUTE = "/";
    private static final int MAX_TITLE = 90;

    private AppEventText() {
    }

    /** [title, body]; the body repeats the title when the text is a single line. */
    static String[] titleAndBody(String text) {
        String clean = text == null ? "" : text.replace("\r", "").trim();
        if (clean.isEmpty()) return new String[] {"STAR NET", ""};
        int newline = clean.indexOf('\n');
        String title = (newline < 0 ? clean : clean.substring(0, newline)).trim();
        String body = newline < 0 ? clean : clean.substring(newline + 1).trim();
        if (body.isEmpty()) body = title;
        if (title.length() > MAX_TITLE) title = title.substring(0, MAX_TITLE - 1) + "…";
        return new String[] {title, body};
    }

    /** The home screen searching for one device ("/?q=name"), so a tap lands on its card. */
    static String deviceRoute(String deviceName) {
        String name = deviceName == null ? "" : deviceName.trim();
        if (name.isEmpty()) return HOME_ROUTE;
        try {
            return "/?q=" + java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return HOME_ROUTE;
        }
    }

    /** A safe in-app route ("/settings", "/?q=x" - same rule as PhoneShortcuts.isRoute, never
     * "//host" or a full URL), or the home screen. */
    static String safeRoute(String route) {
        boolean ok = route != null && route.length() <= 200 && route.startsWith("/") && !route.startsWith("//") && !route.contains("\n");
        return ok ? route : HOME_ROUTE;
    }
}
