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
            .commit();
    }

    static void clear(Context context) {
        prefs(context).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_CHAT_ID)
            .remove(KEY_CHAT_NAME)
            .remove(KEY_BOT_NAME)
            .remove(KEY_STOPPED_OFF)
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
        return prefs(context).edit().putString(KEY_REPS_TOKEN, token).putString(KEY_REPS_BOT_NAME, botName).commit();
    }

    static void clearReps(Context context) {
        prefs(context).edit().remove(KEY_REPS_TOKEN).remove(KEY_REPS_BOT_NAME).remove(KEY_REP_CHATS).remove(KEY_REPS_STOPPED_OFF).commit();
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

    static void setRepsStoppedEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_REPS_STOPPED_OFF, !enabled).apply();
    }

    static boolean isRepsStoppedEnabled(Context context) {
        return !prefs(context).getBoolean(KEY_REPS_STOPPED_OFF, false);
    }

    /** The token to send with ("owner" or "reps"). */
    static String tokenFor(Context context, String bot) {
        return REPS.equals(bot) ? repsToken(context) : token(context);
    }
}
