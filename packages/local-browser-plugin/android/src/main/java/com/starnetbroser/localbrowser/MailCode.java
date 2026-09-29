package com.starnetbroser.localbrowser;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds the newest Starlink verification code on the open mailbox page (its visible text): the
 * first 4-8 digit number on a line that mentions Starlink or a code, or within the next few lines
 * of one (Outlook's list shows sender, subject and a preview on separate lines, newest first).
 * Years, times, dates and long numbers (phones, KIT/SN) are skipped. Pure, unit-tested; the text
 * never leaves the phone and is never logged.
 */
public final class MailCode {

    private static final Pattern CODE = Pattern.compile("(?<![\\d.:/,+-])(\\d{4,8})(?![\\d:/,]|\\.\\d)");
    private static final Pattern HINT = Pattern.compile(
        "starlink|verification|verify|one[- ]time|passcode|security code|\\bcode\\b|\\bOTP\\b|رمز|كود|تحقق|التحقق",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /** How many lines after a hint line may still hold its code (subject -> preview). */
    private static final int LOOKAHEAD = 4;

    private MailCode() {}

    /** The code, or null when the page shows none. */
    public static String find(String pageText) {
        if (pageText == null || pageText.isEmpty()) return null;
        String[] lines = pageText.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            if (!HINT.matcher(lines[i]).find()) continue;
            for (int j = i; j < Math.min(lines.length, i + 1 + LOOKAHEAD); j++) {
                String code = codeIn(lines[j]);
                if (code != null) return code;
            }
        }
        return null;
    }

    private static String codeIn(String line) {
        Matcher m = CODE.matcher(toLatinDigits(line));
        while (m.find()) {
            String digits = m.group(1);
            if (digits.length() == 4) {
                int n = Integer.parseInt(digits);
                if (n >= 1900 && n <= 2100) continue; // a year
            }
            return digits;
        }
        return null;
    }

    private static String toLatinDigits(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '٠' && c <= '٩') out.append((char) ('0' + (c - '٠')));
            else if (c >= '۰' && c <= '۹') out.append((char) ('0' + (c - '۰')));
            else out.append(c);
        }
        return out.toString().toLowerCase(Locale.ROOT);
    }
}
