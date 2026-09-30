package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * What TelegramReplyService answers while the app is closed. The app prepares every answer
 * (texts, and the command words it understands) from the phone's data each time it is open and
 * hands them over as a Snapshot - so the wording and the rules stay in the app, and the service
 * only picks the right prepared text. A rep only ever gets the texts prepared for HIS repId.
 * Pure (no Android / org.json), unit-tested in TelegramRepliesTest.
 */
final class TelegramReplies {

    /** Prepared by the app (LocalBrowserPlugin#telegramSetReplies). */
    static final class Snapshot {
        /** "27/09 16:40" - when the app prepared it; shown under every data answer. */
        String at = "";
        String ownerHelp = "";
        String repHelp = "";
        /** "لم أفهم «{text}»." - put before the help. */
        String unknown = "";
        /** Owner asked for a statement PDF - it needs the app. */
        String statementLater = "";
        /** To someone not linked yet: "{name}". */
        String linkReply = "";
        /** To the owner, about a new link request: "{name}". */
        String linkNotice = "";
        /** Owner answers by command kind (stopped, expiring, cash, summary). */
        Map<String, String> owner = new HashMap<>();
        /** Every rep's answers: repId -> kind -> text. */
        Map<String, Map<String, String>> reps = new HashMap<>();
        /** Command word -> kind, as the app parses them. */
        Map<String, String> ownerWords = new HashMap<>();
        Map<String, String> repWords = new HashMap<>();
        /** The buttons kept at the bottom of a rep's chat (reply_markup JSON). */
        String repKeyboard = "";
        String searchHint = "";
        String paymentHint = "";
        String clientHint = "";
        /** ➕ New customers are added from the app now - the redirect the bot answers with. */
        String clientMoved = "";
        String requestReceived = "";
        String promiseHint = "";
        String promiseReceived = "";
        String promiseNotice = "";
        /** "{rep}", "{text}". */
        String requestNotice = "";
        /** ⚡ تفعيل choices ("ROM", "Sis", "100G"). */
        List<String> plans = new ArrayList<>();
        String activationHint = "";
        /** Every rep's own devices, for search: repId -> entries. */
        Map<String, List<SearchEntry>> repSearch = new HashMap<>();
        /** The reps' bots' @names ("" = not connected) - see repBots.ts. */
        String devicesBot = "";
        String moneyBot = "";
        String alertsBot = "";
        String moneyKeyboard = "";
        String moneyHelp = "";
        /** A money command typed in the devices bot once the money bot exists. */
        String moneyRedirect = "";
        String handoverHint = "";
        String handoverReceived = "";
        String alertsInfo = "";
    }

    /** One of a rep's devices: folded keys, its result card, and an optional WhatsApp button. */
    static final class SearchEntry {
        final String keys;
        final String text;
        final String buttonLabel;
        final String buttonUrl;
        /** Renewal date "yyyy-mm-dd" ("" when unknown), one-line form, renewal-reminder url. */
        final String date;
        final String line;
        final String reminderUrl;
        /** The device's id (its ⚡ تفعيل button), or "". */
        final String id;
        /** Reps only: the short header above the menu ("" = no menu, the old card), each menu
         * button's prepared text ("r", "p", "d", "i", "f", "s") and the editable fields' values. */
        final String header;
        final Map<String, String> sections;
        final Map<String, String> editValues;
        /** The device still owes Starlink (an open D): the 🅳 mark on alerts. */
        boolean hasD;
        /** WhatsApp: the customer's "stopped" message, and his debt reminder (or null). */
        String stoppedUrl;
        String debtUrl;

        SearchEntry(String keys, String text, String buttonLabel, String buttonUrl) {
            this(keys, text, buttonLabel, buttonUrl, null, null, null, null);
        }

        SearchEntry(String keys, String text, String buttonLabel, String buttonUrl, String date, String line, String reminderUrl) {
            this(keys, text, buttonLabel, buttonUrl, date, line, reminderUrl, null);
        }

        SearchEntry(String keys, String text, String buttonLabel, String buttonUrl, String date, String line, String reminderUrl, String id) {
            this(keys, text, buttonLabel, buttonUrl, date, line, reminderUrl, id, null, null, null);
        }

        SearchEntry(String keys, String text, String buttonLabel, String buttonUrl, String date, String line, String reminderUrl, String id,
                    String header, Map<String, String> sections, Map<String, String> editValues) {
            this.header = header == null ? "" : header;
            this.sections = sections == null ? new HashMap<>() : sections;
            this.editValues = editValues == null ? new HashMap<>() : editValues;
            this.keys = keys == null ? "" : keys;
            this.text = text == null ? "" : text;
            this.buttonLabel = buttonLabel;
            this.buttonUrl = buttonUrl;
            this.date = date == null ? "" : date;
            this.line = line == null ? "" : line;
            this.reminderUrl = reminderUrl;
            this.id = id == null ? "" : id;
        }

        boolean hasMenu() {
            return !header.isEmpty() && menuFits(id);
        }

        /** "📡 name" -> "name". */
        String deviceName() {
            String first = text.split("\n", 2)[0];
            return first.startsWith("📡 ") ? first.substring(3) : first;
        }
    }

    /** A typed day - mirrors DayQuery (telegramRepMessages.ts). */
    static final class DayQuery {
        final String date; // exact "yyyy-mm-dd", or null
        final int month; // 0 = any
        final int day;
        final String label;

        DayQuery(String date, int month, int day, String label) {
            this.date = date;
            this.month = month;
            this.day = day;
            this.label = label;
        }

        boolean matches(String entryDate) {
            if (entryDate == null || entryDate.length() != 10) return false;
            if (date != null) return date.equals(entryDate);
            int d = Integer.parseInt(entryDate.substring(8));
            int m = Integer.parseInt(entryDate.substring(5, 7));
            return d == day && (month == 0 || m == month);
        }
    }

    /** What to do with one message. */
    static final class Reply {
        /** Sent back to the same chat (null = nothing). */
        final String text;
        /** Also left for the app to finish when it opens (a PDF, recording a link request). */
        final boolean toInbox;
        /** To the owner's own chat as well (a new link request). */
        final String ownerNotice;
        /** Buttons for the reply (reply_markup JSON), or null. */
        final String markup;

