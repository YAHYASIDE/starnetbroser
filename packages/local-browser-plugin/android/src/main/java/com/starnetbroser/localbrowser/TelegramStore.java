package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

/**
 * The operator's Telegram bots, kept only in the app's private native storage - never in the web
 * layer's localStorage, never in a backup, never logged:
 *  - "owner": the operator's own bot and the one chat it writes to;
 *  - "reps": a second bot for the representatives, with the chat of every rep the operator
 *    linked (repId -> chatId). A message to the reps bot only ever goes to a linked rep's chat.
 * Disconnecting a bot removes its token from the phone.
 */
final class TelegramStore {

    static final String OWNER = "owner";
    static final String REPS = "reps";
    /** The reps' 💰 money bot and 🔔 alerts bot (optional - without them everything stays in the
     * devices bot, REPS). Reps are linked once: a private chat's id is the person's own Telegram
     * id, the same in every bot, so REPS' links answer for all three. */
    static final String MONEY = "money";
    static final String ALERTS = "alerts";

    private static final String PREFS = "starnet_telegram";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_CHAT_ID = "chatId";
    private static final String KEY_CHAT_NAME = "chatName";
    private static final String KEY_BOT_NAME = "botName";
    private static final String KEY_STOPPED_OFF = "stoppedOff";
    private static final String KEY_REPS_TOKEN = "repsToken";
    private static final String KEY_REPS_BOT_NAME = "repsBotName";
    private static final String KEY_REP_CHATS = "repChats";
    private static final String KEY_REPS_STOPPED_OFF = "repsStoppedOff";
    private static final String KEY_INSTANT_OFF = "instantOff";
    private static final String KEY_OFFSET = "offset_";
    private static final String KEY_REPLIES = "replies";
    private static final String KEY_INBOX = "inbox";
    private static final String KEY_REQUESTED = "requested";

    private TelegramStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- owner bot ----

