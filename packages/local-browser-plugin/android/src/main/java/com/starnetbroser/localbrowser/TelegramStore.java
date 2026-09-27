package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * The operator's Telegram bot connection: bot token, the one chat messages go to, and whether
 * the background sync sends "⛔ توقف" there. Kept only in the app's private native storage -
 * never in the web layer's localStorage, never in a backup, never logged. Clearing it
 * ("فصل تيليغرام") removes the token from the phone.
 */
final class TelegramStore {

    private static final String PREFS = "starnet_telegram";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_CHAT_ID = "chatId";
    private static final String KEY_CHAT_NAME = "chatName";
    private static final String KEY_BOT_NAME = "botName";
    private static final String KEY_STOPPED_OFF = "stoppedOff";

    private TelegramStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean save(Context context, String token, String chatId, String chatName, String botName) {
        return prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_CHAT_ID, chatId)
            .putString(KEY_CHAT_NAME, chatName)
            .putString(KEY_BOT_NAME, botName)
            .commit();
    }

    static void clear(Context context) {
        prefs(context).edit().clear().commit();
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
}
