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

    /** Low (not "min") importance: some phones freeze services whose notification is minimized. */
    private static final String CHANNEL_ID = "starnet_telegram_bot_v2";
    private static final int NOTIFICATION_ID = 1003;
    private static final int LONG_POLL_SECONDS = 25;
    /** The app counts as "in front" only while it keeps draining the inbox (every ~3 s). */
    private static final long APP_HEARTBEAT_MS = 10_000;
    private static final int MAX_INBOX = 50;

    /** Set by LocalBrowserPlugin from the activity's resume/pause. */
    static volatile boolean appVisible = false;
    /** When the app last drained the inbox (LocalBrowserPlugin#telegramTakeInbox). */
    static volatile long lastDrainAt = 0;

    /** In front AND actually answering - a missed onPause (or a frozen WebView) can never leave
     * messages waiting for an app that isn't there. */
    static boolean appAnswering() {
        return appVisible && System.currentTimeMillis() - lastDrainAt < APP_HEARTBEAT_MS;
    }

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

    /** Starts or stops the service to match the settings - safe to call any time. False when it
     * should run but Android refused to start it right now (TelegramWatchdogWorker then answers). */
    static boolean refresh(Context context) {
        Context app = context.getApplicationContext();
        Intent intent = new Intent(app, TelegramReplyService.class);
        boolean run = shouldRun(app);
        TelegramWatchdogWorker.schedule(app, run);
        try {
            if (run) {
                if (!polling) ContextCompat.startForegroundService(app, intent);
            } else {
                generation++;
                app.stopService(intent);
            }
            return true;
        } catch (RuntimeException notAllowedNow) {
            // Android refuses to start a foreground service from the background in some states;
            // the watchdog answers meanwhile, and the next app open (or reboot) starts it.
            TelegramStore.diag(app, "startError", now() + " " + notAllowedNow.getClass().getSimpleName());
            return false;
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
            TelegramStore.diag(this, "startError", now() + " " + refused.getClass().getSimpleName());
            stopSelf();
            return START_NOT_STICKY;
        }
        TelegramStore.diag(this, "startedAt", now());
        if (!shouldRun(this)) {
            generation++;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!polling) {
            // Once per service life: each round reads the current tokens, so connecting another
            // bot never needs new threads.
            polling = true;
            acquireWakeLock();
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
        releaseWakeLock();
        super.onDestroy();
    }

    private android.os.PowerManager.WakeLock wakeLock;

    /** Without it phones that freeze background apps (HONOR, Huawei...) only let the waiting
     * request finish when the app is opened again - exactly the "answers only when open" symptom. */
    private void acquireWakeLock() {
        try {
            android.os.PowerManager power = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power == null) return;
            wakeLock = power.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "starnet:telegram");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        } catch (RuntimeException ignored) {
            wakeLock = null;
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (RuntimeException ignored) {
            // already gone
        }
        wakeLock = null;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "بوت تيليغرام", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("STAR NET")
            .setContentText("🤖 بوت تيليغرام يرد على الرسائل")
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW);
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
                params.put("allowed_updates", "[\"message\",\"callback_query\"]");
                long offset = TelegramStore.offset(context, bot);
                if (offset > 0) params.put("offset", String.valueOf(offset));
                JSONArray updates = TelegramClient.call(token, "getUpdates", params, (LONG_POLL_SECONDS + 15) * 1000).getJSONArray("result");
                if (generation != mine || !token.equals(TelegramStore.tokenFor(context, bot))) continue;
                TelegramStore.diag(context, "pollAt", now());
                handleUpdates(context, bot, token, updates, true);
                // Left for the app, but the app went away before answering: answer them here.
                if (!appAnswering()) flushUnanswered(context, bot, token);
                backoffMs = 5_000;
            } catch (TelegramClient.TelegramError rejected) {
                // 409: another getUpdates (the app connecting the bot) - just go again shortly.
                // 401/404: the token was revoked - wait for the operator to reconnect.
                TelegramStore.diag(context, "pollError", now() + " " + bot + " " + rejected.code + " " + rejected.getMessage());
                sleep(rejected.code == 409 ? 5_000 : 300_000);
            } catch (IOException | JSONException offline) {
                TelegramStore.diag(context, "pollError", now() + " " + bot + " " + offline.getClass().getSimpleName());
                sleep(backoffMs);
                backoffMs = Math.min(backoffMs * 2, 120_000);
            } catch (RuntimeException unexpected) {
                // Never let one surprise end the thread (the service would look alive but be deaf).
                TelegramStore.diag(context, "pollError", now() + " " + bot + " " + unexpected.getClass().getSimpleName());
                sleep(10_000);
            }
        }
    }

    /** Handles a getUpdates batch and moves the offset past it. `appMayAnswer`: hand messages to
     * the app when it's in front (false = always answer here, e.g. from the watchdog). */
    static void handleUpdates(Context context, String bot, String token, JSONArray updates, boolean appMayAnswer) throws JSONException {
        long offset = TelegramStore.offset(context, bot);
        for (int i = 0; i < updates.length(); i++) {
            JSONObject update = updates.getJSONObject(i);
            offset = Math.max(offset, update.optLong("update_id") + 1);
            try {
                JSONObject callback = update.optJSONObject("callback_query");
                if (callback != null) handleCallback(context, bot, token, callback);
                else handle(context, bot, token, update.optJSONObject("message"), appMayAnswer);
            } catch (RuntimeException | JSONException oneBadMessage) {
                // Skip it rather than stall every later message behind it.
            }
            TelegramStore.setOffset(context, bot, offset);
        }
    }

    /** One quick getUpdates round, answering everything here (TelegramWatchdogWorker). */
    static void pollOnce(Context context, String bot) {
        String token = TelegramStore.tokenFor(context, bot);
        boolean ready = TelegramStore.REPS.equals(bot) ? token != null : TelegramStore.isConfigured(context);
        if (!ready) return;
        try {
            Map<String, String> params = new LinkedHashMap<>();
            params.put("timeout", "0");
            params.put("allowed_updates", "[\"message\",\"callback_query\"]");
            long offset = TelegramStore.offset(context, bot);
            if (offset > 0) params.put("offset", String.valueOf(offset));
            handleUpdates(context, bot, token, TelegramClient.call(token, "getUpdates", params).getJSONArray("result"), false);
            flushUnanswered(context, bot, token);
        } catch (IOException | JSONException | TelegramClient.TelegramError | RuntimeException ignored) {
            // Next round.
        }
    }

    /** Messages that went to the inbox for the app, which never answered them. */
    private static void flushUnanswered(Context context, String bot, String token) {
        JSONArray waiting = takeUnanswered(context, bot);
        for (int i = 0; i < waiting.length(); i++) {
            JSONObject item = waiting.optJSONObject(i);
            if (item == null) continue;
            try {
                answer(context, bot, token, item.optString("chatId", ""), item.optString("name", ""), item.optString("username", ""), item.optString("text", ""));
            } catch (RuntimeException | JSONException oneBadMessage) {
                // skip
            }
        }
    }

    private static void handle(Context context, String bot, String token, JSONObject message, boolean appMayAnswer) throws JSONException {
        JSONObject chat = message != null ? message.optJSONObject("chat") : null;
        if (chat == null || !"private".equals(chat.optString("type"))) return;
        String text = message.optString("text", "");
        String chatId = String.valueOf(chat.optLong("id"));
        String name = (chat.optString("first_name", "") + " " + chat.optString("last_name", "")).trim();
        String username = chat.optString("username", "");
        boolean reps = TelegramStore.REPS.equals(bot);
        if (reps && handleDeviceFile(context, token, chatId, name, username, message.optJSONObject("document"))) return;
        if (text.trim().isEmpty()) return;
        if (!reps && !chatId.equals(TelegramStore.chatId(context))) return; // the owner bot talks to the owner only

        // ⚡ تفعيل lives here only (its buttons come back to this service), app open or not.
        if (reps && handleActivationText(context, token, chatId, text)) return;

        if (appMayAnswer && appAnswering()) {
            addToInbox(context, bot, chatId, name, username, text, false);
            return;
        }
        answer(context, bot, token, chatId, name, username, text);
    }

    // ---- 📥 a device from a rep's app ----

    /** A linked rep's device file (session encrypted with his code): always left for the app,
     * which downloads, decrypts and shows it for approval. True when handled. */
    private static boolean handleDeviceFile(Context context, String token, String chatId, String name, String username, JSONObject document) throws JSONException {
        if (document == null || !TelegramReplies.isDeviceFile(document.optString("file_name", ""))) return false;
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return true; // only linked reps may send devices
        TelegramReplies.Reply reply = TelegramReplies.deviceFile(repId, document.optString("file_name", ""), loadSnapshot(context));
        addToInbox(context, TelegramStore.REPS, chatId, name, username, "", true, document.optString("file_id", ""), document.optString("file_name", ""));
        send(context, TelegramStore.REPS, token, chatId, reply.text, reply.markup);
        if (TelegramStore.isConfigured(context)) {
            send(context, TelegramStore.OWNER, TelegramStore.token(context), TelegramStore.chatId(context), reply.ownerNotice, null);
        }
        return true;
    }

    // ---- ⚡ تفعيل ----

    /** A rep's text that belongs to the activation flow: his price after choosing a plan, or
     * "تفعيل ...". True when handled. */
    private static boolean handleActivationText(Context context, String token, String chatId, String text) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (snapshot == null) return false;
        String kind = snapshot.repWords.get(TelegramReplies.normalize(TelegramReplies.commandWord(text)));
        String[] pending = TelegramStore.pendingActivation(context, chatId);
        if (pending != null && kind == null) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, pending[0], snapshot);
            TelegramReplies.Price price = TelegramReplies.parsePrice(text);
            if (entry == null) {
                TelegramStore.clearPendingActivation(context, chatId);
                return false;
            }
            if (price == null) {
                send(context, TelegramStore.REPS, token, chatId, "اكتب المبلغ بالأرقام فقط، مثلاً 15000 أو 50 دولار", TelegramReplies.FORCE_REPLY);
                return true;
            }
            TelegramStore.clearPendingActivation(context, chatId);
            submitActivation(context, token, chatId, repId, entry, pending[1], price, snapshot);
            return true;
        }
        if (pending != null) TelegramStore.clearPendingActivation(context, chatId); // he moved on
        if (!"activate".equals(kind)) return false;
        TelegramReplies.Reply reply = TelegramReplies.forRep(repId, text, snapshot);
        if (reply.text != null) send(context, TelegramStore.REPS, token, chatId, reply.text, reply.markup);
        return true;
    }

    /** To the operator with ✅/❌ - the rep is told it's waiting. */
    private static void submitActivation(Context context, String repsToken, String repChat, String repId, TelegramReplies.SearchEntry entry,
                                         String plan, TelegramReplies.Price price, TelegramReplies.Snapshot snapshot) throws JSONException {
        if (!TelegramStore.isConfigured(context)) {
            send(context, TelegramStore.REPS, repsToken, repChat, "⚠️ تعذر إرسال الطلب - بوت المسؤول غير مربوط. أخبر المسؤول مباشرة.", null);
            return;
        }
        String id = Long.toString(System.currentTimeMillis() % 2176782336L, 36) + Integer.toString((int) (Math.random() * 1296), 36);
        Map<String, String> mine = snapshot.reps.get(repId);
        String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
        JSONObject record = new JSONObject();
        record.put("repChat", repChat);
        record.put("device", entry.deviceName());
        record.put("plan", plan);
        record.put("price", price.label());
        TelegramStore.putActivation(context, id, record.toString());
        send(context, TelegramStore.OWNER, TelegramStore.token(context), TelegramStore.chatId(context),
            TelegramReplies.activationToOwner(repName, plan, entry, price), TelegramReplies.approvalButtons(id));
        send(context, TelegramStore.REPS, repsToken, repChat, TelegramReplies.activationSent(plan, entry, price), null);
    }

    /** A tapped inline button: a rep's ⚡ / plan, or the operator's ✅ / ❌. */
    private static void handleCallback(Context context, String bot, String token, JSONObject callback) throws JSONException {
        String callbackId = callback.optString("id", "");
        String data = callback.optString("data", "");
        JSONObject message = callback.optJSONObject("message");
        JSONObject chat = message != null ? message.optJSONObject("chat") : null;
        String chatId = chat != null ? String.valueOf(chat.optLong("id")) : "";
        String toast = null;
        try {
            if (TelegramStore.REPS.equals(bot)) {
                toast = repCallback(context, token, chatId, data);
            } else if (chatId.equals(TelegramStore.chatId(context))) {
                toast = ownerCallback(context, token, chatId, message != null ? message.optLong("message_id") : 0, message != null ? message.optString("text", "") : "", data);
            }
        } finally {
            try {
                TelegramClient.answerCallbackQuery(token, callbackId, toast);
            } catch (IOException | TelegramClient.TelegramError ignored) {
                // The spinner just times out.
            }
        }
    }

    private static String repCallback(Context context, String token, String chatId, String data) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (repId == null || snapshot == null) return "افتح تطبيق المسؤول مرة ثم أعد المحاولة";
        TelegramReplies.DayQuery day = TelegramReplies.dayCallback(data);
        if (day != null) {
            TelegramReplies.Reply reply = TelegramReplies.dayReply(repId, day, snapshot);
            send(context, TelegramStore.REPS, token, chatId, reply.text, reply.markup);
            return day.label;
        }
        if (data.startsWith("a:")) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, data.substring(2), snapshot);
            if (entry == null) return "هذا الجهاز ليس من أجهزتك";
            TelegramReplies.Reply reply = TelegramReplies.pickPlan(entry, snapshot);
            send(context, TelegramStore.REPS, token, chatId, reply.text, reply.markup);
            return null;
        }
        if (data.startsWith("p:")) {
            int split = data.lastIndexOf(':');
            String accountId = data.substring(2, split);
            String plan = data.substring(split + 1);
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, accountId, snapshot);
            if (entry == null || !snapshot.plans.contains(plan)) return "اختيار غير صالح";
            TelegramStore.setPendingActivation(context, chatId, accountId, plan);
            send(context, TelegramStore.REPS, token, chatId, TelegramReplies.priceQuestion(plan, entry), TelegramReplies.FORCE_REPLY);
            return plan;
        }
        return null;
    }

    private static String ownerCallback(Context context, String token, String chatId, long messageId, String messageText, String data) throws JSONException {
        boolean approve = data.startsWith("y:");
        if (!approve && !data.startsWith("n:")) return null;
        String id = data.substring(2);
        String raw = TelegramStore.activation(context, id);
        if (raw == null) return "هذا الطلب انتهى";
        JSONObject record = new JSONObject(raw);
        TelegramStore.removeActivation(context, id);
        String what = record.optString("plan") + " لـ " + record.optString("device") + " بسعر " + record.optString("price");
        String toRep = approve ? "✅ وافق المسؤول على تفعيل " + what : "❌ لم يوافق المسؤول على تفعيل " + what;
        String repsToken = TelegramStore.repsToken(context);
        String repChat = record.optString("repChat");
        if (repsToken != null && TelegramStore.isLinkedRepChat(context, repChat)) send(context, TelegramStore.REPS, repsToken, repChat, toRep, null);
        try {
            TelegramClient.editMessageText(token, chatId, messageId, messageText + "\n\n" + (approve ? "✅ وافقت - أُبلغ المندوب" : "❌ رفضت - أُبلغ المندوب"));
        } catch (IOException | TelegramClient.TelegramError ignored) {
            // The buttons stay; tapping again says the request is over.
        }
        return approve ? "✅ تمت الموافقة" : "❌ تم الرفض";
    }

    /** Answers here from the app's prepared texts (the app is closed or not answering). */
    private static void answer(Context context, String bot, String token, String chatId, String name, String username, String text) throws JSONException {
        boolean reps = TelegramStore.REPS.equals(bot);
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
            TelegramStore.diag(context, "replyAt", now());
        } catch (IOException offline) {
            TelegramStore.diag(context, "sendError", now() + " " + offline.getClass().getSimpleName());
            if (TelegramStore.REPS.equals(bot)) TelegramSendWorker.enqueueToRep(context, chatId, text, markup);
            else TelegramSendWorker.enqueue(context, text);
        } catch (TelegramClient.TelegramError rejected) {
            TelegramStore.diag(context, "sendError", now() + " " + rejected.code + " " + rejected.getMessage());
            // Buttons Telegram didn't accept must never cost the answer itself.
            if (markup != null && rejected.code == 400) {
                try {
                    TelegramClient.sendMessage(token, chatId, text, null);
                    TelegramStore.diag(context, "replyAt", now());
                } catch (IOException | TelegramClient.TelegramError again) {
                    // Blocked the bot / chat gone - nothing to retry.
                }
            }
        }
    }

    /** "27/09 18:40:12" for the diagnostics in الإعدادات. */
    private static String now() {
        return new java.text.SimpleDateFormat("dd/MM HH:mm:ss", java.util.Locale.ROOT).format(new java.util.Date());
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
            s.paymentHint = json.optString("paymentHint", "");
            s.clientHint = json.optString("clientHint", "");
            s.requestReceived = json.optString("requestReceived", "");
            s.promiseHint = json.optString("promiseHint", "");
            s.promiseReceived = json.optString("promiseReceived", "");
            s.promiseNotice = json.optString("promiseNotice", "");
            s.requestNotice = json.optString("requestNotice", "");
            s.activationHint = json.optString("activationHint", "");
            JSONArray plans = json.optJSONArray("plans");
            for (int i = 0; plans != null && i < plans.length(); i++) s.plans.add(plans.optString(i));
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
                        entries.add(new TelegramReplies.SearchEntry(
                            e.optString("k", ""), e.optString("t", ""), e.optString("l", null), e.optString("w", null),
                            e.optString("d", ""), e.optString("s", ""), e.optString("r", null), e.optString("i", "")));
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
        addToInbox(context, bot, chatId, name, username, text, replied, null, null);
    }

    private static void addToInbox(Context context, String bot, String chatId, String name, String username, String text, boolean replied, String fileId, String fileName) throws JSONException {
        synchronized (INBOX_LOCK) {
            JSONArray inbox = readInbox(context);
            JSONObject item = new JSONObject();
            item.put("bot", bot);
            item.put("chatId", chatId);
            item.put("name", name);
            item.put("username", username);
            item.put("text", text);
            item.put("replied", replied);
            if (fileId != null && !fileId.isEmpty()) {
                item.put("fileId", fileId);
                item.put("fileName", fileName != null ? fileName : "");
            }
            inbox.put(item);
            while (inbox.length() > MAX_INBOX) inbox.remove(0);
            TelegramStore.setInbox(context, inbox.toString());
        }
    }

    /** The inbox items of `bot` nobody answered yet, removed (the rest stay for the app). */
    private static JSONArray takeUnanswered(Context context, String bot) {
        synchronized (INBOX_LOCK) {
            JSONArray inbox = readInbox(context);
            JSONArray keep = new JSONArray();
            JSONArray taken = new JSONArray();
            for (int i = 0; i < inbox.length(); i++) {
                JSONObject item = inbox.optJSONObject(i);
                if (item == null) continue;
                if (bot.equals(item.optString("bot")) && !item.optBoolean("replied", false)) taken.put(item);
                else keep.put(item);
            }
            if (taken.length() > 0) TelegramStore.setInbox(context, keep.toString());
            return taken;
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
