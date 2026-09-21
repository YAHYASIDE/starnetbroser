package com.starnetbroser.localbrowser;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stage 1 of on-device Starlink account sync: turns the visible text of an
 * already-loaded, already-allow-listed Starlink page into a small set of
 * named fields, using bilingual (Arabic/English) label keywords rather
 * than CSS classes (which this page's actual markup is not under this
 * project's control and can change at any time).
 *
 * Input is exactly what the WebView's own `document.body.innerText`
 * returns for the page as rendered right now - this is deliberate: it is
 * "only what's visible inside the WebView", handles JS-rendered content
 * correctly, and needs no extra network request of its own.
 *
 * IMPORTANT: the label/keyword lists below are a best-effort first pass
 * based on the field names this feature was specified against, not
 * something verified against the real starlink.com page - nothing in
 * this development environment can load or inspect that page. Treat this
 * as a deliberately narrow, easy-to-extend starting point that needs
 * real-device tuning, not a finished parser.
 */
public final class StarlinkFieldExtractor {

    public static final String FIELD_DISH_STATUS = "dishStatus"; // "online" | "offline"
    public static final String FIELD_WIFI_STATUS = "wifiStatus"; // "online" | "offline"
    public static final String FIELD_PLAN_NAME = "planName";
    public static final String FIELD_RENEWAL_DATE = "renewalDate";
    public static final String FIELD_BALANCE_DUE = "balanceDue";
    public static final String FIELD_CURRENCY = "currency";
    public static final String FIELD_STARLINK_ID = "starlinkId";
    public static final String FIELD_SERIAL_NUMBER = "serialNumber";
    public static final String FIELD_KIT_NUMBER = "kitNumber";
    public static final String FIELD_SERVICE_STATUS = "serviceStatus"; // raw text, not interpreted
    public static final String FIELD_ACCOUNT_HOLDER_NAME = "accountHolderName";

    public static final class Result {
        /** false when sourceUrl isn't an allow-listed Starlink page - fields is always empty then. */
        public final boolean accepted;
        public final Map<String, String> fields;

        Result(boolean accepted, Map<String, String> fields) {
            this.accepted = accepted;
            this.fields = fields;
        }
    }

    private static final String[] DISH_LABELS = {"starlink dish", "dish", "الطبق", "طبق ستارلينك", "الهوائي"};
    private static final String[] WIFI_LABELS = {"wi-fi", "wifi", "router", "واي فاي", "الراوتر"};
    private static final String[] ONLINE_TOKENS = {"online", "connected", "متصل", "متصلة"};
    private static final String[] OFFLINE_TOKENS = {
        "offline", "disconnected", "not connected", "غير متصل", "غير متصلة", "منقطع", "منقطعة",
    };

    private static final String[] PLAN_LABELS = {"service plan", "plan", "الخطة", "باقة الخدمة", "الباقة"};
    private static final String[] RENEWAL_DATE_LABELS = {
        "renewal date", "next billing", "renews on", "service end",
        "تاريخ التجديد", "تجديد الاشتراك", "نهاية الخدمة", "موعد التجديد",
    };
    private static final String[] STARLINK_ID_LABELS = {
        "starlink id", "account id", "معرف starlink", "معرف ستارلينك", "رقم الحساب",
    };
    private static final String[] SERIAL_NUMBER_LABELS = {"serial number", "serial no", "الرقم التسلسلي"};
    private static final String[] KIT_NUMBER_LABELS = {"kit number", "kit no", "رقم الطقم", "رقم kit"};
    private static final String[] SERVICE_STATUS_LABELS = {
        "service status", "account status", "subscription status",
        "حالة الخدمة", "حالة الاشتراك", "حالة الحساب",
    };
    private static final String[] ACCOUNT_HOLDER_LABELS = {
        "account holder", "owner name", "customer name",
        "اسم صاحب الحساب", "اسم المالك", "اسم العميل",
    };
    private static final String[] BALANCE_LABELS = {
        "balance due", "amount due", "outstanding balance",
        "الرصيد المستحق", "المبلغ المستحق", "الرصيد",
    };

    private static final Pattern MONEY_PATTERN = Pattern.compile(
        "(?:(USD|USDT|SAR|MRU|US\\$|\\$|ر\\.س|ريال)\\s*([0-9]+(?:[.,][0-9]{1,2})?))"
            + "|(?:([0-9]+(?:[.,][0-9]{1,2})?)\\s*(USD|USDT|SAR|MRU|\\$|ر\\.س|ريال))"
    );

    private StarlinkFieldExtractor() {
    }

    public static Result extractFields(String sourceUrl, String visibleText) {
        if (!AllowedUrl.isAllowed(sourceUrl) || visibleText == null) {
            return new Result(false, new LinkedHashMap<String, String>());
        }

        String[] lines = normalizeLines(visibleText);
        Map<String, String> fields = new LinkedHashMap<>();

        putIfPresent(fields, FIELD_DISH_STATUS, extractOnlineOffline(lines, DISH_LABELS));
        putIfPresent(fields, FIELD_WIFI_STATUS, extractOnlineOffline(lines, WIFI_LABELS));
        putIfPresent(fields, FIELD_PLAN_NAME, extractLabeledValue(lines, PLAN_LABELS));
        putIfPresent(fields, FIELD_RENEWAL_DATE, extractLabeledValue(lines, RENEWAL_DATE_LABELS));
        putIfPresent(fields, FIELD_STARLINK_ID, extractLabeledValue(lines, STARLINK_ID_LABELS));
        putIfPresent(fields, FIELD_SERIAL_NUMBER, extractLabeledValue(lines, SERIAL_NUMBER_LABELS));
        putIfPresent(fields, FIELD_KIT_NUMBER, extractLabeledValue(lines, KIT_NUMBER_LABELS));
        putIfPresent(fields, FIELD_SERVICE_STATUS, extractLabeledValue(lines, SERVICE_STATUS_LABELS));
        putIfPresent(fields, FIELD_ACCOUNT_HOLDER_NAME, extractLabeledValue(lines, ACCOUNT_HOLDER_LABELS));

        String[] money = extractBalanceAndCurrency(lines);
        if (money != null) {
            fields.put(FIELD_BALANCE_DUE, money[0]);
            fields.put(FIELD_CURRENCY, money[1]);
        }

        return new Result(true, fields);
    }

    private static void putIfPresent(Map<String, String> fields, String key, String value) {
        if (value != null && !value.trim().isEmpty()) {
            fields.put(key, value.trim());
        }
    }

    private static String[] normalizeLines(String visibleText) {
        String[] rawLines = visibleText.split("\\r?\\n");
        return rawLines;
    }

    private static boolean containsAny(String line, String[] needles) {
        String lower = line.toLowerCase(Locale.ROOT);
        for (String needle : needles) {
            if (lower.contains(needle.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Looks for one of `labels` on a line; the value is either whatever follows the label on the
     * same line (after a ":"/"-" separator), or - the common "label on its own line, value on
     * the next" layout - the next non-empty line.
     */
    private static String extractLabeledValue(String[] lines, String[] labels) {
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String lower = line.toLowerCase(Locale.ROOT);
            for (String label : labels) {
                int idx = lower.indexOf(label.toLowerCase(Locale.ROOT));
                if (idx < 0) {
                    continue;
                }
                String afterLabel = stripLeadingSeparator(line.substring(idx + label.length()));
                if (!afterLabel.trim().isEmpty()) {
                    return afterLabel.trim();
                }
                for (int j = i + 1; j < lines.length; j++) {
                    String next = lines[j].trim();
                    if (!next.isEmpty()) {
                        return next;
                    }
                }
            }
        }
        return null;
    }

    private static String extractOnlineOffline(String[] lines, String[] labels) {
        for (int i = 0; i < lines.length; i++) {
            if (!containsAny(lines[i], labels)) {
                continue;
            }
            int windowEnd = Math.min(i + 3, lines.length);
            for (int j = i; j < windowEnd; j++) {
                if (containsAny(lines[j], OFFLINE_TOKENS)) {
                    return "offline";
                }
                if (containsAny(lines[j], ONLINE_TOKENS)) {
                    return "online";
                }
            }
        }
        return null;
    }

    private static String[] extractBalanceAndCurrency(String[] lines) {
        // Prefer a match on/near a line that actually says "balance" - falls back to scanning
        // everything only if that comes up empty, to reduce false positives from unrelated
        // numbers on the page (e.g. a plan's monthly price).
        for (int i = 0; i < lines.length; i++) {
            if (!containsAny(lines[i], BALANCE_LABELS)) {
                continue;
            }
            int windowEnd = Math.min(i + 2, lines.length);
            for (int j = i; j < windowEnd; j++) {
                String[] match = matchMoney(lines[j]);
                if (match != null) {
                    return match;
                }
            }
        }
        for (String line : lines) {
            String[] match = matchMoney(line);
            if (match != null) {
                return match;
            }
        }
        return null;
    }

    private static String[] matchMoney(String line) {
        Matcher matcher = MONEY_PATTERN.matcher(line);
        if (!matcher.find()) {
            return null;
        }
        if (matcher.group(1) != null) {
            return new String[] {matcher.group(2), normalizeCurrency(matcher.group(1))};
        }
        return new String[] {matcher.group(3), normalizeCurrency(matcher.group(4))};
    }

    private static String normalizeCurrency(String token) {
        String upper = token.toUpperCase(Locale.ROOT);
        if (upper.equals("US$") || upper.equals("$")) {
            return "$";
        }
        return token;
    }

    private static String stripLeadingSeparator(String s) {
        String trimmed = s;
        int i = 0;
        while (i < trimmed.length() && (Character.isWhitespace(trimmed.charAt(i))
            || trimmed.charAt(i) == ':' || trimmed.charAt(i) == '-' || trimmed.charAt(i) == '—')) {
            i++;
        }
        return trimmed.substring(i);
    }
}
