package com.starnetbroser.localbrowser;

import java.util.HashMap;
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
    }

    /** What to do with one message. */
    static final class Reply {
        /** Sent back to the same chat (null = nothing). */
        final String text;
        /** Also left for the app to finish when it opens (a PDF, recording a link request). */
        final boolean toInbox;
        /** To the owner's own chat as well (a new link request). */
        final String ownerNotice;

        Reply(String text, boolean toInbox, String ownerNotice) {
            this.text = text;
            this.toInbox = toInbox;
            this.ownerNotice = ownerNotice;
        }
    }

    static final String NOT_READY = "⏳ افتح تطبيق STAR NET مرة واحدة ليجهّز الردود، ثم أعد المحاولة.";

    private TelegramReplies() {
    }

    /** "/Stopped@my_bot extra" -> "stopped": the first word, without "/" or the bot's @name. */
    static String commandWord(String text) {
        if (text == null) return "";
        String cleaned = text.trim();
        if (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        cleaned = cleaned.replaceFirst("@\\w+", "").trim();
        if (cleaned.isEmpty()) return "";
        return cleaned.split("\\s+", 2)[0].toLowerCase(java.util.Locale.ROOT);
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

    /** A linked rep (repId) - only his own prepared texts. */
    static Reply forRep(String repId, String text, Snapshot s) {
        if (s == null) return new Reply(NOT_READY, false, null);
        String kind = s.repWords.get(commandWord(text));
        if (kind == null) return new Reply(unknown(text.trim(), s.repHelp, s), false, null);
        if ("help".equals(kind)) return new Reply(s.repHelp, false, null);
        Map<String, String> mine = s.reps.get(repId);
        String answer = mine == null ? null : mine.get(kind);
        return new Reply(answer == null ? NOT_READY : withTime(answer, s), false, null);
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
