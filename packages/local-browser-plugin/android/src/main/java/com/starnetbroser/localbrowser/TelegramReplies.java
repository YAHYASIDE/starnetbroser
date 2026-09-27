package com.starnetbroser.localbrowser;

import java.util.ArrayList;
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
        /** Every rep's own devices, for search: repId -> entries. */
        Map<String, List<SearchEntry>> repSearch = new HashMap<>();
    }

    /** One of a rep's devices: folded keys, its result card, and an optional WhatsApp button. */
    static final class SearchEntry {
        final String keys;
        final String text;
        final String buttonLabel;
        final String buttonUrl;

        SearchEntry(String keys, String text, String buttonLabel, String buttonUrl) {
            this.keys = keys == null ? "" : keys;
            this.text = text == null ? "" : text;
            this.buttonLabel = buttonLabel;
            this.buttonUrl = buttonUrl;
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
     * @name. Mirrors cleanRepText (telegramRepMessages.ts). */
    static String cleanText(String text) {
        if (text == null) return "";
        String cleaned = text.trim();
        if (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        cleaned = cleaned.replaceFirst("^[^\\p{L}\\p{N}]+", "");
        return cleaned.replaceFirst("@\\w+", "").trim();
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
        String keyboard = s.repKeyboard;
        String folded = normalize(query);
        if (folded.isEmpty()) return new Reply(s.searchHint, false, null, keyboard);
        String[] words = folded.split(" ");
        List<SearchEntry> entries = s.repSearch.get(repId);
        List<SearchEntry> found = new ArrayList<>();
        if (entries != null) {
            for (SearchEntry e : entries) {
                boolean all = true;
                for (String w : words) {
                    if (!e.keys.contains(w)) {
                        all = false;
                        break;
                    }
                }
                if (all) found.add(e);
            }
        }
        if (found.isEmpty()) {
            String text = "🔎 لم أجد «" + quote(query) + "» بين أجهزتك";
            return new Reply(helpWhenNothing ? text + "\n\n" + s.repHelp : text, false, null, keyboard);
        }
        List<SearchEntry> shown = found.subList(0, Math.min(5, found.size()));
        StringBuilder text = new StringBuilder("🔎 نتائج «" + quote(query) + "» (" + found.size() + "):");
        for (SearchEntry e : shown) text.append("\n\n").append(e.text);
        if (found.size() > 5) text.append("\n\n… و").append(found.size() - 5).append(" أخرى - اكتب اسمًا أدق");
        String markup = whatsappMarkup(shown);
        return new Reply(withTime(text.toString(), s), false, null, markup != null ? markup : keyboard);
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
        if (kind == null) return new Reply(unknown(text.trim(), s.ownerHelp, s), false, null);
        if ("help".equals(kind)) return new Reply(s.ownerHelp, false, null);
        String answer = s.owner.get(kind);
        return new Reply(answer == null ? NOT_READY : withTime(answer, s), false, null);
    }

    /** A linked rep (repId) - only his own prepared texts and his own devices for search. */
    static Reply forRep(String repId, String text, Snapshot s) {
        if (s == null) return new Reply(NOT_READY, false, null);
        String kind = s.repWords.get(commandWord(text));
        if (kind == null) return search(repId, cleanText(text), true, s); // "محمد", "22212345"
        if ("search".equals(kind)) return search(repId, afterCommand(text), false, s);
        if ("help".equals(kind)) return new Reply(s.repHelp, false, null, s.repKeyboard);
        Map<String, String> mine = s.reps.get(repId);
        String answer = mine == null ? null : mine.get(kind);
        if (answer == null) return new Reply(NOT_READY, false, null, s.repKeyboard);
        String markup = mine.get(kind + "#kb");
        return new Reply(withTime(answer, s), false, null, markup != null ? markup : s.repKeyboard);
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
