package com.starnetbroser.localbrowser;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 📨 «بريد الرموز»: the shop's Gmail (starnet.om@gmail.com by default), where Microsoft sends its
 * verification codes (a new Outlook's recovery email, a sign-in check). Read through the Gmail API
 * with the read-only scope after the operator linked it once in Settings - Google refuses its
 * sign-in inside an app's web view, so it can't be opened like «📧 البريد». The pure part lives
 * here (URLs, reading the API's JSON, finding the code - MailCode); nothing is stored or logged.
 */
final class GmailCodes {

    private GmailCodes() {}

    static final String SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
    static final String PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
    private static final String MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

    /** Gmail's search for the code messages: Microsoft's own senders only (a card's or a shop's
     * message of the same minute must never be read as the code - real screenshot), last day. */
    static final String QUERY = "newer_than:1d (from:microsoft.com OR from:accountprotection.microsoft.com OR from:account.microsoft.com OR from:live.com)";

    /** The newest few of Microsoft's messages of the last day - codes are only ever fresh. */
    static String listUrl() {
        try {
            return MESSAGES_URL + "?maxResults=8&q=" + URLEncoder.encode(QUERY, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            return MESSAGES_URL + "?maxResults=8";
        }
    }

    // ---- 📧 a device's own Gmail: Starlink's two-step codes ----

    /** Starlink's own messages of the last day (its codes come from starlink.com / spacex.com). */
    static final String STARLINK_QUERY = "newer_than:1d (from:starlink.com OR from:spacex.com)";

    static String starlinkListUrl() {
        try {
            return MESSAGES_URL + "?maxResults=5&q=" + URLEncoder.encode(STARLINK_QUERY, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            return MESSAGES_URL + "?maxResults=5";
        }
    }

    static boolean isStarlinkSender(String from) {
        if (from == null) return false;
        String lower = from.toLowerCase(Locale.ROOT);
        return lower.contains("starlink.com") || lower.contains("spacex.com");
    }

    /** Starlink's code in one message (format=full) received at or after `sinceMs`, or null. Only a
     * message from Starlink counts. */
    static String starlinkCodeIn(String messageJson, long sinceMs) {
        try {
            JSONObject message = new JSONObject(messageJson);
            if (message.optLong("internalDate", 0) < sinceMs) return null;
            StringBuilder text = new StringBuilder();
            JSONObject payload = message.optJSONObject("payload");
            boolean fromStarlink = false;
            if (payload != null) {
                JSONArray headers = payload.optJSONArray("headers");
                if (headers != null) {
                    for (int i = 0; i < headers.length(); i++) {
                        JSONObject h = headers.getJSONObject(i);
                        String name = h.optString("name");
                        if ("subject".equalsIgnoreCase(name)) text.append(h.optString("value")).append('\n');
                        if ("from".equalsIgnoreCase(name)) fromStarlink = isStarlinkSender(h.optString("value"));
                    }
                }
            }
            if (!fromStarlink) return null;
            text.append(message.optString("snippet", "")).append('\n');
            if (payload != null) appendBody(payload, text);
            return MailCode.find(text.toString());
        } catch (JSONException e) {
            return null;
        }
    }

    /** 💳 The card company's code for confirming a card on Starlink: the mail no-reply sends to
     * the card's billing Gmail («STARLINK INTERNET … confirm your payment … code»). Searched by
     * content (the payment processor's sender varies), of the last hour only. */
    static final String PAYMENT_QUERY = "newer_than:1h (\"STARLINK INTERNET\" OR \"confirm your payment\" OR \"confirm the following payment\")";

    static String paymentListUrl() {
        try {
            return MESSAGES_URL + "?maxResults=5&q=" + URLEncoder.encode(PAYMENT_QUERY, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            return MESSAGES_URL + "?maxResults=5";
        }
    }

    /** The card-payment code in one message (format=full) received at or after `sinceMs`, or null.
     * Reuses PaymentCode (subject as the title, the full body as the text); KAST's own codes are
     * never this one. */
    static String paymentCodeIn(String messageJson, long sinceMs) {
        try {
            JSONObject message = new JSONObject(messageJson);
            if (message.optLong("internalDate", 0) < sinceMs) return null;
            StringBuilder subject = new StringBuilder();
            StringBuilder body = new StringBuilder();
            JSONObject payload = message.optJSONObject("payload");
            if (payload != null) {
                JSONArray headers = payload.optJSONArray("headers");
                if (headers != null) {
                    for (int i = 0; i < headers.length(); i++) {
                        JSONObject h = headers.getJSONObject(i);
                        if ("subject".equalsIgnoreCase(h.optString("name"))) subject.append(h.optString("value"));
                    }
                }
            }
            body.append(message.optString("snippet", "")).append('\n');
            if (payload != null) appendBody(payload, body);
            return PaymentCode.fromNotification(subject.toString(), body.toString());
        } catch (JSONException e) {
            return null;
        }
    }

    static String messageUrl(String id) {
        return MESSAGES_URL + "/" + id + "?format=full";
    }

    /** The message ids of a list response, newest first (the API's own order). */
    static List<String> parseIds(String listJson) {
        List<String> ids = new ArrayList<>();
        try {
            JSONArray messages = new JSONObject(listJson).optJSONArray("messages");
            if (messages == null) return ids;
            for (int i = 0; i < messages.length(); i++) {
                String id = messages.getJSONObject(i).optString("id", "");
                if (!id.isEmpty()) ids.add(id);
            }
        } catch (JSONException ignored) {
            // an unreadable answer has no ids
        }
        return ids;
    }

    /** The account the token belongs to (users/me/profile), lower-cased, or "". */
    static String profileEmail(String profileJson) {
        try {
            return new JSONObject(profileJson).optString("emailAddress", "").trim().toLowerCase(Locale.ROOT);
        } catch (JSONException e) {
            return "";
        }
    }

    /** Microsoft's own "Security code: 202169" / "code is: 583120" line - the surest reading. */
    private static final java.util.regex.Pattern CODE_LINE = java.util.regex.Pattern.compile(
        "(?:security code|verification code|single-use code|code is|your code|رمز الأمان|رمز التحقق|الرمز)\\s*(?:is)?\\s*[:：]?\\s*(\\d{4,8})\\b",
        java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CASE);

    /** The code in one message (format=full) received at or after `sinceMs`, or null. Only a
     * message from Microsoft (its From header) counts: anything else of the same minute (a card,
     * a shop) is skipped even if it carries numbers. */
    static String codeIn(String messageJson, long sinceMs) {
        try {
            JSONObject message = new JSONObject(messageJson);
            long at = message.optLong("internalDate", 0);
            if (at < sinceMs) return null;
            StringBuilder text = new StringBuilder();
            JSONObject payload = message.optJSONObject("payload");
            boolean fromMicrosoft = false;
            if (payload != null) {
                JSONArray headers = payload.optJSONArray("headers");
                if (headers != null) {
                    for (int i = 0; i < headers.length(); i++) {
                        JSONObject h = headers.getJSONObject(i);
                        String name = h.optString("name");
                        if ("subject".equalsIgnoreCase(name)) text.append(h.optString("value")).append('\n');
                        if ("from".equalsIgnoreCase(name)) fromMicrosoft = isMicrosoftSender(h.optString("value"));
                    }
                }
            }
            if (!fromMicrosoft) return null;
            text.append(message.optString("snippet", "")).append('\n');
            if (payload != null) appendBody(payload, text);
            String all = text.toString();
            java.util.regex.Matcher m = CODE_LINE.matcher(all);
            if (m.find()) return m.group(1);
            return MailCode.find(all);
        } catch (JSONException e) {
            return null;
        }
    }

    /** "Microsoft account team <account-security-noreply@accountprotection.microsoft.com>" and
     * the like - never a card, a shop or a newsletter. */
    static boolean isMicrosoftSender(String from) {
        if (from == null) return false;
        String lower = from.toLowerCase(Locale.ROOT);
        return lower.contains("@accountprotection.microsoft.com") || lower.contains("@account.microsoft.com")
            || lower.contains("@microsoft.com") || lower.contains("@live.com") || lower.contains("@outlook.com")
            || lower.contains("@email.microsoft.com") || lower.contains("@microsoftonline.com");
    }

    /** The plain text of every part (HTML with its tags dropped), one line per block. */
    static void appendBody(JSONObject part, StringBuilder out) throws JSONException {
        String mime = part.optString("mimeType", "");
        JSONObject body = part.optJSONObject("body");
        String data = body != null ? body.optString("data", "") : "";
        if (!data.isEmpty() && mime.startsWith("text/")) {
            String decoded = new String(decodeBase64Url(data), StandardCharsets.UTF_8);
            if (mime.equals("text/html")) {
                decoded = decoded.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                    .replaceAll("(?i)<br\\s*/?>|</(p|div|tr|td|h\\d|li)>", "\n")
                    .replaceAll("<[^>]+>", " ")
                    .replace("&nbsp;", " ");
            }
            out.append(decoded).append('\n');
        }
        JSONArray parts = part.optJSONArray("parts");
        if (parts != null) {
            for (int i = 0; i < parts.length(); i++) appendBody(parts.getJSONObject(i), out);
        }
    }

    /** Base64url (the API's encoding) without java.util.Base64, which this app's oldest Androids lack. */
    static byte[] decodeBase64Url(String data) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int buffer = 0;
        int bits = 0;
        for (int i = 0; i < data.length(); i++) {
            char c = data.charAt(i);
            int v;
            if (c >= 'A' && c <= 'Z') v = c - 'A';
            else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
            else if (c >= '0' && c <= '9') v = c - '0' + 52;
            else if (c == '-' || c == '+') v = 62;
            else if (c == '_' || c == '/') v = 63;
            else continue; // padding, line breaks
            buffer = (buffer << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write((buffer >> bits) & 0xFF);
            }
        }
        return out.toByteArray();
    }

    /** Microsoft's own sign-in / signup / account-check pages (login., signup., account.live.com,
     * account.microsoft.com) - where it asks for a code; never the Outlook inbox itself. */
    static boolean isMicrosoftStep(String url) {
        if (!MailUrl.isAllowed(url)) return false;
        try {
            String host = new java.net.URI(url).getHost().toLowerCase(Locale.ROOT);
            return host.startsWith("login.") || host.startsWith("signup.") || host.equals("account.live.com")
                || host.equals("account.microsoft.com") || host.endsWith(".account.microsoft.com");
        } catch (java.net.URISyntaxException | NullPointerException e) {
            return false;
        }
    }

    /** The shop's Gmail where Microsoft sends its codes - typed into «Add an email address» (the
     * account has no recovery email yet) on Microsoft's own steps, in «📧 البريد» too, not only at
     * signup. Only the empty field; nothing is pressed. */
    static String recoveryEmailScript(String email) {
        if (email == null || email.trim().isEmpty()) return null;
        return "(function(r){"
            + "var h=document.querySelectorAll('h1,h2,[role=heading]'),t='';for(var i=0;i<h.length;i++){var b=h[i].getBoundingClientRect();if(b.width>0&&b.height>0)t+=' '+h[i].textContent;}"
            // «Add an email address», or «Verify your email» ("We'll send a code to st*****@gmail.com" -
            // the masked address is the recovery email itself; real screenshot).
            + "var masked=/\\*{2,}@/.test((document.body&&document.body.innerText)||'');"
            + "if(!masked&&!" + RECOVERY_HEADINGS + ".test(t))return 'no';"
            + "var l=document.querySelectorAll('input[type=email],input[type=text],input:not([type])');"
            + "for(var j=0;j<l.length;j++){var el=l[j],c=el.getBoundingClientRect();if(c.width===0||c.height===0||el.disabled||el.readOnly)continue;"
            + "if(/password|كلمة/i.test([el.name,el.id,el.placeholder,el.getAttribute('aria-label')].join(' ')))continue;"
            + "if(el.value===r)return 'has';"
            // Whatever is there (the device's own email, typed by the sign-in autofill) is wrong here.
            + "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();s.call(el,r);"
            + "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';}"
            + "return 'no';})(" + LoginAutofill.literal(email.trim()) + ")";
    }

    /** The headings of Microsoft's recovery-email steps (shared with LoginAutofill, which must not
     * type the device's own email there). */
    static final String RECOVERY_HEADINGS =
        "/add an email|recovery|security info|protect your account|alternate email|verify your email|بريد.{0,12}(استرداد|بديل)|أضف عنوان بريد|تحقق من بريدك/i";

    /** Microsoft's "enter the code we sent" pages (a new email's check, a sign-in check):
     * "1" = the page with an empty code box, "2" = filled, "0" = not that page. */
    static final String DETECT_SCRIPT = "(function(){"
        + "var t=((document.body&&document.body.innerText)||'').toLowerCase();"
        + "if(!/verify your email|enter (the )?code|enter your code|security code|we sent a code|we've sent a code|verification code|"
        + "\\u0623\\u062f\\u062e\\u0644 \\u0627\\u0644\\u0631\\u0645\\u0632|\\u0631\\u0645\\u0632 \\u0627\\u0644\\u062a\\u062d\\u0642\\u0642|\\u0631\\u0645\\u0632 \\u0627\\u0644\\u0623\\u0645\\u0627\\u0646/.test(t))return '0';"
        + "var ins=[].slice.call(document.querySelectorAll('input')).filter(function(x){var ty=(x.type||'text').toLowerCase();var r=x.getBoundingClientRect();"
        + "return (ty==='text'||ty==='tel'||ty==='number')&&r.width>0&&r.height>0&&!x.disabled;});"
        + "if(!ins.length)return '0';return ins.every(function(x){return x.value;})?'2':'1';})()";

    /** Types the code into the code box - or one digit per box when the page shows a row of
     * one-character boxes - React-safe. Presses nothing: the operator taps «Next». */
    static String fillScript(String code) {
        return "(function(c){"
            + "var ins=[].slice.call(document.querySelectorAll('input')).filter(function(x){var ty=(x.type||'text').toLowerCase();var r=x.getBoundingClientRect();"
            + "return (ty==='text'||ty==='tel'||ty==='number')&&r.width>0&&r.height>0&&!x.disabled;});"
            + "if(!ins.length)return 'no-input';"
            + "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "function put(el,v){el.focus();s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}"
            + "var boxes=ins.filter(function(x){return x.maxLength===1;});"
            + "if(boxes.length>=c.length){for(var i=0;i<c.length;i++)put(boxes[i],c.charAt(i));return 'ok';}"
            + "var el=ins.filter(function(x){return /one-time|otp|code|\\u0631\\u0645\\u0632/i.test([x.autocomplete,x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' '));})[0]||ins[0];"
            + "put(el,c);return 'ok';})(" + LoginAutofill.literal(code) + ");";
    }
}
