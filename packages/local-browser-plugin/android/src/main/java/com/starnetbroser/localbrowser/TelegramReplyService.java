package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.IOException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps both Telegram bots answering while the app is closed: a foreground service (with its
 * small permanent notification, which is what lets Android keep it running) long-polls each bot
 * and answers from the texts the app prepared the last time it was open (TelegramReplies). What
 * needs the app itself - a statement PDF, recording a rep's link request - is left in an inbox
 * the app drains when it opens. While the app is in front everything goes to the inbox, so the
 * app answers with its live data exactly as before.
 * Tokens are read from TelegramStore on every round and never logged.
 */
public class TelegramReplyService extends Service {

    private static final String CHANNEL_ID = "starnet_telegram_bot";
    private static final int NOTIFICATION_ID = 1003;
    private static final int LONG_POLL_SECONDS = 50;
    private static final int MAX_INBOX = 50;

    /** Set by LocalBrowserPlugin from the activity's resume/pause. */
    static volatile boolean appVisible = false;

    /** Bumped on every (re)start so an older polling thread ends instead of competing. */
    private static volatile int generation = 0;
    private static volatile boolean polling = false;

    private static final Object INBOX_LOCK = new Object();

    // ---- start / stop ----

    /** True while the polling threads are actually running (not just switched on). */
    static boolean isPolling() {
        return polling;
    }

    static boolean shouldRun(Context context) {
        return TelegramStore.isInstantEnabled(context) && (TelegramStore.isConfigured(context) || TelegramStore.isRepsConfigured(context));
    }

