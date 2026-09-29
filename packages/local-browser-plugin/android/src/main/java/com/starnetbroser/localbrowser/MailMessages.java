package com.starnetbroser.localbrowser;

import java.util.List;
import java.util.regex.Pattern;

/** Pure helpers over messages read from Gmail: body text, a short preview, the Starlink code. */
final class MailMessages {

    private static final Pattern TAGS = Pattern.compile("(?is)<(script|style)[^>]*>.*?</\\1>|<[^>]+>");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\x0B\\f\\u00A0]+");
    private static final Pattern BLANK_LINES = Pattern.compile("\\n\\s*\\n+");
    static final int MAX_TEXT = 4000;

    private MailMessages() {}

    /** Readable text of an HTML body: tags removed, common entities decoded, spaces collapsed. */
    static String htmlToText(String html) {
        if (html == null) return "";
        String s = html.replaceAll("(?i)<br\\s*/?>|</p>|</div>|</tr>|</h\\d>", "\n");
        s = TAGS.matcher(s).replaceAll(" ");
        s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'");
        return tidy(s);
    }

    static String tidy(String text) {
        if (text == null) return "";
        String s = SPACES.matcher(text.replace("\r", "")).replaceAll(" ").replaceAll(" *\n *", "\n");
        s = BLANK_LINES.matcher(s).replaceAll("\n\n").trim();
        return s.length() > MAX_TEXT ? s.substring(0, MAX_TEXT) : s;
    }

    /** One line of preview under the subject. */
    static String preview(String text, int max) {
        String line = text == null ? "" : text.replace('\n', ' ').trim();
        return line.length() > max ? line.substring(0, max) + "…" : line;
    }

    /** The verification code a message carries (sender, subject and body read together). */
    static String codeOf(MailMessage m) {
        return MailCode.find(m.from + "\n" + m.subject + "\n" + m.text);
    }

    /**
     * The newest code among messages received at/after `sinceMillis` (the moment Starlink's
     * two-step page appeared, minus a margin) that was not already tried on this device -
     * so an old code sitting in the inbox is never typed. Messages are newest first.
     */
    static String newCode(List<MailMessage> newestFirst, long sinceMillis, String tried) {
        for (MailMessage m : newestFirst) {
            if (m.receivedAt < sinceMillis) break;
            String code = codeOf(m);
            if (StarlinkTwoStep.isNew(code, tried)) return code;
        }
        return null;
    }

    /** The newest code in the inbox at all («📋 نسخ الرمز»). */
    static String newestCode(List<MailMessage> newestFirst) {
        for (MailMessage m : newestFirst) {
            String code = codeOf(m);
            if (code != null) return code;
        }
        return null;
    }
}
