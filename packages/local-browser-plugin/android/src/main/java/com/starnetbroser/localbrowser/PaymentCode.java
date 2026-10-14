package com.starnetbroser.localbrowser;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 💳 The card company's code for confirming a card on Starlink (his screenshots): a mail from
 * «no-reply», subject «STARLINK INTERNET», «Please confirm your payment of €0.00 to STARLINK
 * INTERNET using the following code: ######». KAST's own codes («Your KAST verification code»,
 * for unfreezing a card) are never this one. Read from the phone's mail notification or from what
 * he copied; kept in memory for the open card step only, never stored or logged. Pure, JUnit-tested.
 */
final class PaymentCode {

    private PaymentCode() {}

    private static final Pattern PAYMENT = Pattern.compile(
        "confirm (the following|your) payment|payment of|verify (this )?transaction|starlink internet|purchase|paiement|achat",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern KAST_CODE = Pattern.compile("kast verification|\\bkast\\b.{0,20}\\bcode\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_AFTER_WORD = Pattern.compile(
        "(?:code|passcode|otp|رمز|الرمز)\\D{0,40}?(?<![\\d.,])(\\d{4,8})(?![\\d.,])", Pattern.CASE_INSENSITIVE);
    private static final Pattern ONLY_DIGITS = Pattern.compile("^\\s*(\\d{4,8})\\s*$");

    /** The code in a mail / SMS notification about the card payment, or null. */
    static String fromNotification(String title, String text) {
        String all = (title == null ? "" : title) + "\n" + (text == null ? "" : text);
        if (KAST_CODE.matcher(all).find()) return null;
        if (!PAYMENT.matcher(all).find()) return null;
        Matcher m = CODE_AFTER_WORD.matcher(toLatinDigits(all));
        return m.find() ? m.group(1) : null;
    }

    /** What he copied («نسخ الرمز»): only a bare 4-8 digit code. */
    static String fromClipboard(String text) {
        if (text == null) return null;
        Matcher m = ONLY_DIGITS.matcher(toLatinDigits(text));
        return m.matches() ? m.group(1) : null;
    }

    /** The last 4 digits of a saved card's payload ({"number":"…"}), or null. */
    static String last4OfPayload(String payload) {
        if (payload == null) return null;
        Matcher m = Pattern.compile("\"number\"\\s*:\\s*\"([^\"]*)\"").matcher(payload);
        if (!m.find()) return null;
        String digits = m.group(1).replaceAll("\\D", "");
        return digits.length() >= 4 ? digits.substring(digits.length() - 4) : null;
    }

    private static String toLatinDigits(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            if (c >= '٠' && c <= '٩') out.append((char) ('0' + c - '٠'));
            else if (c >= '۰' && c <= '۹') out.append((char) ('0' + c - '۰'));
            else out.append(c);
        }
        return out.toString();
    }
}