        Reply(String text, boolean toInbox, String ownerNotice) {
            this(text, toInbox, ownerNotice, null);
        }

        Reply(String text, boolean toInbox, String ownerNotice, String markup) {
            this.text = text;
            this.toInbox = toInbox;
            this.ownerNotice = ownerNotice;
            this.markup = markup == null || markup.isEmpty() ? null : markup;
        }
    }

    static final String NOT_READY = "⏳ افتح تطبيق STAR NET مرة واحدة ليجهّز الردود، ثم أعد المحاولة.";

    private TelegramReplies() {
    }

    /** The text without "/", a leading emoji (keyboard buttons send "📡 أجهزتي") or the bot's
     * @name - only ever the one glued to a "/command" ("/start@my_bot"), never the "@gmail" of an
     * email being searched. Mirrors cleanRepText (telegramRepMessages.ts). */
    static String cleanText(String text) {
        if (text == null) return "";
        String cleaned = text.trim();
        if (cleaned.startsWith("/")) cleaned = cleaned.substring(1).replaceFirst("^(\\S+?)@\\w+", "$1");
        return cleaned.replaceFirst("^[^\\p{L}\\p{N}]+", "").trim();
    }

    /** "/Stopped@my_bot extra" -> "stopped": the first word of cleanText, lower case. */
    static String commandWord(String text) {
        String cleaned = cleanText(text);
        if (cleaned.isEmpty()) return "";
        return cleaned.split("\\s+", 2)[0].toLowerCase(Locale.ROOT);
    }

    /** What follows the command word ("بحث محمد" -> "محمد"). */
    static String afterCommand(String text) {
        String[] parts = cleanText(text).split("\\s+", 2);
        return parts.length > 1 ? parts[1].trim() : "";
    }

    /** Folding for search - identical to normalizeSearch (telegramRepMessages.ts). */
    static String normalize(String text) {
        if (text == null) return "";
        StringBuilder out = new StringBuilder();
        for (char c : text.toLowerCase(Locale.ROOT).toCharArray()) {
            if ((c >= '\u064B' && c <= '\u0652') || c == '\u0640') continue;
            if (c == 'أ' || c == 'إ' || c == 'آ') c = 'ا';
            else if (c == 'ة') c = 'ه';
            else if (c == 'ى') c = 'ي';
            else if (c >= '\u0660' && c <= '\u0669') c = (char) ('0' + (c - '\u0660'));
            else if (c >= '\u06F0' && c <= '\u06F9') c = (char) ('0' + (c - '\u06F0'));
            out.append(c);
        }
        return out.toString().replaceAll("\\s+", " ").trim();
    }