    /** Starts or stops the service to match the settings - safe to call any time. */
    static void refresh(Context context) {
        Context app = context.getApplicationContext();
        Intent intent = new Intent(app, TelegramReplyService.class);
        try {
            if (shouldRun(app)) {
                ContextCompat.startForegroundService(app, intent);
            } else {
                generation++;
                app.stopService(intent);
            }
        } catch (RuntimeException notAllowedNow) {
            // Android refuses to start a foreground service from the background in some states;
            // the next app open (or reboot) starts it.
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException refused) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!shouldRun(this)) {
            generation++;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!polling) {
            // Once per service life: each round reads the current tokens, so connecting another
            // bot never needs new threads.
            polling = true;
            int mine = ++generation;
            startPolling(TelegramStore.OWNER, mine);
            startPolling(TelegramStore.REPS, mine);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        generation++;
        polling = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "بوت تيليغرام", NotificationManager.IMPORTANCE_MIN);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("STAR NET")
            .setContentText("🤖 بوت تيليغرام يرد على الرسائل")
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            builder.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return builder.build();
    }

    // ---- polling ----

    private void startPolling(String bot, int mine) {
        Context context = getApplicationContext();
        Thread thread = new Thread(() -> pollLoop(context, bot, mine), "starnet-telegram-" + bot);
        thread.setDaemon(true);
        thread.start();
    }

    private static void pollLoop(Context context, String bot, int mine) {
        long backoffMs = 5_000;
        while (generation == mine) {
            String token = TelegramStore.tokenFor(context, bot);
            boolean ready = TelegramStore.REPS.equals(bot) ? token != null : TelegramStore.isConfigured(context);
            if (!ready) {
                sleep(30_000);
                continue;
            }
            try {
                Map<String, String> params = new LinkedHashMap<>();
                params.put("timeout", String.valueOf(LONG_POLL_SECONDS));
                params.put("allowed_updates", "[\"message\"]");
                long offset = TelegramStore.offset(context, bot);
                if (offset > 0) params.put("offset", String.valueOf(offset));
                JSONArray updates = TelegramClient.call(token, "getUpdates", params, (LONG_POLL_SECONDS + 15) * 1000).getJSONArray("result");
                if (generation != mine || !token.equals(TelegramStore.tokenFor(context, bot))) continue;
                for (int i = 0; i < updates.length(); i++) {
                    JSONObject update = updates.getJSONObject(i);
                    offset = Math.max(offset, update.optLong("update_id") + 1);
                    try {
                        handle(context, bot, token, update.optJSONObject("message"));
                    } catch (RuntimeException | JSONException oneBadMessage) {
                        // Skip it rather than stall every later message behind it.
                    }
                    TelegramStore.setOffset(context, bot, offset);
                }
                backoffMs = 5_000;
            } catch (TelegramClient.TelegramError rejected) {
                // 409: another getUpdates (the app connecting the bot) - just go again shortly.
                // 401/404: the token was revoked - wait for the operator to reconnect.
                sleep(rejected.code == 409 ? 5_000 : 300_000);
            } catch (IOException | JSONException offline) {
                sleep(backoffMs);
                backoffMs = Math.min(backoffMs * 2, 120_000);
            }
        }
    }

    private static void handle(Context context, String bot, String token, JSONObject message) throws JSONException {
        JSONObject chat = message != null ? message.optJSONObject("chat") : null;
        if (chat == null || !"private".equals(chat.optString("type"))) return;
        String text = message.optString("text", "");
        if (text.trim().isEmpty()) return;
        String chatId = String.valueOf(chat.optLong("id"));
        String name = (chat.optString("first_name", "") + " " + chat.optString("last_name", "")).trim();
        String username = chat.optString("username", "");
        boolean reps = TelegramStore.REPS.equals(bot);
        if (!reps && !chatId.equals(TelegramStore.chatId(context))) return; // the owner bot talks to the owner only

        if (appVisible) {
            addToInbox(context, bot, chatId, name, username, text, false);
            return;
        }
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        TelegramReplies.Reply reply;
        if (!reps) {
            reply = TelegramReplies.forOwner(text, snapshot);
        } else {
            String repId = TelegramStore.repIdForChat(context, chatId);
            if (repId != null) {
                reply = TelegramReplies.forRep(repId, text, snapshot);
            } else {
                reply = TelegramReplies.forUnlinked(name.isEmpty() ? username : name, TelegramStore.wasRequested(context, chatId), snapshot);
                if (reply.text != null) TelegramStore.markRequested(context, chatId);
            }
        }
        if (reply.toInbox) addToInbox(context, bot, chatId, name, username, text, reply.text != null);
        if (reply.text != null) send(context, bot, token, chatId, reply.text, reply.markup);
        if (reply.ownerNotice != null && TelegramStore.isConfigured(context)) {
            send(context, TelegramStore.OWNER, TelegramStore.token(context), TelegramStore.chatId(context), reply.ownerNotice, null);
        }
    }

    /** Right away; if the network drops, queued through TelegramSendWorker (linked chats only). */
    private static void send(Context context, String bot, String token, String chatId, String text, String markup) {
        try {
            TelegramClient.sendMessage(token, chatId, text, markup);
        } catch (IOException offline) {
            if (TelegramStore.REPS.equals(bot)) TelegramSendWorker.enqueueToRep(context, chatId, text, markup);
            else TelegramSendWorker.enqueue(context, text);
        } catch (TelegramClient.TelegramError rejected) {
            // Blocked the bot / chat gone - nothing to retry.
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ---- the app's prepared answers ----

    static TelegramReplies.Snapshot loadSnapshot(Context context) {
        String raw = TelegramStore.replies(context);
        if (raw == null) return null;
        try {
            JSONObject json = new JSONObject(raw);
            TelegramReplies.Snapshot s = new TelegramReplies.Snapshot();
            s.at = json.optString("at", "");
            s.ownerHelp = json.optString("ownerHelp", "");
            s.repHelp = json.optString("repHelp", "");
            s.unknown = json.optString("unknown", "");
            s.statementLater = json.optString("statementLater", "");
            s.linkReply = json.optString("linkReply", "");
            s.linkNotice = json.optString("linkNotice", "");
            s.owner = strings(json.optJSONObject("owner"));
            s.ownerWords = strings(json.optJSONObject("ownerWords"));
            s.repWords = strings(json.optJSONObject("repWords"));
            s.repKeyboard = json.optString("repKeyboard", "");
            s.searchHint = json.optString("searchHint", "");
            JSONObject search = json.optJSONObject("repSearch");
            if (search != null) {
                Iterator<String> ids = search.keys();
                while (ids.hasNext()) {
                    String id = ids.next();
                    JSONArray list = search.optJSONArray(id);
                    java.util.List<TelegramReplies.SearchEntry> entries = new java.util.ArrayList<>();
                    for (int i = 0; list != null && i < list.length(); i++) {
                        JSONObject e = list.optJSONObject(i);
                        if (e == null) continue;
                        entries.add(new TelegramReplies.SearchEntry(e.optString("k", ""), e.optString("t", ""), e.optString("l", null), e.optString("w", null)));
                    }
                    s.repSearch.put(id, entries);
                }
            }
            JSONObject reps = json.optJSONObject("reps");
            if (reps != null) {
                Iterator<String> ids = reps.keys();
                while (ids.hasNext()) {
                    String id = ids.next();
                    s.reps.put(id, strings(reps.optJSONObject(id)));
                }
            }
            return s;
        } catch (JSONException broken) {
            return null;
        }
    }

    private static Map<String, String> strings(JSONObject json) {
        Map<String, String> out = new HashMap<>();
        if (json == null) return out;
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = json.optString(key, null);
            if (value != null) out.put(key, value);
        }
        return out;
    }

    // ---- inbox (drained by the app) ----

    private static void addToInbox(Context context, String bot, String chatId, String name, String username, String text, boolean replied) throws JSONException {
        synchronized (INBOX_LOCK) {
            JSONArray inbox = readInbox(context);
            JSONObject item = new JSONObject();
            item.put("bot", bot);
            item.put("chatId", chatId);
            item.put("name", name);
            item.put("username", username);
            item.put("text", text);
            item.put("replied", replied);
            inbox.put(item);
            while (inbox.length() > MAX_INBOX) inbox.remove(0);
            TelegramStore.setInbox(context, inbox.toString());
        }
    }

    /** Everything waiting for the app, removed from the inbox. */
    static JSONArray takeInbox(Context context) {
        synchronized (INBOX_LOCK) {
            JSONArray inbox = readInbox(context);
            if (inbox.length() > 0) TelegramStore.setInbox(context, "[]");
            return inbox;
        }
    }

    private static JSONArray readInbox(Context context) {
        String raw = TelegramStore.inbox(context);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException broken) {
            return new JSONArray();
        }
    }
}