    static boolean save(Context context, String token, String chatId, String chatName, String botName) {
        return prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_CHAT_ID, chatId)
            .putString(KEY_CHAT_NAME, chatName)
            .putString(KEY_BOT_NAME, botName)
            .remove(KEY_OFFSET + OWNER)
            .commit();
    }

    static void clear(Context context) {
        prefs(context).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_CHAT_ID)
            .remove(KEY_CHAT_NAME)
            .remove(KEY_BOT_NAME)
            .remove(KEY_STOPPED_OFF)
            .remove(KEY_OFFSET + OWNER)
            .commit();
    }

    static String token(Context context) {
        return prefs(context).getString(KEY_TOKEN, null);
    }

    static String chatId(Context context) {
        return prefs(context).getString(KEY_CHAT_ID, null);
    }

    static String chatName(Context context) {
        return prefs(context).getString(KEY_CHAT_NAME, null);
    }

    static String botName(Context context) {
        return prefs(context).getString(KEY_BOT_NAME, null);
    }

    static boolean isConfigured(Context context) {
        return token(context) != null && chatId(context) != null;
    }

    static void setStoppedEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_STOPPED_OFF, !enabled).apply();
    }

    static boolean isStoppedEnabled(Context context) {
        return !prefs(context).getBoolean(KEY_STOPPED_OFF, false);
    }

    // ---- reps bot ----

    static boolean saveReps(Context context, String token, String botName) {
        return prefs(context).edit()
            .putString(KEY_REPS_TOKEN, token)
            .putString(KEY_REPS_BOT_NAME, botName)
            .remove(KEY_OFFSET + REPS)
            .remove(KEY_REQUESTED)
            .commit();
    }

    static void clearReps(Context context) {
        prefs(context).edit()
            .remove(KEY_REPS_TOKEN)
            .remove(KEY_REPS_BOT_NAME)
            .remove(KEY_REP_CHATS)
            .remove(KEY_REPS_STOPPED_OFF)
            .remove(KEY_OFFSET + REPS)
            .remove(KEY_REQUESTED)
            .commit();
    }

    static String repsToken(Context context) {
        return prefs(context).getString(KEY_REPS_TOKEN, null);
    }

    static String repsBotName(Context context) {
        return prefs(context).getString(KEY_REPS_BOT_NAME, null);
    }

    static boolean isRepsConfigured(Context context) {
        return repsToken(context) != null;
    }

    /** repId -> chatId, as linked by the operator in الإعدادات. */
    static void setRepChats(Context context, Map<String, String> chats) {
        prefs(context).edit().putString(KEY_REP_CHATS, TelegramText.encodePairs(chats)).apply();
    }

    static Map<String, String> repChats(Context context) {
        return TelegramText.decodePairs(prefs(context).getString(KEY_REP_CHATS, null));
    }

    static boolean isLinkedRepChat(Context context, String chatId) {
        return chatId != null && repChats(context).containsValue(chatId);
    }

    /** The rep a chat is linked to, or null. */
    static String repIdForChat(Context context, String chatId) {
        if (chatId == null) return null;
        for (Map.Entry<String, String> e : repChats(context).entrySet()) {
            if (chatId.equals(e.getValue())) return e.getKey();
        }
        return null;
    }

    static void setRepsStoppedEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_REPS_STOPPED_OFF, !enabled).apply();
    }

    static boolean isRepsStoppedEnabled(Context context) {
        return !prefs(context).getBoolean(KEY_REPS_STOPPED_OFF, false);
    }

    // ---- 💰 money / 🔔 alerts bots ----

    private static final String KEY_EXTRA_TOKEN = "tok_";
    private static final String KEY_EXTRA_NAME = "name_";

    static boolean isRepBot(String bot) {
        return REPS.equals(bot) || MONEY.equals(bot) || ALERTS.equals(bot);
    }

    static boolean isExtraBot(String bot) {
        return MONEY.equals(bot) || ALERTS.equals(bot);
    }

    static boolean saveExtraBot(Context context, String bot, String token, String botName) {
        return prefs(context).edit()
            .putString(KEY_EXTRA_TOKEN + bot, token)
            .putString(KEY_EXTRA_NAME + bot, botName)
            .remove(KEY_OFFSET + bot)
            .commit();
    }

    static void clearExtraBot(Context context, String bot) {
        prefs(context).edit().remove(KEY_EXTRA_TOKEN + bot).remove(KEY_EXTRA_NAME + bot).remove(KEY_OFFSET + bot).commit();
    }

    static String extraToken(Context context, String bot) {
        return isExtraBot(bot) ? prefs(context).getString(KEY_EXTRA_TOKEN + bot, null) : null;
    }

    static String extraBotName(Context context, String bot) {
        return isExtraBot(bot) ? prefs(context).getString(KEY_EXTRA_NAME + bot, null) : null;
    }

    /** The rep bot a message meant for `wanted` goes out through: itself when it's connected,
     * otherwise the devices bot (so nothing is lost before the new bots are set up). */
    static String repBotFor(Context context, String wanted) {
        return isExtraBot(wanted) && extraToken(context, wanted) != null ? wanted : REPS;
    }

    /** Every token in use (to refuse connecting the same bot twice). */
    static java.util.List<String> allTokens(Context context) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String t : new String[] {token(context), repsToken(context), extraToken(context, MONEY), extraToken(context, ALERTS)}) {
            if (t != null) out.add(t);
        }
        return out;
    }

    /** The token to send with ("owner", "reps", "money" or "alerts"). */
    static String tokenFor(Context context, String bot) {
        if (isExtraBot(bot)) return extraToken(context, bot);
        return REPS.equals(bot) ? repsToken(context) : token(context);
    }

    // ---- ⚡ تفعيل requests (TelegramReplyService) ----

    private static final String KEY_ACT_PENDING = "actpend_";
    private static final String KEY_ACT = "act_";
    private static final long PENDING_MS = 30 * 60 * 1000L;

    /** A rep chose device + plan and the bot now waits for his price: "accountId\nplan". */
    static void setPendingActivation(Context context, String chatId, String accountId, String plan) {
        prefs(context).edit().putString(KEY_ACT_PENDING + chatId, accountId + "\n" + plan + "\n" + System.currentTimeMillis()).commit();
    }

    /** {accountId, plan}, or null when none (or older than 30 minutes). */
    static String[] pendingActivation(Context context, String chatId) {
        String raw = prefs(context).getString(KEY_ACT_PENDING + chatId, null);
        if (raw == null) return null;
        String[] parts = raw.split("\n");
        if (parts.length < 3) return null;
        try {
            if (System.currentTimeMillis() - Long.parseLong(parts[2]) > PENDING_MS) return null;
        } catch (NumberFormatException broken) {
            return null;
        }
        return new String[] {parts[0], parts[1]};
    }

    static void clearPendingActivation(Context context, String chatId) {
        prefs(context).edit().remove(KEY_ACT_PENDING + chatId).commit();
    }

    /** A request waiting for the operator's ✅/❌ (JSON), by its short id. */
    static void putActivation(Context context, String id, String json) {
        prefs(context).edit().putString(KEY_ACT + id, json).commit();
    }

    static String activation(Context context, String id) {
        return prefs(context).getString(KEY_ACT + id, null);
    }

    static void removeActivation(Context context, String id) {
        prefs(context).edit().remove(KEY_ACT + id).commit();
    }

    // ---- ⚡ approved activations: the money bot shows each with the month's total ----

    private static final String KEY_ACT_TOTAL = "acttot_";

    /** Adds an approved activation to the rep's month ("2026-09") and returns the month's
     * "currency amount;currency amount" totals and count as {totals, count}. */
    static String[] addApprovedActivation(Context context, String repId, String month, String currency, double amount) {
        String key = KEY_ACT_TOTAL + repId + "_" + month;
        String[] updated = TelegramText.addToTally(prefs(context).getString(key, null), currency, amount);
        prefs(context).edit().putString(key, updated[0]).commit();
        return updated;
    }

    // ---- ✏️ / 📝 from the device menu (TelegramReplyService) ----

    private static final String KEY_FORM_PENDING = "formpend_";
    private static final String KEY_EDIT = "edit_";

    /** The bot now waits for a rep's typed value: kind ("edit" / "note"), device, field. */
    static void setPendingForm(Context context, String chatId, String kind, String accountId, String field) {
        prefs(context).edit().putString(KEY_FORM_PENDING + chatId, kind + "\n" + accountId + "\n" + field + "\n" + System.currentTimeMillis()).commit();
    }

    /** {kind, accountId, field}, or null when none (or older than 30 minutes). */
    static String[] pendingForm(Context context, String chatId) {
        String raw = prefs(context).getString(KEY_FORM_PENDING + chatId, null);
        if (raw == null) return null;
        String[] parts = raw.split("\n", -1);
        if (parts.length < 4) return null;
        try {
            if (System.currentTimeMillis() - Long.parseLong(parts[3]) > PENDING_MS) return null;
        } catch (NumberFormatException broken) {
            return null;
        }
        return new String[] {parts[0], parts[1], parts[2]};
    }

    static void clearPendingForm(Context context, String chatId) {
        prefs(context).edit().remove(KEY_FORM_PENDING + chatId).commit();
    }

    /** An edit waiting for the operator's ✅/❌ (JSON), by its short id. */
    static void putEdit(Context context, String id, String json) {
        prefs(context).edit().putString(KEY_EDIT + id, json).commit();
    }

    static String edit(Context context, String id) {
        return prefs(context).getString(KEY_EDIT + id, null);
    }

    static void removeEdit(Context context, String id) {
        prefs(context).edit().remove(KEY_EDIT + id).commit();
    }

    // ---- diagnostics shown in الإعدادات (never a token or message text) ----

    private static final String KEY_DIAG = "diag_";

    static void diag(Context context, String key, String value) {
        prefs(context).edit().putString(KEY_DIAG + key, value).apply();
    }

    static String diagValue(Context context, String key) {
        return prefs(context).getString(KEY_DIAG + key, null);
    }

    // ---- replies while the app is closed (TelegramReplyService) ----

    /** On by default: the service answers both bots even with the app closed. */
    static boolean isInstantEnabled(Context context) {
        return !prefs(context).getBoolean(KEY_INSTANT_OFF, false);
    }

    static void setInstantEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_INSTANT_OFF, !enabled).commit();
    }

    /** Next getUpdates offset per bot - reset whenever that bot's token changes. */
    static long offset(Context context, String bot) {
        return prefs(context).getLong(KEY_OFFSET + bot, 0);
    }

    static void setOffset(Context context, String bot, long offset) {
        prefs(context).edit().putLong(KEY_OFFSET + bot, offset).commit();
    }

    /** The answers the app prepared (JSON, see TelegramReplies.Snapshot). */
    static void setReplies(Context context, String json) {
        prefs(context).edit().putString(KEY_REPLIES, json).commit();
    }

    static String replies(Context context) {
        return prefs(context).getString(KEY_REPLIES, null);
    }

    /** Messages left for the app (JSON array) - synchronized with takeInbox. */
    static synchronized void setInbox(Context context, String json) {
        prefs(context).edit().putString(KEY_INBOX, json).commit();
    }

    static synchronized String inbox(Context context) {
        return prefs(context).getString(KEY_INBOX, null);
    }

    /** Unlinked chats already told "وصل طلبك" (so they're told once). */
    static boolean wasRequested(Context context, String chatId) {
        return TelegramText.decodePairs(prefs(context).getString(KEY_REQUESTED, null)).containsKey(chatId);
    }

    static void markRequested(Context context, String chatId) {
        Map<String, String> requested = TelegramText.decodePairs(prefs(context).getString(KEY_REQUESTED, null));
        requested.put(chatId, "1");
        prefs(context).edit().putString(KEY_REQUESTED, TelegramText.encodePairs(requested)).commit();
    }

    /** Forget a request (dismissed or linked in الإعدادات), so he's answered again if he writes. */
    static void forgetRequested(Context context, String chatId) {
        Map<String, String> requested = TelegramText.decodePairs(prefs(context).getString(KEY_REQUESTED, null));
        if (requested.remove(chatId) != null) prefs(context).edit().putString(KEY_REQUESTED, TelegramText.encodePairs(requested)).commit();
    }
}