    static String jsonString(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else out.append(c);
            }
        }
        return out.append('"').toString();
    }

    /** {"inline_keyboard":[[{"text":..,"url":..}],..]} for the entries that have a button. */
    static String whatsappMarkup(List<SearchEntry> entries) {
        StringBuilder rows = new StringBuilder();
        int count = 0;
        for (SearchEntry e : entries) {
            if (e.buttonUrl == null || e.buttonLabel == null || count >= 10) continue;
            if (count++ > 0) rows.append(',');
            rows.append("[{\"text\":").append(jsonString(e.buttonLabel)).append(",\"url\":").append(jsonString(e.buttonUrl)).append("}]");
        }
        return count == 0 ? null : "{\"inline_keyboard\":[" + rows + "]}";
    }

    private static String quote(String query) {
        return query.length() > 40 ? query.substring(0, 40) : query;
    }

    /** Every word of the query must be in the device's keys - mirrors repSearchReply (TS). */
    static Reply search(String repId, String query, boolean helpWhenNothing, Snapshot s) {
        return search(repId, query, helpWhenNothing, s, Calendar.getInstance());
    }

    private static String pad2(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }

    private static String iso(Calendar c) {
        return c.get(Calendar.YEAR) + "-" + pad2(c.get(Calendar.MONTH) + 1) + "-" + pad2(c.get(Calendar.DAY_OF_MONTH));
    }

    /** "غداً", "يوم 30", "30/09", "2026/09/30"... or null - mirrors parseDayQuery (TS). */
    static DayQuery parseDay(String query, Calendar today) {
        String text = normalize(query);
        int offset;
        String name;
        switch (text) {
            case "اليوم": offset = 0; name = "اليوم"; break;
            case "غدا": case "بكره": offset = 1; name = "غداً"; break;
            case "بعد غد": case "بعد غدا": offset = 2; name = "بعد غد"; break;
            case "امس": offset = -1; name = "أمس"; break;
            default: offset = Integer.MIN_VALUE; name = null;
        }
        if (name != null) {
            Calendar c = (Calendar) today.clone();
            c.add(Calendar.DAY_OF_MONTH, offset);
            return new DayQuery(iso(c), 0, 0, name + " " + c.get(Calendar.DAY_OF_MONTH) + "/" + pad2(c.get(Calendar.MONTH) + 1));
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^يوم (\\d{1,2})$").matcher(text);
        if (m.matches()) {
            int day = Integer.parseInt(m.group(1));
            if (day >= 1 && day <= 31) return new DayQuery(null, 0, day, "يوم " + day);
        }
        m = java.util.regex.Pattern.compile("^(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})$").matcher(text);
        if (m.matches()) {
            int month = Integer.parseInt(m.group(2));
            int day = Integer.parseInt(m.group(3));
            return new DayQuery(m.group(1) + "-" + pad2(month) + "-" + pad2(day), 0, 0, day + "/" + pad2(month) + "/" + m.group(1));
        }
        m = java.util.regex.Pattern.compile("^(\\d{1,2})[/-](\\d{1,2})$").matcher(text);
        if (m.matches()) {
            int day = Integer.parseInt(m.group(1));
            int month = Integer.parseInt(m.group(2));
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return new DayQuery(null, month, day, day + "/" + pad2(month));
        }
        return null;
    }

    /** A tapped day button of 📆 الأيام ("dd:12") -> "يوم 12", or null - mirrors dayCallbackQuery (TS). */
    static DayQuery dayCallback(String data) {
        if (data == null || !data.startsWith("dd:")) return null;
        try {
            int day = Integer.parseInt(data.substring(3));
            return day >= 1 && day <= 31 ? new DayQuery(null, 0, day, "يوم " + day) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** That day's renewals among his devices - mirrors repDayReply (TS). */
    static Reply dayReply(String repId, DayQuery q, Snapshot s) {
        List<SearchEntry> entries = s.repSearch.get(repId);
        List<SearchEntry> found = new ArrayList<>();
        if (entries != null) for (SearchEntry e : entries) if (q.matches(e.date)) found.add(e);
        if (found.isEmpty()) return new Reply("📆 لا تجديدات لأجهزتك " + q.label, false, null, s.repKeyboard);
        Collections.sort(found, (a, b) -> a.date.compareTo(b.date));
        StringBuilder text = new StringBuilder("📆 تجديدات " + q.label + " (" + found.size() + "):");
        List<SearchEntry> buttons = new ArrayList<>();
        for (int i = 0; i < found.size() && i < 60; i++) {
            SearchEntry e = found.get(i);
            text.append("\n").append(q.date != null ? e.line : e.line + " - " + e.date);
            buttons.add(new SearchEntry("", "", e.buttonLabel, e.reminderUrl));
        }
        String markup = whatsappMarkup(buttons);
        return new Reply(withTime(text.toString(), s), false, null, markup != null ? markup : s.repKeyboard);
    }

    static Reply search(String repId, String query, boolean helpWhenNothing, Snapshot s, Calendar today) {
        DayQuery day = parseDay(query, today);
        if (day != null) return dayReply(repId, day, s);
        String keyboard = s.repKeyboard;
        String folded = normalize(query);
        if (folded.isEmpty()) return new Reply(s.searchHint, false, null, keyboard);
        List<SearchEntry> found = matchEntries(repId, query, s);
        if (found.isEmpty()) {
            String text = "🔎 لم أجد «" + quote(query) + "» بين أجهزتك";
            return new Reply(helpWhenNothing ? text + "\n\n" + s.repHelp : text, false, null, keyboard);
        }
        List<SearchEntry> shown = found.subList(0, Math.min(5, found.size()));
        boolean menus = true;
        for (SearchEntry e : shown) menus &= e.hasMenu();
        if (menus) return menuSearch(query, found.size(), shown, s);
        StringBuilder text = new StringBuilder("🔎 نتائج «" + quote(query) + "» (" + found.size() + "):");
        for (SearchEntry e : shown) text.append("\n\n").append(e.text);
        if (found.size() > 5) text.append("\n\n… و").append(found.size() - 5).append(" أخرى - اكتب اسمًا أدق");
        String markup = actionsMarkup(shown);
        return new Reply(withTime(text.toString(), s), false, null, markup != null ? markup : keyboard);
    }

    // ---- The device menu (mirrors repDeviceMenu.ts / repMenuReply in telegramRepMessages.ts) ----

    static final String MENU_HINT = "اختر ما تريد معرفته 👇";

    /** Code -> button, in menu order; and the editable fields (code -> label). */
    static final String[][] EDIT_FIELDS = {
        {"n", "🏷️ اسم الجهاز"}, {"c", "👤 اسم الزبون"}, {"t", "📞 هاتف الزبون"}, {"e", "📧 الإيميل"},
        {"p", "🔑 كود الإيميل"}, {"w", "📶 كود الواي فاي"}, {"k", "🔢 رقم KIT"},
    };

    static String editFieldLabel(String code) {
        for (String[] f : EDIT_FIELDS) if (f[0].equals(code)) return f[1];
        return null;
    }

    /** "🏷️ اسم الجهاز" -> "اسم الجهاز". */
    static String editFieldName(String code) {
        String label = editFieldLabel(code);
        return label == null ? "" : label.replaceFirst("^\\S+\\s", "");
    }

    static boolean menuFits(String accountId) {
        return accountId != null && !accountId.isEmpty() && fitsCallback("ef:w:" + accountId);
    }

    private static String cb(String text, String data) {
        return "{\"text\":" + jsonString(text) + ",\"callback_data\":" + jsonString(data) + "}";
    }

    static String menuMarkup(String id, String whatsappUrl) {
        return menuMarkup(id, whatsappUrl, "");
    }

    /** "💰 المال" button: opens the money bot on this device (mirrors moneyDeepLink, repBots.ts). */
    static String moneyDeepLink(String moneyBot, String accountId) {
        if (moneyBot == null || moneyBot.isEmpty() || accountId == null || !accountId.matches("[A-Za-z0-9_-]{1,62}")) return null;
        return "https://t.me/" + moneyBot + "?start=d_" + accountId;
    }

    /** Mirrors menuMarkup (repDeviceMenu.ts): with the money bot connected, 💰 الدين / 📊 كشف
     * become one "💰 المال" link to it. */
    static String menuMarkup(String id, String whatsappUrl, String moneyBot) {
        StringBuilder rows = new StringBuilder("[");
        if (moneyBot != null && !moneyBot.isEmpty()) {
            String link = moneyDeepLink(moneyBot, id);
            rows.append('[').append(cb("📶 الشبكة", "v:n:" + id)).append(',').append(cb("📅 التجديد", "v:r:" + id)).append(',').append(cb("🛰️ الاشتراك", "v:p:" + id)).append("],");
            rows.append('[').append(cb("🔢 KIT/SN", "v:i:" + id)).append(',').append(cb("👤 المعلومات", "v:f:" + id)).append(',').append(cb("📝 ملاحظة", "nt:" + id)).append("],");
            rows.append('[').append(cb("✏️ تعديل", "e:" + id));
            if (link != null) rows.append(",{\"text\":\"💰 المال\",\"url\":").append(jsonString(link)).append('}');
            rows.append(']');
        } else {
            rows.append('[').append(cb("📶 الشبكة", "v:n:" + id)).append(',').append(cb("📅 التجديد", "v:r:" + id)).append(',').append(cb("🛰️ الاشتراك", "v:p:" + id)).append("],");
            rows.append('[').append(cb("💰 الدين", "v:d:" + id)).append(',').append(cb("🔢 KIT/SN", "v:i:" + id)).append(',').append(cb("👤 المعلومات", "v:f:" + id)).append("],");
            rows.append('[').append(cb("✏️ تعديل", "e:" + id)).append(',').append(cb("📊 كشف", "v:s:" + id)).append(',').append(cb("📝 ملاحظة", "nt:" + id)).append(']');
        }
        StringBuilder last = new StringBuilder();
        if (whatsappUrl != null) last.append("{\"text\":\"💬 واتساب\",\"url\":").append(jsonString(whatsappUrl)).append('}');
        if (fitsCallback("a:" + id)) {
            if (last.length() > 0) last.append(',');
            last.append(cb("⚡ تفعيل", "a:" + id));
        }
        if (last.length() > 0) rows.append(",[").append(last).append(']');
        return "{\"inline_keyboard\":" + rows.append(']') + "}";
    }

    static String editMarkup(String id) {
        StringBuilder rows = new StringBuilder("[");
        for (int i = 0; i < EDIT_FIELDS.length; i += 2) {
            rows.append('[').append(cb(EDIT_FIELDS[i][1], "ef:" + EDIT_FIELDS[i][0] + ":" + id));
            if (i + 1 < EDIT_FIELDS.length) rows.append(',').append(cb(EDIT_FIELDS[i + 1][1], "ef:" + EDIT_FIELDS[i + 1][0] + ":" + id));
            rows.append("],");
        }
        rows.append('[').append(cb("↩️ رجوع", "v:h:" + id)).append("]]");
        return "{\"inline_keyboard\":" + rows + "}";
    }

    static String menuMarkup(SearchEntry e, Snapshot s) {
        return menuMarkup(e.id, e.buttonUrl, s == null ? "" : s.moneyBot);
    }

    /** One device -> its header and menu; several -> their headers and a button each. */
    static Reply menuSearch(String query, int total, List<SearchEntry> shown, Snapshot s) {
        String title = "🔎 نتائج «" + quote(query) + "» (" + total + "):";
        String more = total > shown.size() ? "\n\n… و" + (total - shown.size()) + " أخرى - اكتب اسمًا أدق" : "";
        if (shown.size() == 1) {
            SearchEntry e = shown.get(0);
            return new Reply(title + "\n\n" + e.header + "\n\n" + MENU_HINT + more, false, null, menuMarkup(e, s));
        }
        StringBuilder text = new StringBuilder(title);
        StringBuilder rows = new StringBuilder();
        for (int i = 0; i < shown.size(); i++) {
            SearchEntry e = shown.get(i);
            text.append("\n\n").append(i + 1).append(". ").append(e.header);
            String label = "📡 " + e.deviceName();
            if (label.length() > 40) label = label.substring(0, 40);
            if (i > 0) rows.append(',');
            rows.append('[').append(cb(label, "m:" + e.id)).append(']');
        }
        text.append(more).append("\n\nاضغط على الجهاز لتظهر قائمته 👇");
        return new Reply(text.toString(), false, null, "{\"inline_keyboard\":[" + rows + "]}");
    }

    /** A tapped menu button: m: (open the menu), v:<code>: (a section / h = the menu itself /
     * n = the network), e: (edit fields), ef:<field>: (edit this field), nt: (a note). */
    static final class Tap {
        final String kind;
        final String code;
        final String accountId;

        Tap(String kind, String code, String accountId) {
            this.kind = kind;
            this.code = code;
            this.accountId = accountId;
        }
    }

    static Tap parseTap(String data) {
        if (data == null) return null;
        if (data.startsWith("m:") && data.length() > 2) return new Tap("menu", "", data.substring(2));
        if (data.startsWith("nt:") && data.length() > 3) return new Tap("note", "", data.substring(3));
        if (data.startsWith("ef:") && data.length() > 5 && data.charAt(4) == ':') {
            String code = data.substring(3, 4);
            return editFieldLabel(code) == null ? null : new Tap("field", code, data.substring(5));
        }
        if (data.startsWith("e:") && data.length() > 2) return new Tap("edit", "", data.substring(2));
        if (data.startsWith("v:") && data.length() > 4 && data.charAt(3) == ':') return new Tap("view", data.substring(2, 3), data.substring(4));
        return null;
    }

    static String menuText(SearchEntry e) {
        return e.header + "\n\n" + MENU_HINT;
    }

    static String sectionText(SearchEntry e, String code, Snapshot s) {
        String section = e.sections.get(code);
        return withTime(e.header + "\n\n" + (section == null || section.isEmpty() ? "—" : section), s);
    }

    static String editText(SearchEntry e) {
        return e.header + "\n\n✏️ اختر ما تريد تعديله - يصل التعديل إلى المسؤول ولا يُحفظ إلا بعد موافقته.";
    }

    static String fieldQuestion(SearchEntry e, String code) {
        String current = e.editValues.get(code);
        return "✏️ " + editFieldName(code) + " - " + e.deviceName() + "\nالحالي: " + (current == null || current.isEmpty() ? "—" : current)
            + "\n\nاكتب القيمة الجديدة:";
    }

    static final String EDIT_REPLY = "{\"force_reply\":true,\"input_field_placeholder\":\"القيمة الجديدة\"}";
    static final String NOTE_REPLY = "{\"force_reply\":true,\"input_field_placeholder\":\"الملاحظة\"}";
    static final int MAX_FORM_CHARS = 300;

    static String noteQuestion(SearchEntry e) {
        return "📝 ملاحظة على " + e.deviceName() + "\nاكتب ملاحظتك وستصل إلى المسؤول وتُحفظ على الجهاز:";
    }

    static String editSent(SearchEntry e, String code, String value) {
        return "✅ أُرسل تعديل " + editFieldName(code) + " لـ " + e.deviceName() + " إلى «" + value + "» - ينتظر موافقة المسؤول.";
    }

    static String editToOwner(String repName, SearchEntry e, String code, String value) {
        String old = e.editValues.get(code);
        return "✏️ طلب تعديل من المندوب " + repName + "\n" + e.header + "\n\n" + editFieldName(code) + ":\nالحالي: "
            + (old == null || old.isEmpty() ? "—" : old) + "\nالجديد: " + value + "\n\nهل توافق؟";
    }

    static String editButtons(String editId) {
        return "{\"inline_keyboard\":[[" + cb("✅ موافق", "ey:" + editId) + "," + cb("❌ رفض", "en:" + editId) + "]]}";
    }

    static String noteSent(SearchEntry e) {
        return "✅ وصلت ملاحظتك على " + e.deviceName() + " إلى المسؤول.";
    }

    static String noteToOwner(String repName, SearchEntry e, String text) {
        return "📝 ملاحظة من المندوب " + repName + "\n" + e.header + "\n\n" + text + "\n\n(حُفظت على الجهاز)";
    }

    // ---- 📶 the network, always read fresh from Starlink ----

    static String dotWord(String status) {
        if ("online".equals(status)) return "🟢 متصل";
        if ("offline".equals(status)) return "🔴 غير متصل (غير موصول بالكهرباء أو مطفأ)";
        if ("warning".equals(status)) return "🟡 تنبيه";
        return "⚪ غير معروف";
    }

    static boolean dotRead(String status) {
        return status != null && !status.isEmpty();
    }

    static String networkChecking(SearchEntry e) {
        return e.header + "\n\n📶 جارٍ تحديث الجهاز من Starlink... انتظر حتى دقيقة ⏳";
    }

    /** Only a reading made just now - never an older one. */
    static String networkResult(SearchEntry e, String dish, String wifi, String time) {
        if (!dotRead(dish) && !dotRead(wifi)) return networkFailed(e);
        return e.header + "\n\n📶 حالة الشبكة الآن (تحديث " + time + "):\n🛰️ الطبق: " + dotWord(dish) + "\n📶 الواي فاي: " + dotWord(wifi);
    }

    static String networkFailed(SearchEntry e) {
        return e.header + "\n\n⚠️ تعذّر تحديث الجهاز من Starlink الآن - لا تُعرض حالة الشبكة إلا بعد تحديث ناجح. حاول بعد قليل.";
    }

    static String networkBusy(SearchEntry e) {
        return e.header + "\n\n⏳ Starlink طلب التمهّل - حاول بعد 20 دقيقة تقريباً.";
    }

    static String networkNoLogin(SearchEntry e) {
        return e.header + "\n\n⚠️ هذا الجهاز غير مسجّل الدخول في تطبيق المسؤول - لا يمكن تحديثه.";
    }

    /** His devices whose keys hold every word (as typed, or compacted: "000-111" finds "000111"). */
    /** The owner's index in the snapshot (all devices) - kept beside the reps' ones. */
    static final String OWNER_INDEX = "__owner";

    /** The owner typed a name / phone / KIT: the matching devices with WhatsApp buttons (no ⚡ -
     * that flow belongs to the reps bot). Null when nothing matches. */
    static Reply ownerSearch(String query, Snapshot s) {
        if (normalize(query).isEmpty()) return null;
        List<SearchEntry> found = matchEntries(OWNER_INDEX, query, s);
        if (found.isEmpty()) return null;
        List<SearchEntry> shown = found.subList(0, Math.min(5, found.size()));
        StringBuilder text = new StringBuilder("🔎 نتائج «" + quote(query) + "» (" + found.size() + "):");
        for (SearchEntry e : shown) text.append("\n\n").append(e.text);
        if (found.size() > 5) text.append("\n\n… و").append(found.size() - 5).append(" أخرى - اكتب اسمًا أدق");
        return new Reply(withTime(text.toString(), s), false, null, whatsappMarkup(shown));
    }

    static List<SearchEntry> matchEntries(String repId, String query, Snapshot s) {
        List<SearchEntry> found = new ArrayList<>();
        String folded = normalize(query);
        List<SearchEntry> entries = s.repSearch.get(repId);
        if (folded.isEmpty() || entries == null) return found;
        String[] words = folded.split(" ");
        for (SearchEntry e : entries) {
            boolean all = true;
            for (String w : words) {
                String compact = w.replaceAll("[^\\p{L}\\p{N}]", "");
                if (!e.keys.contains(w) && (compact.isEmpty() || !e.keys.contains(compact))) {
                    all = false;
                    break;
                }
            }
            if (all) found.add(e);
        }
        return found;
    }

    /** One row per device: 💬 WhatsApp and ⚡ تفعيل - mirrors deviceActionsMarkup (TS). */
    static String actionsMarkup(List<SearchEntry> entries) {
        StringBuilder rows = new StringBuilder();
        int count = 0;
        for (SearchEntry e : entries) {
            if (count >= 10) break;
            StringBuilder row = new StringBuilder();
            if (e.buttonUrl != null && e.buttonLabel != null) {
                row.append("{\"text\":").append(jsonString(e.buttonLabel)).append(",\"url\":").append(jsonString(e.buttonUrl)).append("}");
            }
            String callback = activateCallback(e.id);
            if (callback != null) {
                String label = row.length() > 0 ? "⚡ تفعيل" : "⚡ تفعيل " + e.deviceName();
                if (label.length() > 40) label = label.substring(0, 40);
                if (row.length() > 0) row.append(',');
                row.append("{\"text\":").append(jsonString(label)).append(",\"callback_data\":").append(jsonString(callback)).append("}");
            }
            if (row.length() == 0) continue;
            if (count++ > 0) rows.append(',');
            rows.append('[').append(row).append(']');
        }
        return count == 0 ? null : "{\"inline_keyboard\":[" + rows + "]}";
    }

    // ---- ⚡ تفعيل: device -> plan -> the price the customer pays the rep -> the operator ----

    private static boolean fitsCallback(String data) {
        return data.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 64;
    }

    static String activateCallback(String accountId) {
        if (accountId == null || accountId.isEmpty()) return null;
        String data = "a:" + accountId;
        return fitsCallback(data) ? data : null;
    }

    static SearchEntry findEntry(String repId, String accountId, Snapshot s) {
        List<SearchEntry> entries = s == null ? null : s.repSearch.get(repId);
        if (entries == null || accountId == null) return null;
        for (SearchEntry e : entries) if (accountId.equals(e.id)) return e;
        return null;
    }

    /** "⚡ تفعيل X" with one button per plan (callback "p:<id>:<plan>"). */
    static Reply pickPlan(SearchEntry entry, Snapshot s) {
        StringBuilder row = new StringBuilder();
        for (String plan : s.plans) {
            String data = "p:" + entry.id + ":" + plan;
            if (!fitsCallback(data)) continue;
            if (row.length() > 0) row.append(',');
            row.append("{\"text\":").append(jsonString(plan)).append(",\"callback_data\":").append(jsonString(data)).append("}");
        }
        return new Reply("⚡ تفعيل " + entry.deviceName() + "\n" + entry.line.replaceFirst("^• ", "") + "\n\nاختر الباقة:", false, null,
            row.length() == 0 ? s.repKeyboard : "{\"inline_keyboard\":[[" + row + "]]}");
    }

    /** "تفعيل محمد": one device -> its plans; several -> the results with their ⚡ buttons. */
    static Reply activate(String repId, String text, Snapshot s) {
        String query = afterCommand(text);
        if (query.isEmpty()) return new Reply(s.activationHint, false, null, s.repKeyboard);
        List<SearchEntry> found = matchEntries(repId, query, s);
        if (found.size() == 1 && !found.get(0).id.isEmpty()) return pickPlan(found.get(0), s);
        return search(repId, query, false, s);
    }

    static String priceQuestion(String plan, SearchEntry entry) {
        return "💰 كم سيدفع الزبون لتفعيل " + plan + " - " + entry.deviceName() + "؟\nاكتب المبلغ فقط، مثلاً 15000 أو 50 دولار";
    }

    static final String FORCE_REPLY = "{\"force_reply\":true,\"input_field_placeholder\":\"المبلغ\"}";

    /** An amount and its currency (أوقية unless دولار / سيفا is written). */
    static final class Price {
        final double amount;
        final String currency;

        Price(double amount, String currency) {
            this.amount = amount;
            this.currency = currency;
        }

        String label() {
            java.text.DecimalFormat format = new java.text.DecimalFormat("#,##0.##", java.text.DecimalFormatSymbols.getInstance(Locale.ROOT));
            String name = "USD".equals(currency) ? "دولار" : "SIFA".equals(currency) ? "سيفا" : "أوقية";
            return format.format(amount) + " " + name;
        }
    }

    static Price parsePrice(String text) {
        String folded = normalize(text).replace(",", "").replace("٬", "");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)").matcher(folded);
        if (!m.find()) return null;
        double amount = Double.parseDouble(m.group(1));
        if (!(amount > 0)) return null;
        String currency = folded.contains("دولار") || folded.contains("$") || folded.contains("usd") ? "USD"
            : folded.contains("سيفا") || folded.contains("sifa") || folded.contains("فرنك") ? "SIFA" : "MRU";
        return new Price(amount, currency);
    }

    static String activationSent(String plan, SearchEntry entry, Price price) {
        return "✅ أُرسل طلب تفعيل " + plan + " لـ " + entry.deviceName() + " بسعر " + price.label() + " إلى المسؤول - ينتظر موافقته.";
    }

    static String activationToOwner(String repName, String plan, SearchEntry entry, Price price) {
        return "⚡ طلب تفعيل من المندوب " + repName + "\n" + entry.line.replaceFirst("^• ", "📡 ") + "\nالباقة: " + plan
            + "\nيدفع الزبون للمندوب: " + price.label() + "\n\nهل توافق على السعر؟";
    }

    static String approvalButtons(String activationId) {
        return "{\"inline_keyboard\":[[{\"text\":\"✅ موافق\",\"callback_data\":\"y:" + activationId
            + "\"},{\"text\":\"❌ رفض\",\"callback_data\":\"n:" + activationId + "\"}]]}";
    }

    private static String withTime(String text, Snapshot s) {
        return s.at == null || s.at.isEmpty() ? text : text + "\n\n🕒 حسب بيانات الهاتف عند " + s.at;
    }

    private static String unknown(String text, String help, Snapshot s) {
        String quoted = text.length() > 40 ? text.substring(0, 40) : text;
        return s.unknown.replace("{text}", quoted) + "\n\n" + help;
    }

    /** The operator's own bot. */
    static Reply forOwner(String text, Snapshot s) {
        String kind = s == null ? null : s.ownerWords.get(commandWord(text));
        if ("statement".equals(kind) || (s == null && commandWord(text).equals("كشف"))) {
            return new Reply(s == null ? NOT_READY : s.statementLater, true, null);
        }
        if (s == null) return new Reply(NOT_READY, false, null);
        if (kind == null) {
            Reply found = ownerSearch(cleanText(text), s);
            return found != null ? found : new Reply(unknown(text.trim(), s.ownerHelp, s), false, null);
        }
        if ("help".equals(kind)) return new Reply(s.ownerHelp, false, null);
        String answer = s.owner.get(kind);
        return new Reply(answer == null ? NOT_READY : withTime(answer, s), false, null);
    }

    /** A linked rep (repId) - only his own prepared texts and his own devices for search. */
    static Reply forRep(String repId, String text, Snapshot s) {
        if (s == null) return new Reply(NOT_READY, false, null);
        String kind = s.repWords.get(normalize(commandWord(text)));
        if (kind != null && !s.moneyBot.isEmpty() && isMoneyKind(kind)) return new Reply(s.moneyRedirect, false, null, s.repKeyboard);
        if (kind == null) return search(repId, cleanText(text), true, s); // "محمد", "22212345"
        if ("search".equals(kind)) return search(repId, afterCommand(text), false, s);
        if ("client".equals(kind)) return new Reply(s.clientMoved, false, null, s.repKeyboard);
        if ("payment".equals(kind) || "promise".equals(kind) || "handover".equals(kind)) return request(repId, kind, text, s);
        if ("activate".equals(kind)) return activate(repId, text, s);
        if ("help".equals(kind)) return new Reply(s.repHelp, false, null, s.repKeyboard);
        Map<String, String> mine = s.reps.get(repId);
        String answer = mine == null ? null : mine.get(kind);
        if (answer == null) return new Reply(NOT_READY, false, null, s.repKeyboard);
        String markup = mine.get(kind + "#kb");
        return new Reply(withTime(answer, s), false, null, markup != null ? markup : s.repKeyboard);
    }

    /** 💵 / ➕ with the app closed: he's told it arrived, the operator is told, and the app records
     * it (for approval) when it opens. Without the details he gets the how-to instead. */
    static Reply request(String repId, String kind, String text, Snapshot s) {
        return request(repId, kind, text, s, s.repKeyboard);
    }

    static Reply request(String repId, String kind, String text, Snapshot s, String keyboard) {
        String rest = afterCommand(text);
        if ("handover".equals(kind) && normalize(rest).startsWith("المسؤول")) rest = rest.substring(Math.min(rest.length(), 7)).trim();
        if ("client".equals(kind) && normalize(rest).startsWith("جديد")) rest = rest.substring(Math.min(rest.length(), 4)).trim();
        boolean money = "payment".equals(kind) || "promise".equals(kind) || "handover".equals(kind);
        boolean complete = money ? normalize(rest).matches(".*\\d.*") : !rest.isEmpty();
        if (!complete) {
            String hint = "payment".equals(kind) ? s.paymentHint : "promise".equals(kind) ? s.promiseHint
                : "handover".equals(kind) ? s.handoverHint : s.clientHint;
            return new Reply(hint, false, null, keyboard);
        }
        Map<String, String> mine = s.reps.get(repId);
        String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
        String quoted = cleanText(text);
        if (quoted.length() > 120) quoted = quoted.substring(0, 120);
        String template = "promise".equals(kind) && !s.promiseNotice.isEmpty() ? s.promiseNotice : s.requestNotice;
        String notice = template.replace("{rep}", repName).replace("{text}", quoted);
        String received = "promise".equals(kind) && !s.promiseReceived.isEmpty() ? s.promiseReceived
            : "handover".equals(kind) && !s.handoverReceived.isEmpty() ? s.handoverReceived : s.requestReceived;
        return new Reply(received, true, notice, keyboard);
    }

    // ---- 💰 the money bot (mirrors repBots.ts) ----

    static final String[] MONEY_KINDS = {"payment", "promise", "mypromises", "debts", "statement", "handover"};

    static boolean isMoneyKind(String kind) {
        for (String k : MONEY_KINDS) if (k.equals(kind)) return true;
        return false;
    }

    /** "/start d_<id>" from a device's "💰 المال" button -> that device's id, or null. */
    static String startDevice(String text) {
        String t = text == null ? "" : text.trim();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^/start(?:@\\w+)?\\s+d_([A-Za-z0-9_-]{1,62})$").matcher(t);
        return m.matches() ? m.group(1) : null;
    }

    /** 📊 كشف · 💰 الدين · ⚡ تفعيل · 💬 debt reminder, for one device in the money bot. */
    static String moneyCardMarkup(SearchEntry e) {
        StringBuilder rows = new StringBuilder("[[").append(cb("💰 الدين", "v:d:" + e.id)).append(',').append(cb("📊 كشف", "v:s:" + e.id)).append(']');
        if (fitsCallback("a:" + e.id)) rows.append(",[").append(cb("⚡ تفعيل", "a:" + e.id)).append(']');
        if (e.debtUrl != null) rows.append(",[{\"text\":\"💬 تذكير الزبون بالدين\",\"url\":").append(jsonString(e.debtUrl)).append("}]");
        return "{\"inline_keyboard\":" + rows.append(']') + "}";
    }

    static String moneyCardText(SearchEntry e, String code, Snapshot s) {
        String section = e.sections.get(code);
        return withTime(e.header + "\n\n" + (section == null || section.isEmpty() ? "—" : section), s);
    }

    static Reply moneyCard(SearchEntry e, Snapshot s) {
        return new Reply(moneyCardText(e, "d", s), false, null, moneyCardMarkup(e));
    }

    /** A name / phone / KIT typed in the money bot: its debt and statement buttons. */
    static Reply moneySearch(String repId, String query, Snapshot s) {
        if (normalize(query).isEmpty()) return new Reply(s.moneyHelp, false, null, s.moneyKeyboard);
        List<SearchEntry> found = matchEntries(repId, query, s);
        List<SearchEntry> usable = new ArrayList<>();
        for (SearchEntry e : found) if (e.hasMenu()) usable.add(e);
        if (usable.isEmpty()) return new Reply("🔎 لم أجد «" + quote(query) + "» بين أجهزتك", false, null, s.moneyKeyboard);
        if (usable.size() == 1) return moneyCard(usable.get(0), s);
        List<SearchEntry> shown = usable.subList(0, Math.min(5, usable.size()));
        StringBuilder text = new StringBuilder("🔎 نتائج «" + quote(query) + "» (" + usable.size() + "):");
        StringBuilder rows = new StringBuilder();
        for (int i = 0; i < shown.size(); i++) {
            SearchEntry e = shown.get(i);
            String debt = e.sections.get("d");
            String firstLine = debt == null ? "" : debt.replaceFirst("^[^\\n]*\\n", "").split("\\n", 2)[0];
            text.append("\n\n").append(i + 1).append(". ").append(e.header).append(firstLine.isEmpty() ? "" : "\n" + firstLine);
            String label = "💰 " + e.deviceName();
            if (label.length() > 40) label = label.substring(0, 40);
            if (i > 0) rows.append(',');
            rows.append('[').append(cb(label, "md:" + e.id)).append(']');
        }
        return new Reply(withTime(text.toString(), s), false, null, "{\"inline_keyboard\":[" + rows + "]}");
    }

    /** A linked rep in the money bot. */
    static Reply forMoney(String repId, String text, Snapshot s) {
        if (s == null) return new Reply(NOT_READY, false, null);
        String device = startDevice(text);
        if (device != null) {
            SearchEntry e = findEntry(repId, device, s);
            return e != null && e.hasMenu() ? moneyCard(e, s) : new Reply(s.moneyHelp, false, null, s.moneyKeyboard);
        }
        String kind = s.repWords.get(normalize(commandWord(text)));
        if (kind == null) return moneySearch(repId, cleanText(text), s);
        if ("help".equals(kind)) return new Reply(s.moneyHelp, false, null, s.moneyKeyboard);
        if ("search".equals(kind)) return moneySearch(repId, afterCommand(text), s);
        if ("payment".equals(kind) || "promise".equals(kind) || "handover".equals(kind)) return request(repId, kind, text, s, s.moneyKeyboard);
        if ("activate".equals(kind)) {
            String query = afterCommand(text);
            if (query.isEmpty()) return new Reply(s.activationHint, false, null, s.moneyKeyboard);
            List<SearchEntry> found = matchEntries(repId, query, s);
            if (found.size() == 1 && !found.get(0).id.isEmpty()) return pickPlan(found.get(0), s);
            return moneySearch(repId, query, s);
        }
        if ("mypromises".equals(kind) || "debts".equals(kind) || "statement".equals(kind)) {
            Map<String, String> mine = s.reps.get(repId);
            String answer = mine == null ? null : mine.get(kind);
            if (answer == null) return new Reply(NOT_READY, false, null, s.moneyKeyboard);
            String markup = mine.get(kind + "#kb");
            return new Reply(withTime(answer, s), false, null, markup != null ? markup : s.moneyKeyboard);
        }
        if ("client".equals(kind)) return new Reply(s.clientMoved, false, null, s.moneyKeyboard);
        // Devices, renewals... belong to the devices bot.
        return new Reply("📡 هذا في بوت الأجهزة" + (s.devicesBot.isEmpty() ? "" : ": @" + s.devicesBot), false, null, s.moneyKeyboard);
    }

    /** Someone not linked yet, in the money / alerts bot: never any data. */
    static String notLinkedExtra(Snapshot s) {
        return "👋 اربط حسابك أولاً من بوت الأجهزة" + (s == null || s.devicesBot.isEmpty() ? "" : " @" + s.devicesBot) + " - اضغط «ابدأ» هناك وانتظر موافقة المسؤول.";
    }

    static String approvedActivation(String what, String total, String count) {
        return "✅ وافق المسؤول على تفعيل " + what + "\n\n💰 مجموع تفعيلاتك الموافق عليها هذا الشهر (" + count + "): " + total;
    }

    // ---- 🔔 the alerts bot ----

    static String stoppedReason(String status) {
        if ("canceled".equals(status)) return "الاشتراك ملغى";
        return "موقوف بسبب الفوترة (لم يُدفع الاشتراك)";
    }

    static final String D_MARK_LINE = "🅳 علامة D: لم ندفع لـ Starlink بعد على هذا الجهاز";

    /** "⛔ توقف جهاز" for one device, with its 🅳 mark (its header already carries it). */
    static String stoppedAlert(SearchEntry e, String status) {
        String header = e.header.isEmpty() ? "📡 " + e.deviceName() : e.header;
        boolean markShown = header.contains(D_MARK_LINE);
        return "⛔ توقف جهاز من أجهزتك\n\n" + header + (e.hasD && !markShown ? "\n" + D_MARK_LINE : "") + "\n\nالسبب: " + stoppedReason(status);
    }

    static String stoppedAlertMarkup(SearchEntry e) {
        StringBuilder rows = new StringBuilder();
        if (fitsCallback("pq:" + e.id)) rows.append('[').append(cb("📨 اطلب من المسؤول الدفع", "pq:" + e.id)).append(']');
        if (e.stoppedUrl != null) {
            if (rows.length() > 0) rows.append(',');
            rows.append("[{\"text\":\"💬 أرسل للزبون\",\"url\":").append(jsonString(e.stoppedUrl)).append("}]");
        }
        return rows.length() == 0 ? null : "{\"inline_keyboard\":[" + rows + "]}";
    }

    /** The same alert with 📨 gone (asked already) - only the customer's button stays. */
    static String afterPayRequestMarkup(SearchEntry e) {
        return e.stoppedUrl == null ? null : "{\"inline_keyboard\":[[{\"text\":\"💬 أرسل للزبون\",\"url\":" + jsonString(e.stoppedUrl) + "}]]}";
    }

    static String payRequestToOwner(String repName, SearchEntry e) {
        String header = e.header.isEmpty() ? "📡 " + e.deviceName() : e.header;
        boolean markShown = header.contains(D_MARK_LINE);
        return "📨 المندوب " + repName + " يطلب منك الدفع\n\n" + header + (e.hasD && !markShown ? "\n" + D_MARK_LINE : "")
            + "\n\nالجهاز موقوف - ادفع اشتراك Starlink عنه لتعود الخدمة.";
    }

    static final String PAY_REQUEST_SENT = "\n\n✅ أُرسل طلب الدفع إلى المسؤول";

    /** Every alert to a rep, copied to the operator's own bot. */
    static String ownerCopy(String repName, String text) {
        return "🔔 نسخة من تنبيه المندوب " + repName + ":\n\n" + text;
    }

    /** The file a rep's app shares ("📤 إرسال للمسؤول" in rep mode): starnet-device-....json. */
    static boolean isDeviceFile(String fileName) {
        return fileName != null && fileName.toLowerCase(java.util.Locale.ROOT).startsWith("starnet-device-");
    }

    static final String DEVICE_RECEIVED = "📥 وصل ملف الجهاز - بانتظار موافقة المسؤول.\nاضغط «✅ وصل» في تطبيقك لحذف الجلسة من هاتفك.";

    /** A rep's device file: he's told it arrived, the operator is told, the app records it. */
    static Reply deviceFile(String repId, String fileName, Snapshot s) {
        Map<String, String> mine = s != null ? s.reps.get(repId) : null;
        String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
        String notice = "📥 المندوب " + repName + " أرسل جهازاً جديداً مع دخوله إلى Starlink - وافق عليه من صفحة المندوبين في التطبيق.";
        return new Reply(DEVICE_RECEIVED, true, notice, s != null ? s.repKeyboard : null);
    }

    /**
     * Someone the operator hasn't linked yet: told his request arrived (once), the operator is
     * told too, and the app records the request when it opens. Never any data.
     */
    static Reply forUnlinked(String name, boolean alreadyRequested, Snapshot s) {
        if (alreadyRequested) return new Reply(null, false, null);
        String who = name == null || name.trim().isEmpty() ? "" : name.trim();
        if (s == null) return new Reply(null, true, null);
        return new Reply(s.linkReply.replace("{name}", who), true, s.linkNotice.replace("{name}", who.isEmpty() ? "مستخدم" : who));
    }
}
