package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;

/**
 * 🔑 «الأكواد» (his Oct 22 2026 ask «أين تُحفظ أكواد التحقق؟ أريدها تُحفظ في التطبيق»): every verification
 * code the app reads from a mailbox - Starlink's two-step code, the mailbox's own (Microsoft) sign-in code,
 * the card's payment code - kept on the phone so he can see and copy it later. One line per code
 * ("at \t accountId \t kind \t code"), newest last, 30 days and 200 codes at most; the same code for the
 * same device is kept once. Pure, unit-tested; never logged.
 */
final class CodeLog {

    private CodeLog() {}

    static final int MAX = 200;
    static final long KEEP_MS = 30L * 24 * 60 * 60 * 1000;

    static final class Entry {
        final long at;
        final String accountId;
        /** "starlink" / "mail" / "card". */
        final String kind;
        final String code;

        Entry(long at, String accountId, String kind, String code) {
            this.at = at;
            this.accountId = accountId;
            this.kind = kind;
            this.code = code;
        }
    }

    static List<Entry> parse(String stored) {
        List<Entry> list = new ArrayList<>();
        if (stored == null || stored.isEmpty()) return list;
        for (String line : stored.split("\n")) {
            String[] parts = line.split("\t", -1);
            if (parts.length != 4 || parts[3].isEmpty()) continue;
            try {
                list.add(new Entry(Long.parseLong(parts[0]), parts[1], parts[2], parts[3]));
            } catch (NumberFormatException ignored) {
                // a broken line is dropped
            }
        }
        return list;
    }

    private static String clean(String value) {
        return value == null ? "" : value.replace('\t', ' ').replace('\n', ' ').trim();
    }

    /** The log with this code added (an older copy of it for the same device moves to now). */
    static String append(String stored, long at, String accountId, String kind, String code, long now) {
        String id = clean(accountId);
        String k = clean(kind);
        String c = clean(code);
        List<Entry> kept = new ArrayList<>();
        for (Entry e : parse(stored)) {
            if (now - e.at > KEEP_MS) continue;
            if (e.accountId.equals(id) && e.code.equals(c)) continue;
            kept.add(e);
        }
        if (!c.isEmpty()) kept.add(new Entry(at, id, k, c));
        int from = Math.max(0, kept.size() - MAX);
        StringBuilder out = new StringBuilder();
        for (int i = from; i < kept.size(); i++) {
            Entry e = kept.get(i);
            if (out.length() > 0) out.append('\n');
            out.append(e.at).append('\t').append(e.accountId).append('\t').append(e.kind).append('\t').append(e.code);
        }
        return out.toString();
    }
}
