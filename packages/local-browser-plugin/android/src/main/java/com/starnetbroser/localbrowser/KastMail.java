package com.starnetbroser.localbrowser;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 💳 KAST card mail in the linked Gmail («بريد الرموز»): the two kinds KAST sends (real,
 * confirmed screenshots) - «تم رفض عملية بطاقتك» (a payment to a merchant refused, with the card's
 * last 4 digits and the USD amount) and «لقد تلقيت دولارات من …» (dollars received, with the
 * sender). KAST sends nothing when a payment goes through. Pure (reads the Gmail API's JSON) so
 * it is unit-tested; nothing is stored or logged but the few fields below.
 */
final class KastMail {

    private KastMail() {}

    /** KAST's own mail of the last 2 days (codes and the rest are told apart by parse). */
    static final String QUERY = "from:kast newer_than:2d";

    static String listUrl() {
        try {
            return "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=" + URLEncoder.encode(QUERY, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            return "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20";
        }
    }

    enum Kind { DECLINED, RECEIVED, SPENT }

    static final class Message {
        final String id;
        final long at;
        final Kind kind;
        /** USD. */
        final double amount;
        /** DECLINED: the card's last 4 digits ("" when not shown). */
        final String cardLast4;
        /** DECLINED: who was paid, e.g. "STARLINK INTERNET". */
        final String merchant;
        /** RECEIVED: who sent the dollars. */
        final String sender;

        Message(String id, long at, Kind kind, double amount, String cardLast4, String merchant, String sender) {
            this.id = id;
            this.at = at;
            this.kind = kind;
            this.amount = amount;
            this.cardLast4 = cardLast4;
            this.merchant = merchant;
            this.sender = sender;
        }

        boolean isStarlink() {
            return merchant.toUpperCase(Locale.ROOT).contains("STARLINK");
        }
    }

    private static final Pattern DECLINED = Pattern.compile("رفض|declined|was not successful|failed", Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED = Pattern.compile("تلقيت|استلمت|you(?:'ve| have)? (?:just )?received", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT = Pattern.compile("(?:المبلغ|amount)\\s*[:：]?\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED_AMOUNT = Pattern.compile("(?:استلمت للتو|received)\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CARD = Pattern.compile("(?:تنتهي بـ?|ending (?:in|with))\\s*\\*?\\s*([0-9]{4})", Pattern.CASE_INSENSITIVE);
    private static final Pattern MERCHANT_AR = Pattern.compile("دفعتك إلى\\s+(.+?)\\s+باستخدام");
    private static final Pattern MERCHANT_EN = Pattern.compile("payment to\\s+(.+?)\\s+(?:using|with|was)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENDER = Pattern.compile("(?:اسم المرسل|sender(?: name)?)\\s*[:：]\\s*([^\\n]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENDER_SUBJECT = Pattern.compile("(?:دولارات من|dollars from|from)\\s+([^!\\n]+)!?", Pattern.CASE_INSENSITIVE);

    // ---- the KAST app's own notifications (real, confirmed screenshots) ----
    //  «Kah-ching 🤑» / «صرفت 116.56$ في Starlink» (paid - KAST mails nothing for it)
    //  «تم رفض البطاقة في STARLINK INTERNET» / «تم رفض دفعتك البالغة USD 43.45 إلى STARLINK INTERNET باستخدام البطاقة 7932.»
    //  «لقد تلقيت أموالاً» / «لقد تلقيت إيداعاً بقيمة USDT 187.81. …»
    private static final Pattern N_SPENT = Pattern.compile("صرفت\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*\\$?\\s*(?:في|لدى|عند)\\s+([^\\n]+)"
        + "|you spent\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*\\$?\\s*(?:at|on)\\s+([^\\n]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern N_DECLINED = Pattern.compile("(?:البالغة|of)\\s*(?:USD|\\$)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:USD|\\$)?\\s*(?:إلى|to)\\s+(.+?)\\s+(?:باستخدام|using|with)", Pattern.CASE_INSENSITIVE);
    private static final Pattern N_CARD = Pattern.compile("(?:البطاقة|card(?: ending(?: in)?)?)\\s*\\*?\\s*([0-9]{4})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern N_RECEIVED = Pattern.compile("(?:تلقيت إيداعاً بقيمة|تلقيت|received(?: a deposit of)?)\\s*(?:USDT|USDC|USD|\\$)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)", Pattern.CASE_INSENSITIVE);

    /** A KAST app notification → an event, or null (a transfer out, a promotion, anything else). */
    static Message fromNotification(String title, String text, long at) {
        String t = title == null ? "" : title;
        String body = text == null ? "" : text;
        String all = (t + "\n" + body).replace('\u00a0', ' ');
        Matcher spent = N_SPENT.matcher(all);
        if (spent.find()) {
            String amount = spent.group(1) != null ? spent.group(1) : spent.group(3);
            String merchant = (spent.group(2) != null ? spent.group(2) : spent.group(4)).replaceAll("[.!]+$", "").trim();
            Double usd = toNumber(amount);
            if (usd == null) return null;
            return new Message(noticeId("spent", usd, "", merchant, at), at, Kind.SPENT, usd, group(N_CARD, all), merchant, "");
        }
        if (DECLINED.matcher(all).find()) {
            Matcher d = N_DECLINED.matcher(all);
            if (!d.find()) return null;
            Double usd = toNumber(d.group(1));
            if (usd == null) return null;
            String card = group(N_CARD, all);
            String merchant = d.group(2).trim();
            return new Message(noticeId("declined", usd, card, merchant, at), at, Kind.DECLINED, usd, card, merchant, "");
        }
        if (Pattern.compile("تلقيت|received", Pattern.CASE_INSENSITIVE).matcher(all).find()) {
            Double usd = number(N_RECEIVED, all);
            if (usd == null) return null;
            return new Message(noticeId("received", usd, "", "", at), at, Kind.RECEIVED, usd, "", "", "");
        }
        return null;
    }

    /** The same event (KAST repeats a notification when the shade is redrawn) keeps one id - the
     * minute it was posted is part of it, so the same amount on another day is a new event. */
    static String noticeId(String kind, double amount, String card, String merchant, long at) {
        return "n:" + kind + ":" + String.format(Locale.ROOT, "%.2f", amount) + ":" + card + ":" + merchant.toUpperCase(Locale.ROOT) + ":" + (at / 60_000L);
    }

    private static Double toNumber(String s) {
        try {
            return s == null ? null : Double.parseDouble(s.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** One message (format=full) → a KAST card event, or null (a code, a newsletter, someone else's mail). */
    static Message parse(String messageJson) {
        try {
            JSONObject message = new JSONObject(messageJson);
            JSONObject payload = message.optJSONObject("payload");
            String subject = "";
            boolean fromKast = false;
            if (payload != null) {
                JSONArray headers = payload.optJSONArray("headers");
                for (int i = 0; headers != null && i < headers.length(); i++) {
                    JSONObject h = headers.getJSONObject(i);
                    if ("subject".equalsIgnoreCase(h.optString("name"))) subject = h.optString("value");
                    if ("from".equalsIgnoreCase(h.optString("name"))) fromKast = h.optString("value").toLowerCase(Locale.ROOT).contains("kast");
                }
            }
            if (!fromKast) return null;
            StringBuilder body = new StringBuilder();
            if (payload != null) GmailCodes.appendBody(payload, body);
            String text = (subject + "\n" + message.optString("snippet", "") + "\n" + body).replace(' ', ' ');
            String id = message.optString("id", "");
            long at = message.optLong("internalDate", 0);
            if (DECLINED.matcher(subject).find() || DECLINED.matcher(text).find() && !RECEIVED.matcher(subject).find()) {
                Double amount = number(AMOUNT, text);
                if (amount == null) return null;
                return new Message(id, at, Kind.DECLINED, amount, group(CARD, text), merchant(text), "");
            }
            if (RECEIVED.matcher(subject).find() || RECEIVED.matcher(text).find()) {
                Double amount = number(AMOUNT, text);
                if (amount == null) amount = number(RECEIVED_AMOUNT, text);
                if (amount == null) return null;
                String sender = group(SENDER, text);
                if (sender.isEmpty()) sender = group(SENDER_SUBJECT, subject);
                return new Message(id, at, Kind.RECEIVED, amount, "", "", sender);
            }
            return null;
        } catch (JSONException e) {
            return null;
        }
    }

    private static String merchant(String text) {
        String m = group(MERCHANT_AR, text);
        if (m.isEmpty()) m = group(MERCHANT_EN, text);
        return m;
    }

    private static String group(Pattern p, String text) {
        Matcher m = p.matcher(text);
        return m.find() ? m.group(1).replaceAll("\\s+", " ").trim() : "";
    }

    private static Double number(Pattern p, String text) {
        Matcher m = p.matcher(text);
        if (!m.find()) return null;
        try {
            return Double.parseDouble(m.group(1).replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
