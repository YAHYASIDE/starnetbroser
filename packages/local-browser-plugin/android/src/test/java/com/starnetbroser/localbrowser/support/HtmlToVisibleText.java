package com.starnetbroser.localbrowser.support;

import java.util.regex.Pattern;

/**
 * Test-only simulation of what a real WebView's document.body.innerText would produce for a
 * given HTML string. Production code (AccountBrowserActivity) never runs this - it reads real
 * innerText directly from the live WebView via evaluateJavascript. This exists purely so JUnit
 * tests can start from literal HTML fixtures instead of hand-written flattened text, without
 * needing an actual browser engine in the JVM.
 */
public final class HtmlToVisibleText {

    private static final Pattern SCRIPT_OR_STYLE = Pattern.compile("(?is)<(script|style)\\b[^>]*>.*?</\\1>");
    private static final Pattern BLOCK_BREAK = Pattern.compile(
        "(?i)</(div|p|li|tr|h1|h2|h3|h4|h5|h6|section|header|footer|table)>|<br\\s*/?>"
    );
    private static final Pattern ANY_TAG = Pattern.compile("<[^>]+>");

    private HtmlToVisibleText() {
    }

    public static String convert(String html) {
        String withoutScripts = SCRIPT_OR_STYLE.matcher(html).replaceAll("");
        String withBreaks = BLOCK_BREAK.matcher(withoutScripts).replaceAll("\n");
        String withoutTags = ANY_TAG.matcher(withBreaks).replaceAll("");
        String decoded = withoutTags
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");

        StringBuilder result = new StringBuilder();
        for (String line : decoded.split("\n")) {
            String trimmed = line.trim().replaceAll("[ \\t]+", " ");
            if (!trimmed.isEmpty()) {
                result.append(trimmed).append('\n');
            }
        }
        return result.toString();
    }
}
