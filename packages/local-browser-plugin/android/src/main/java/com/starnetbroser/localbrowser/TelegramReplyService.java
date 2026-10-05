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
import java.util.List;
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
    private static final int MAX_INBOX = 150;

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
            startPolling(TelegramStore.MONEY, mine);
            startPolling(TelegramStore.ALERTS, mine);
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
            boolean ready = TelegramStore.isRepBot(bot) ? token != null : TelegramStore.isConfigured(context);
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
        boolean ready = TelegramStore.isRepBot(bot) ? token != null : TelegramStore.isConfigured(context);
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
        if (text.trim().isEmpty() && (reps || TelegramStore.MONEY.equals(bot))) {
            if (handlePaymentPhoto(context, bot, token, chatId, photoFileId(message))) return;
        }
        if (text.trim().isEmpty()) return;
        // 💰 / 🔔: always answered here, app open or not.
        if (TelegramStore.isExtraBot(bot)) {
            answerExtra(context, bot, token, chatId, name, username, text);
            return;
        }
        if (!reps && !chatId.equals(TelegramStore.chatId(context))) return; // the owner bot talks to the owner only

        // 📋 A Starlink session (or one of the parts Telegram cut it into): always for the app,
        // which joins the parts and adds the device - never answered as a command here.
        if ((!reps || TelegramStore.repIdForChat(context, chatId) != null) && SessionText.take(bot + ":" + chatId, text, System.currentTimeMillis())) {
            addToInbox(context, bot, chatId, name, username, text, false);
            if (!appAnswering() && SessionText.isStart(text)) {
                send(context, bot, token, chatId, "📥 وصلت الجلسة - يُضيف التطبيق الجهاز عند فتحه.", null);
            }
            return;
        }

        // ✏️ / 📝 values and ⚡ تفعيل live here only (their buttons come back to this service),
        // app open or not.
        if (reps && handleFormText(context, token, chatId, text)) return;
        if (reps && handleBookText(context, bot, token, chatId, text)) return;
        if (reps && handleLoanText(context, bot, token, chatId, text)) return;
        if (reps && handlePaymentText(context, bot, token, chatId, text)) return;
        if (reps && handleActivationText(context, bot, token, chatId, text)) return;

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
        tellOwner(context, reply.ownerNotice, null);
        return true;
    }

    // ---- ⚡ تفعيل ----

    /** A rep's text that belongs to the activation flow: his price after choosing a plan, or
     * "تفعيل ...". True when handled. */
    private static boolean handleActivationText(Context context, String bot, String token, String chatId, String text) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (snapshot == null) return false;
        String kind = snapshot.repWords.get(TelegramReplies.normalize(TelegramReplies.commandWord(text)));
        String[] pending = TelegramStore.pendingActivation(context, chatId);
        if (pending != null && kind == null) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, pending[0], snapshot);
            if (entry == null) {
                TelegramStore.clearPendingActivation(context, chatId);
                return false;
            }
            TelegramReplies.Price asked = activationPrice(pending);
            if (asked != null) {
                // The price is in - he typed instead of answering "did the customer pay?".
                send(context, bot, token, chatId, TelegramReplies.activationPaidQuestion(pending[1], entry, asked), TelegramReplies.activationPaidMarkup(asked.currency));
                return true;
            }
            TelegramReplies.Price price = TelegramReplies.parsePrice(text);
            if (price == null) {
                send(context, bot, token, chatId, "اكتب المبلغ بالأرقام فقط، مثلاً 15000 أو 50 دولار", TelegramReplies.FORCE_REPLY);
                return true;
            }
            TelegramStore.setPendingActivationPrice(context, chatId, pending[0], pending[1], price.amount, price.currency);
            send(context, bot, token, chatId, TelegramReplies.activationPaidQuestion(pending[1], entry, price), TelegramReplies.activationPaidMarkup(price.currency));
            return true;
        }
        if (pending != null) TelegramStore.clearPendingActivation(context, chatId); // he moved on
        if (!"activate".equals(kind)) return false;
        TelegramReplies.Reply reply = TelegramStore.MONEY.equals(bot) ? TelegramReplies.forMoney(repId, text, snapshot) : TelegramReplies.forRep(repId, text, snapshot);
        if (reply.text != null) send(context, bot, token, chatId, reply.text, reply.markup);
        return true;
    }

    /** The price already typed for the waiting activation, or null. */
    private static TelegramReplies.Price activationPrice(String[] pending) {
        if (pending == null || pending[2].isEmpty()) return null;
        try {
            double amount = Double.parseDouble(pending[2]);
            return amount > 0 ? new TelegramReplies.Price(amount, pending[3].isEmpty() ? "MRU" : pending[3]) : null;
        } catch (NumberFormatException broken) {
            return null;
        }
    }

    /** To the operator with ✅/❌ - the rep is told it's waiting, the app shows it as a request.
     * `paid`: how the customer already paid the rep ("cash", "bankily"...), "" = not yet. */
    private static void submitActivation(Context context, String bot, String repsToken, String repChat, String repId, TelegramReplies.SearchEntry entry,
                                         String plan, TelegramReplies.Price price, TelegramReplies.Snapshot snapshot, String paid) throws JSONException {
        if (!TelegramStore.isConfigured(context)) {
            send(context, bot, repsToken, repChat, "⚠️ تعذر إرسال الطلب - بوت المسؤول غير مربوط. أخبر المسؤول مباشرة.", null);
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
        record.put("amount", price.amount);
        record.put("currency", price.currency);
        record.put("repId", repId);
        record.put("accountId", entry.id);
        record.put("paid", paid == null ? "" : paid);
        record.put("id", id);
        TelegramStore.putActivation(context, id, record.toString());
        // The app shows it on the representatives page too (✅ there or here).
        addToInbox(context, bot, repChat, "", "", "", true, null, null, "repActivation", record.toString());
        tellOwner(context, TelegramReplies.activationToOwner(repName, plan, entry, price, paid), TelegramReplies.approvalButtons(id));
        send(context, bot, repsToken, repChat, TelegramReplies.activationSent(plan, entry, price, paid), null);
    }

    // ---- 💵 دفعة: amount -> currency -> whose -> ✅, then the operator approves it in the app ----

    /** A rep's text that belongs to 💵 دفعة: the command itself, or what the bot is waiting for.
     * True when handled. In the devices bot only while there's no money bot (it redirects). */
    private static boolean handlePaymentText(Context context, String bot, String token, String chatId, String text) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (snapshot == null) return false;
        if (TelegramStore.REPS.equals(bot) && !snapshot.moneyBot.isEmpty()) return false;
        boolean slash = text.trim().startsWith("/");
        String kind = snapshot.repWords.get(TelegramReplies.normalize(TelegramReplies.commandWord(text)));
        if ("payment".equals(kind)) {
            TelegramStore.clearPendingActivation(context, chatId);
            TelegramStore.clearPendingForm(context, chatId);
            startPayment(context, bot, token, chatId, repId, snapshot, TelegramReplies.afterCommand(text));
            return true;
        }
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if (pending == null || pending[0].startsWith("loan-") || pending[0].startsWith("book-")) return false;
        if (kind != null || slash) {
            TelegramStore.clearPendingPayment(context, chatId); // he moved on
            return false;
        }
        String stage = pending[0];
        if ("amount".equals(stage)) {
            startPayment(context, bot, token, chatId, repId, snapshot, text);
            return true;
        }
        TelegramReplies.Price price = pendingPrice(pending);
        if (price == null) {
            TelegramStore.clearPendingPayment(context, chatId);
            return false;
        }
        if ("currency".equals(stage)) {
            String currency = TelegramReplies.explicitCurrency(text);
            if (currency == null) {
                send(context, bot, token, chatId, TelegramReplies.currencyQuestion(price.amount), TelegramReplies.currencyMarkup());
                return true;
            }
            askMethod(context, bot, token, chatId, 0, new TelegramReplies.Price(price.amount, currency));
            return true;
        }
        if ("method".equals(stage)) {
            send(context, bot, token, chatId, TelegramReplies.methodQuestion(price), TelegramReplies.methodMarkup(price.currency));
            return true;
        }
        if ("who".equals(stage)) {
            String mode = pending[3].startsWith("?") ? pending[3].substring(1) : "";
            askWho(context, bot, token, chatId, 0, repId, snapshot, price, text.trim(), mode, 0);
            return true;
        }
        TelegramReplies.SearchEntry entry = TelegramReplies.PAY_ME.equals(pending[3]) ? null : TelegramReplies.findEntry(repId, pending[3], snapshot);
        if ("photo".equals(stage)) {
            send(context, bot, token, chatId, TelegramReplies.photoQuestion(price, entry, !pending[5].isEmpty()), TelegramReplies.photoMarkup(!pending[5].isEmpty()));
            return true;
        }
        // "confirm": he typed instead of tapping - show the summary again.
        sendPayConfirm(context, bot, token, chatId, 0, price, entry, pending);
        return true;
    }

    /** 📸 A photo sent while the bot waits for the payment's proof (or on the summary, to change
     * it): kept by its Telegram file id - the app downloads it when the operator looks. */
    private static boolean handlePaymentPhoto(Context context, String bot, String token, String chatId, String fileId) {
        String repId = TelegramStore.repIdForChat(context, chatId);
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if (repId == null || pending == null || fileId == null || fileId.isEmpty()) return false;
        if (!"photo".equals(pending[0]) && !"confirm".equals(pending[0])) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        TelegramReplies.Price price = pendingPrice(pending);
        if (snapshot == null || price == null) return false;
        TelegramReplies.SearchEntry entry = TelegramReplies.PAY_ME.equals(pending[3]) ? null : TelegramReplies.findEntry(repId, pending[3], snapshot);
        TelegramStore.setPendingPayment(context, chatId, "confirm", pending[1], pending[2], pending[3], pending[4], fileId);
        sendPayConfirm(context, bot, token, chatId, 0, price, entry, TelegramStore.pendingPayment(context, chatId));
        return true;
    }

    /** The biggest photo size Telegram offers (up to 5 MB), or an image sent as a file. */
    private static String photoFileId(JSONObject message) {
        JSONArray sizes = message.optJSONArray("photo");
        String best = null;
        for (int i = 0; sizes != null && i < sizes.length(); i++) {
            JSONObject size = sizes.optJSONObject(i);
            if (size != null && size.optLong("file_size", 0) <= 5_000_000L) best = size.optString("file_id", best);
        }
        if (best != null) return best;
        JSONObject document = message.optJSONObject("document");
        if (document != null && document.optString("mime_type", "").startsWith("image/")) return document.optString("file_id", null);
        return null;
    }

    private static void sendPayConfirm(Context context, String bot, String token, String chatId, long messageId, TelegramReplies.Price price,
                                       TelegramReplies.SearchEntry entry, String[] pending) {
        String methodName = pending == null ? null : TelegramReplies.payMethodName(price.currency, pending[4]);
        boolean hasPhoto = pending != null && !pending[5].isEmpty();
        String text = TelegramReplies.payConfirmText(price, entry, methodName, hasPhoto);
        if (messageId > 0) editOrSend(context, bot, token, chatId, messageId, text, TelegramReplies.payConfirmMarkup());
        else send(context, bot, token, chatId, text, TelegramReplies.payConfirmMarkup());
    }

    /** 💳 كاش or the banking app - دولار has only كاش, so it goes straight to the customers. */
    private static void askMethod(Context context, String bot, String token, String chatId, long messageId, TelegramReplies.Price price) {
        if (TelegramReplies.bankApps(price.currency).length == 0) {
            TelegramStore.setPendingPayment(context, chatId, "who", Double.toString(price.amount), price.currency, "", TelegramReplies.CASH, "");
            TelegramReplies.Snapshot snapshot = loadSnapshot(context);
            String repId = TelegramStore.repIdForChat(context, chatId);
            if (snapshot != null && repId != null) askWho(context, bot, token, chatId, messageId, repId, snapshot, price, "");
            return;
        }
        TelegramStore.setPendingPayment(context, chatId, "method", Double.toString(price.amount), price.currency, "", "", "");
        String text = TelegramReplies.methodQuestion(price);
        String markup = TelegramReplies.methodMarkup(price.currency);
        if (messageId > 0) editOrSend(context, bot, token, chatId, messageId, text, markup);
        else send(context, bot, token, chatId, text, markup);
    }

    /** "💵 دفعة" (maybe with "5000 سيفا محمد"), or the amount typed after it. */
    private static void startPayment(Context context, String bot, String token, String chatId, String repId, TelegramReplies.Snapshot snapshot, String rest) throws JSONException {
        TelegramReplies.Price price = TelegramReplies.parsePrice(rest);
        if (price == null) {
            boolean retry = !rest.trim().isEmpty();
            TelegramStore.setPendingPayment(context, chatId, "amount", "", "", "", "", "");
            send(context, bot, token, chatId, retry ? TelegramReplies.PAY_AMOUNT_AGAIN : TelegramReplies.PAY_AMOUNT_QUESTION, TelegramReplies.FORCE_REPLY);
            return;
        }
        String currency = TelegramReplies.explicitCurrency(rest);
        if (currency == null) {
            TelegramStore.setPendingPayment(context, chatId, "currency", Double.toString(price.amount), "", "", "", "");
            send(context, bot, token, chatId, TelegramReplies.currencyQuestion(price.amount), TelegramReplies.currencyMarkup());
            return;
        }
        askMethod(context, bot, token, chatId, 0, new TelegramReplies.Price(price.amount, currency));
    }

    /** The who step: the customers' names (a page of them), or what he searched for - mode "c"
     * customers, "d" devices, "" both. Replaces the message the button was on (messageId > 0). */
    private static void askWho(Context context, String bot, String token, String chatId, long messageId, String repId, TelegramReplies.Snapshot snapshot,
                               TelegramReplies.Price price, String query, String mode, int page) {
        TelegramStore.setPendingPayment(context, chatId, "who", Double.toString(price.amount), price.currency, mode.isEmpty() ? "" : "?" + mode);
        TelegramReplies.Reply reply = TelegramReplies.payWho(repId, price, query, mode, page, snapshot);
        if (messageId > 0) editOrSend(context, bot, token, chatId, messageId, reply.text, reply.markup);
        else send(context, bot, token, chatId, reply.text, reply.markup);
    }

    private static void askWho(Context context, String bot, String token, String chatId, long messageId, String repId, TelegramReplies.Snapshot snapshot,
                               TelegramReplies.Price price, String query) {
        askWho(context, bot, token, chatId, messageId, repId, snapshot, price, query, "", 0);
    }

    private static TelegramReplies.Price pendingPrice(String[] pending) {
        try {
            double amount = Double.parseDouble(pending[1]);
            return amount > 0 ? new TelegramReplies.Price(amount, pending[2]) : null;
        } catch (NumberFormatException broken) {
            return null;
        }
    }

    /** payc:<currency> · payt:<device id | me> · payw (change whose) · payok · payx. */
    private static String paymentCallback(Context context, String bot, String token, String chatId, long messageId, String repId,
                                          TelegramReplies.Snapshot snapshot, String data) throws JSONException {
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if ("payx".equals(data)) {
            TelegramStore.clearPendingPayment(context, chatId);
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.PAY_CANCELLED, null);
            return "أُلغيت";
        }
        TelegramReplies.Price price = pending == null ? null : pendingPrice(pending);
        if (price == null) return TelegramReplies.PAY_EXPIRED;
        if (data.startsWith("payc:")) {
            String currency = data.substring(5);
            if (!TelegramReplies.isPayCurrency(currency)) return "اختيار غير صالح";
            askMethod(context, bot, token, chatId, messageId, new TelegramReplies.Price(price.amount, currency));
            return null;
        }
        if (!TelegramReplies.isPayCurrency(price.currency)) return "اختر العملة أولاً";
        if (data.startsWith("paym:")) {
            String method = data.substring(5);
            String methodName = TelegramReplies.payMethodName(price.currency, method);
            if (methodName == null) return "اختيار غير صالح";
            TelegramStore.setPendingPayment(context, chatId, "who", pending[1], price.currency, "", method, "");
            askWho(context, bot, token, chatId, messageId, repId, snapshot, price, "");
            return methodName;
        }
        if (TelegramReplies.payMethodName(price.currency, pending[4]) == null) return "اختر طريقة الدفع أولاً";
        if ("payw".equals(data)) {
            askWho(context, bot, token, chatId, messageId, repId, snapshot, price, "");
            return null;
        }
        if (data.startsWith("payp:")) {
            int page;
            try {
                page = Integer.parseInt(data.substring(5));
            } catch (NumberFormatException broken) {
                return "اختيار غير صالح";
            }
            askWho(context, bot, token, chatId, messageId, repId, snapshot, price, "", "", page);
            return null;
        }
        if (data.startsWith("payl:")) {
            TelegramReplies.PayClient client = TelegramReplies.findPayClient(repId, data.substring(5), snapshot);
            if (client == null) return "هذا الزبون ليس من زبائنك";
            TelegramStore.setPendingPayment(context, chatId, "who", pending[1], price.currency, "");
            TelegramReplies.Reply reply = TelegramReplies.payClientDevices(price, client);
            editOrSend(context, bot, token, chatId, messageId, reply.text, reply.markup);
            return client.name;
        }
        if ("payq:c".equals(data) || "payq:d".equals(data)) {
            boolean clients = "payq:c".equals(data);
            TelegramStore.setPendingPayment(context, chatId, "who", pending[1], price.currency, clients ? "?c" : "?d");
            send(context, bot, token, chatId, clients ? TelegramReplies.PAY_SEARCH_CLIENT : TelegramReplies.PAY_SEARCH_DEVICE,
                TelegramReplies.forceReply(clients ? "اسم الزبون" : "الجهاز / الإيميل / KIT"));
            return null;
        }
        if (data.startsWith("payt:")) {
            String target = data.substring(5);
            TelegramReplies.SearchEntry entry = TelegramReplies.PAY_ME.equals(target) ? null : TelegramReplies.findEntry(repId, target, snapshot);
            if (entry == null && !TelegramReplies.PAY_ME.equals(target)) return "هذا الجهاز ليس من أجهزتك";
            TelegramStore.setPendingPayment(context, chatId, "photo", pending[1], price.currency, target);
            boolean hasPhoto = !pending[5].isEmpty();
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.photoQuestion(price, entry, hasPhoto), TelegramReplies.photoMarkup(hasPhoto));
            return null;
        }
        if ("paynp".equals(data)) {
            if (!"photo".equals(pending[0])) return "اختر الزبون أولاً";
            String target = pending[3];
            TelegramReplies.SearchEntry entry = TelegramReplies.PAY_ME.equals(target) ? null : TelegramReplies.findEntry(repId, target, snapshot);
            if (entry == null && !TelegramReplies.PAY_ME.equals(target)) return "هذا الجهاز ليس من أجهزتك";
            TelegramStore.setPendingPayment(context, chatId, "confirm", pending[1], price.currency, target);
            sendPayConfirm(context, bot, token, chatId, messageId, price, entry, TelegramStore.pendingPayment(context, chatId));
            return null;
        }
        if ("payok".equals(data)) {
            if (!"confirm".equals(pending[0])) return "اختر الزبون أولاً";
            String target = pending[3];
            TelegramReplies.SearchEntry entry = TelegramReplies.PAY_ME.equals(target) ? null : TelegramReplies.findEntry(repId, target, snapshot);
            if (entry == null && !TelegramReplies.PAY_ME.equals(target)) return "هذا الجهاز ليس من أجهزتك";
            TelegramStore.clearPendingPayment(context, chatId);
            JSONObject record = new JSONObject();
            String recordId = java.util.UUID.randomUUID().toString();
            long now = System.currentTimeMillis();
            record.put("id", recordId);
            record.put("repId", repId);
            record.put("amount", price.amount);
            record.put("currency", price.currency);
            record.put("personal", entry == null);
            record.put("accountId", entry == null ? "" : entry.id);
            record.put("target", entry == null ? "" : TelegramReplies.payTargetLabel(entry));
            record.put("label", price.label());
            record.put("method", pending[4]);
            record.put("photo", pending[5]);
            record.put("bot", bot);
            record.put("at", System.currentTimeMillis());
            addToInbox(context, bot, chatId, "", "", "", true, null, null, "repPayment", record.toString());
            Map<String, String> mine = snapshot.reps.get(repId);
            String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
            String methodName = TelegramReplies.payMethodName(price.currency, pending[4]);
            boolean hasPhoto = !pending[5].isEmpty();
            if (entry != null && entry.own) {
                // His own customer: straight into his book (the app records it), no approval.
                editOrSend(context, bot, token, chatId, messageId, TelegramReplies.payBooked(price, entry, methodName, hasPhoto),
                    TelegramReplies.bookUndoMarkup(recordId, now));
                return "✅ سُجّلت";
            }
            tellOwner(context, TelegramReplies.payToOwner(repName, price, entry, methodName, hasPhoto), null);
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.paySent(price, entry, methodName, hasPhoto), null);
            return "✅ أُرسلت";
        }
        return null;
    }

    // ---- 📒 ➕➖ له/عليه in the rep's own book: customer -> عليه/له -> amount -> note -> ✅ ----
    // Kept in the same waiting slot as 💵 دفعة (stages "book-..."): target = customer id,
    // method = "c" (عليه) / "r" (له), photo = the note.

    private static boolean handleBookText(Context context, String bot, String token, String chatId, String text) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (snapshot == null) return false;
        if (TelegramStore.REPS.equals(bot) && !snapshot.moneyBot.isEmpty()) return false;
        boolean slash = text.trim().startsWith("/");
        String kind = snapshot.repWords.get(TelegramReplies.normalize(TelegramReplies.commandWord(text)));
        if ("book".equals(kind)) {
            TelegramStore.clearPendingActivation(context, chatId);
            TelegramStore.clearPendingForm(context, chatId);
            TelegramStore.clearPendingPayment(context, chatId);
            TelegramReplies.Reply reply = TelegramReplies.bookStart(repId, 0, snapshot);
            send(context, bot, token, chatId, reply.text, reply.markup);
            return true;
        }
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if (pending == null || !pending[0].startsWith("book-")) return false;
        if (kind != null || slash) {
            TelegramStore.clearPendingPayment(context, chatId); // he moved on
            return false;
        }
        TelegramReplies.PayClient client = TelegramReplies.findBookClient(repId, pending[3], snapshot);
        if (client == null) {
            TelegramStore.clearPendingPayment(context, chatId);
            send(context, bot, token, chatId, TelegramReplies.BOOK_EXPIRED, null);
            return true;
        }
        String stage = pending[0];
        if ("book-kind".equals(stage)) {
            send(context, bot, token, chatId, TelegramReplies.bookKindQuestion(client), TelegramReplies.bookKindMarkup());
            return true;
        }
        if ("book-amount".equals(stage)) {
            TelegramReplies.Price price = TelegramReplies.parsePrice(text);
            if (price == null) {
                send(context, bot, token, chatId, TelegramReplies.BOOK_AMOUNT_AGAIN, TelegramReplies.forceReply("المبلغ والعملة"));
                return true;
            }
            String currency = TelegramReplies.explicitCurrency(text);
            if (currency == null) {
                TelegramStore.setPendingPayment(context, chatId, "book-currency", Double.toString(price.amount), "", client.id, pending[4], "");
                send(context, bot, token, chatId, TelegramReplies.currencyQuestion(price.amount), TelegramReplies.bookCurrencyMarkup());
                return true;
            }
            askBookNote(context, bot, token, chatId, 0, client, pending[4], new TelegramReplies.Price(price.amount, currency));
            return true;
        }
        TelegramReplies.Price price = pendingPrice(pending);
        if (price == null) {
            TelegramStore.clearPendingPayment(context, chatId);
            return false;
        }
        if ("book-currency".equals(stage)) {
            String currency = TelegramReplies.explicitCurrency(text);
            if (currency == null) send(context, bot, token, chatId, TelegramReplies.currencyQuestion(price.amount), TelegramReplies.bookCurrencyMarkup());
            else askBookNote(context, bot, token, chatId, 0, client, pending[4], new TelegramReplies.Price(price.amount, currency));
            return true;
        }
        if ("book-note".equals(stage)) {
            String note = TelegramReplies.oneLine(text);
            TelegramStore.setPendingPayment(context, chatId, "book-confirm", pending[1], price.currency, client.id, pending[4], note);
            send(context, bot, token, chatId, TelegramReplies.bookConfirmText(client.name, pending[4], price, note), TelegramReplies.bookConfirmMarkup());
            return true;
        }
        // "book-confirm": he typed instead of tapping - show the summary again.
        send(context, bot, token, chatId, TelegramReplies.bookConfirmText(client.name, pending[4], price, pending[5]), TelegramReplies.bookConfirmMarkup());
        return true;
    }

    private static void askBookNote(Context context, String bot, String token, String chatId, long messageId, TelegramReplies.PayClient client,
                                    String kind, TelegramReplies.Price price) {
        TelegramStore.setPendingPayment(context, chatId, "book-note", Double.toString(price.amount), price.currency, client.id, kind, "");
        String text = "📒 " + client.name + " - " + TelegramReplies.bookKindWord(kind) + " " + price.label() + "\n\n" + TelegramReplies.bookNoteQuestion();
        if (messageId > 0) editOrSend(context, bot, token, chatId, messageId, text, TelegramReplies.bookNoteMarkup());
        else send(context, bot, token, chatId, text, TelegramReplies.bookNoteMarkup());
    }

    /** bkl:<customer> · bkp:<page> · bkk:c|r · bkc:<currency> · bkn · bkok · bkx · bku:<id>:<minute>. */
    private static String bookCallback(Context context, String bot, String token, String chatId, long messageId, String repId,
                                       TelegramReplies.Snapshot snapshot, String data, String messageText) throws JSONException {
        if (data.startsWith("bku:")) {
            String[] parts = data.split(":", -1);
            if (parts.length < 3) return "اختيار غير صالح";
            long at;
            try {
                at = Long.parseLong(parts[2]) * 60000L;
            } catch (NumberFormatException broken) {
                return "اختيار غير صالح";
            }
            if (System.currentTimeMillis() - at > TelegramReplies.BOOK_UNDO_MS) return "مضى أكثر من 24 ساعة - لا يمكن التراجع";
            JSONObject record = new JSONObject();
            record.put("id", parts[1]);
            record.put("repId", repId);
            record.put("at", System.currentTimeMillis());
            addToInbox(context, bot, chatId, "", "", "", true, null, null, "repBookUndo", record.toString());
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.bookUndone(messageText == null ? "↩️ أُلغيت العملية من دفترك." : messageText), null);
            return "↩️ أُلغيت";
        }
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if ("bkx".equals(data)) {
            if (pending != null && pending[0].startsWith("book-")) TelegramStore.clearPendingPayment(context, chatId);
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.BOOK_CANCELLED, null);
            return "أُلغي";
        }
        if (data.startsWith("bkp:")) {
            int page;
            try {
                page = Integer.parseInt(data.substring(4));
            } catch (NumberFormatException broken) {
                return "اختيار غير صالح";
            }
            TelegramReplies.Reply reply = TelegramReplies.bookStart(repId, page, snapshot);
            editOrSend(context, bot, token, chatId, messageId, reply.text, reply.markup);
            return null;
        }
        if (data.startsWith("bkl:")) {
            TelegramReplies.PayClient client = TelegramReplies.findBookClient(repId, data.substring(4), snapshot);
            if (client == null) return "هذا الزبون ليس في دفترك";
            TelegramStore.setPendingPayment(context, chatId, "book-kind", "", "", client.id, "", "");
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.bookKindQuestion(client), TelegramReplies.bookKindMarkup());
            return client.name;
        }
        if (pending == null || !pending[0].startsWith("book-")) return TelegramReplies.BOOK_EXPIRED;
        TelegramReplies.PayClient client = TelegramReplies.findBookClient(repId, pending[3], snapshot);
        if (client == null) return TelegramReplies.BOOK_EXPIRED;
        if (data.startsWith("bkk:")) {
            String kind = data.substring(4);
            if (!"c".equals(kind) && !"r".equals(kind)) return "اختيار غير صالح";
            TelegramStore.setPendingPayment(context, chatId, "book-amount", "", "", client.id, kind, "");
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.bookKindQuestion(client) + "\n\n" + ("c".equals(kind) ? "➕ عليه" : "➖ له"), null);
            send(context, bot, token, chatId, TelegramReplies.bookAmountQuestion(client.name, kind), TelegramReplies.forceReply("المبلغ والعملة"));
            return null;
        }
        TelegramReplies.Price price = pendingPrice(pending);
        if (data.startsWith("bkc:")) {
            String currency = data.substring(4);
            if (price == null || !TelegramReplies.isPayCurrency(currency)) return "اختيار غير صالح";
            askBookNote(context, bot, token, chatId, messageId, client, pending[4], new TelegramReplies.Price(price.amount, currency));
            return null;
        }
        if (price == null || !TelegramReplies.isPayCurrency(price.currency)) return "أكمل الخطوات أولاً";
        if ("bkn".equals(data)) {
            TelegramStore.setPendingPayment(context, chatId, "book-confirm", pending[1], price.currency, client.id, pending[4], "");
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.bookConfirmText(client.name, pending[4], price, ""), TelegramReplies.bookConfirmMarkup());
            return null;
        }
        if ("bkok".equals(data)) {
            if (!"book-confirm".equals(pending[0])) return "أكمل الخطوات أولاً";
            TelegramStore.clearPendingPayment(context, chatId);
            String id = java.util.UUID.randomUUID().toString();
            long now = System.currentTimeMillis();
            JSONObject record = new JSONObject();
            record.put("id", id);
            record.put("repId", repId);
            record.put("clientId", client.id);
            record.put("client", client.name);
            record.put("kind", "c".equals(pending[4]) ? "charge" : "credit");
            record.put("amount", price.amount);
            record.put("currency", price.currency);
            record.put("note", pending[5]);
            record.put("at", now);
            addToInbox(context, bot, chatId, "", "", "", true, null, null, "repBookEntry", record.toString());
            String what = "c".equals(pending[4]) ? "➕ عليه" : "➖ له";
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.bookSaved(client.name, what, price, pending[5]), TelegramReplies.bookUndoMarkup(id, now));
            return "✅ سُجّل";
        }
        return null;
    }

    // ---- 🏦 دين (سلفة): amount -> currency -> banking app -> recipient's number -> ✅, then the operator ----
    // Kept in the same waiting slot as 💵 دفعة (stages "loan-..."), target "appCode|number".

    /** A rep's text that belongs to 🏦 دين: the command itself, or what the bot is waiting for. */
    private static boolean handleLoanText(Context context, String bot, String token, String chatId, String text) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) return false;
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (snapshot == null) return false;
        if (TelegramStore.REPS.equals(bot) && !snapshot.moneyBot.isEmpty()) return false;
        boolean slash = text.trim().startsWith("/");
        String kind = snapshot.repWords.get(TelegramReplies.normalize(TelegramReplies.commandWord(text)));
        if ("loan".equals(kind)) {
            TelegramStore.clearPendingActivation(context, chatId);
            TelegramStore.clearPendingForm(context, chatId);
            startLoan(context, bot, token, chatId, TelegramReplies.parsePrice(TelegramReplies.afterCommand(text).replaceAll("^\\(?سلفة\\)?", "")));
            return true;
        }
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if (pending == null || !pending[0].startsWith("loan-")) return false;
        if (kind != null || slash) {
            TelegramStore.clearPendingPayment(context, chatId); // he moved on
            return false;
        }
        String stage = pending[0];
        if ("loan-amount".equals(stage)) {
            TelegramReplies.Price price = TelegramReplies.parsePrice(text);
            if (price == null) send(context, bot, token, chatId, TelegramReplies.PAY_AMOUNT_AGAIN, TelegramReplies.FORCE_REPLY);
            else startLoan(context, bot, token, chatId, price);
            return true;
        }
        TelegramReplies.Price price = pendingPrice(pending);
        if (price == null) {
            TelegramStore.clearPendingPayment(context, chatId);
            return false;
        }
        if ("loan-currency".equals(stage)) {
            send(context, bot, token, chatId, TelegramReplies.loanCurrencyQuestion(price.amount), TelegramReplies.loanCurrencyMarkup());
            return true;
        }
        String[] target = pending[3].split("\\|", -1);
        String appName = TelegramReplies.loanAppName(price.currency, target[0]);
        if ("loan-app".equals(stage) || appName == null) {
            send(context, bot, token, chatId, TelegramReplies.loanAppQuestion(price), TelegramReplies.loanAppMarkup(price.currency));
            return true;
        }
        if ("loan-number".equals(stage)) {
            String number = TelegramReplies.parseLoanNumber(text);
            if (number == null) {
                send(context, bot, token, chatId, TelegramReplies.LOAN_NUMBER_AGAIN, TelegramReplies.forceReply("رقم المستلم"));
                return true;
            }
            TelegramStore.setPendingPayment(context, chatId, "loan-confirm", pending[1], price.currency, target[0] + "|" + number);
            send(context, bot, token, chatId, TelegramReplies.loanConfirmText(price, appName, number), TelegramReplies.loanConfirmMarkup());
            return true;
        }
        // "loan-confirm": he typed instead of tapping - show the summary again.
        send(context, bot, token, chatId, TelegramReplies.loanConfirmText(price, appName, target.length > 1 ? target[1] : ""), TelegramReplies.loanConfirmMarkup());
        return true;
    }

    /** No amount yet -> ask for it; an amount -> the currency buttons. */
    private static void startLoan(Context context, String bot, String token, String chatId, TelegramReplies.Price price) {
        if (price == null) {
            TelegramStore.setPendingPayment(context, chatId, "loan-amount", "", "", "", "", "");
            send(context, bot, token, chatId, TelegramReplies.LOAN_AMOUNT_QUESTION, TelegramReplies.FORCE_REPLY);
            return;
        }
        TelegramStore.setPendingPayment(context, chatId, "loan-currency", Double.toString(price.amount), "", "", "", "");
        send(context, bot, token, chatId, TelegramReplies.loanCurrencyQuestion(price.amount), TelegramReplies.loanCurrencyMarkup());
    }

    /** lnc:<currency> · lna:<app> · lnok · lnx. */
    private static String loanCallback(Context context, String bot, String token, String chatId, long messageId, String repId,
                                       TelegramReplies.Snapshot snapshot, String data) throws JSONException {
        String[] pending = TelegramStore.pendingPayment(context, chatId);
        if ("lnx".equals(data)) {
            if (pending != null && pending[0].startsWith("loan-")) TelegramStore.clearPendingPayment(context, chatId);
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.LOAN_CANCELLED, null);
            return "أُلغي";
        }
        TelegramReplies.Price price = pending == null || !pending[0].startsWith("loan-") ? null : pendingPrice(pending);
        if (price == null) return TelegramReplies.LOAN_EXPIRED;
        if (data.startsWith("lnc:")) {
            String currency = data.substring(4);
            if (TelegramReplies.loanApps(currency).length == 0) return "اختيار غير صالح";
            TelegramReplies.Price chosen = new TelegramReplies.Price(price.amount, currency);
            TelegramStore.setPendingPayment(context, chatId, "loan-app", pending[1], currency, "");
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.loanAppQuestion(chosen), TelegramReplies.loanAppMarkup(currency));
            return null;
        }
        if (data.startsWith("lna:")) {
            String app = data.substring(4);
            String appName = TelegramReplies.loanAppName(price.currency, app);
            if (appName == null) return "اختر العملة أولاً";
            TelegramStore.setPendingPayment(context, chatId, "loan-number", pending[1], price.currency, app + "|");
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.loanAppQuestion(price) + "\n\n📲 " + appName, null);
            send(context, bot, token, chatId, TelegramReplies.loanNumberQuestion(price, appName), TelegramReplies.forceReply("رقم المستلم"));
            return appName;
        }
        if ("lnok".equals(data)) {
            String[] target = pending[3].split("\\|", -1);
            String appName = TelegramReplies.loanAppName(price.currency, target[0]);
            if (!"loan-confirm".equals(pending[0]) || appName == null || target.length < 2 || target[1].isEmpty()) return "أكمل الخطوات أولاً";
            TelegramStore.clearPendingPayment(context, chatId);
            JSONObject record = new JSONObject();
            record.put("repId", repId);
            record.put("amount", price.amount);
            record.put("currency", price.currency);
            record.put("app", appName);
            record.put("number", target[1]);
            record.put("label", price.label());
            record.put("at", System.currentTimeMillis());
            addToInbox(context, bot, chatId, "", "", "", true, null, null, "repLoan", record.toString());
            Map<String, String> mine = snapshot.reps.get(repId);
            String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
            tellOwner(context, TelegramReplies.loanToOwner(repName, price, appName, target[1]), null);
            editOrSend(context, bot, token, chatId, messageId, TelegramReplies.loanSent(price, appName, target[1]), null);
            return "✅ أُرسل";
        }
        return null;
    }

    // ---- 💰 money / 🔔 alerts bots ----

    /** A message to the money or alerts bot (always answered here). */
    private static void answerExtra(Context context, String bot, String token, String chatId, String name, String username, String text) throws JSONException {
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        String repId = TelegramStore.repIdForChat(context, chatId);
        if (repId == null) {
            send(context, bot, token, chatId, TelegramReplies.notLinkedExtra(snapshot), null);
            return;
        }
        if (snapshot == null) {
            send(context, bot, token, chatId, TelegramReplies.NOT_READY, null);
            return;
        }
        if (TelegramStore.ALERTS.equals(bot)) {
            send(context, bot, token, chatId, snapshot.alertsInfo, "{\"remove_keyboard\":true}");
            return;
        }
        if (handleBookText(context, bot, token, chatId, text)) return;
        if (handleLoanText(context, bot, token, chatId, text)) return;
        if (handlePaymentText(context, bot, token, chatId, text)) return;
        if (handleActivationText(context, bot, token, chatId, text)) return;
        TelegramReplies.Reply reply = TelegramReplies.forMoney(repId, text, snapshot);
        if (reply.toInbox) addToInbox(context, TelegramStore.MONEY, chatId, name, username, text, true);
        if (reply.text != null) send(context, bot, token, chatId, reply.text, reply.markup);
        if (reply.ownerNotice != null) tellOwner(context, reply.ownerNotice, null);
    }

    /** 💰 bot buttons: a device's card (md:), its debt / statement (v:d: / v:s:), ⚡. */
    private static String moneyCallback(Context context, String token, String chatId, long messageId, String data) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (repId == null || snapshot == null) return "افتح تطبيق المسؤول مرة ثم أعد المحاولة";
        if (data.startsWith("pay")) return paymentCallback(context, TelegramStore.MONEY, token, chatId, messageId, repId, snapshot, data);
        if (data.startsWith("ln")) return loanCallback(context, TelegramStore.MONEY, token, chatId, messageId, repId, snapshot, data);
        if (data.startsWith("sp:")) {
            int page;
            try {
                page = Integer.parseInt(data.substring(3));
            } catch (NumberFormatException broken) {
                return "اختيار غير صالح";
            }
            TelegramReplies.Reply reply = TelegramReplies.moneySearchStart(repId, page, snapshot);
            editOrSend(context, TelegramStore.MONEY, token, chatId, messageId, reply.text, reply.markup);
            return null;
        }
        if (data.startsWith("sl:")) {
            TelegramReplies.PayClient client = TelegramReplies.findPayClient(repId, data.substring(3), snapshot);
            if (client == null) return "هذا الزبون ليس من زبائنك";
            if (client.devices.size() == 1 && client.devices.get(0).hasMenu()) {
                TelegramReplies.Reply card = TelegramReplies.moneyCard(client.devices.get(0), snapshot);
                editOrSend(context, TelegramStore.MONEY, token, chatId, messageId, card.text, card.markup);
                return client.name;
            }
            TelegramReplies.Reply reply = TelegramReplies.searchClientDevices(client);
            editOrSend(context, TelegramStore.MONEY, token, chatId, messageId, reply.text, reply.markup);
            return client.name;
        }
        if ("sq:c".equals(data) || "sq:d".equals(data)) {
            boolean clients = "sq:c".equals(data);
            // Whatever he types next is searched by forMoney (names, phones, KIT, emails).
            send(context, TelegramStore.MONEY, token, chatId, clients ? TelegramReplies.PAY_SEARCH_CLIENT : TelegramReplies.PAY_SEARCH_DEVICE,
                TelegramReplies.forceReply(clients ? "اسم الزبون" : "الجهاز / الإيميل / KIT"));
            return null;
        }
        if (data.startsWith("md:")) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, data.substring(3), snapshot);
            if (entry == null || !entry.hasMenu()) return "هذا الجهاز ليس من أجهزتك";
            TelegramReplies.Reply reply = TelegramReplies.moneyCard(entry, snapshot);
            send(context, TelegramStore.MONEY, token, chatId, reply.text, reply.markup);
            return entry.deviceName();
        }
        if (data.startsWith("v:d:") || data.startsWith("v:s:")) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, data.substring(4), snapshot);
            if (entry == null || !entry.hasMenu()) return "هذا الجهاز ليس من أجهزتك";
            editOrSend(context, TelegramStore.MONEY, token, chatId, messageId, TelegramReplies.moneyCardText(entry, data.substring(2, 3), snapshot), TelegramReplies.moneyCardMarkup(entry));
            return null;
        }
        return activationCallback(context, TelegramStore.MONEY, token, chatId, repId, snapshot, data);
    }

    /** 🔔 "📨 اطلب من المسؤول الدفع" under a stopped-device alert. */
    private static String alertsCallback(Context context, String token, String chatId, long messageId, String messageText, String data) throws JSONException {
        if (!data.startsWith("pq:")) return null;
        String repId = TelegramStore.repIdForChat(context, chatId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (repId == null || snapshot == null) return "افتح تطبيق المسؤول مرة ثم أعد المحاولة";
        TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, data.substring(3), snapshot);
        if (entry == null) return "هذا الجهاز ليس من أجهزتك";
        if (!TelegramStore.isConfigured(context)) return "بوت المسؤول غير مربوط - أخبره مباشرة";
        Map<String, String> mine = snapshot.reps.get(repId);
        String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
        tellOwner(context, TelegramReplies.payRequestToOwner(repName, entry), null);
        editOrSend(context, TelegramStore.ALERTS, token, chatId, messageId, messageText + TelegramReplies.PAY_REQUEST_SENT, TelegramReplies.afterPayRequestMarkup(entry));
        return "✅ أُرسل للمسؤول";
    }

    /** ⛔ One device just stopped (AutoSyncWorker): to its rep's 🔔 alerts bot (the devices bot
     * when that one isn't connected), with a copy to the operator. False when the app hasn't
     * prepared that device yet - the caller then sends the plain list instead. */
    static boolean queueStoppedAlert(Context context, String repId, String accountId, String status) {
        if (repId == null || accountId == null || !TelegramStore.isRepsConfigured(context)) return false;
        List<String> chatIds = TelegramStore.repChatIds(context, repId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (chatIds.isEmpty() || snapshot == null) return false;
        TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, accountId, snapshot);
        if (entry == null) return false;
        String text = TelegramReplies.stoppedAlert(entry, status);
        for (String chatId : chatIds) TelegramSendWorker.enqueueToRepBot(context, TelegramStore.ALERTS, chatId, text, TelegramReplies.stoppedAlertMarkup(entry));
        if (TelegramStore.extraToken(context, TelegramStore.ALERTS) != null && TelegramStore.isConfigured(context)) {
            Map<String, String> mine = snapshot.reps.get(repId);
            TelegramSendWorker.enqueue(context, TelegramReplies.ownerCopy(mine != null && mine.get("name") != null ? mine.get("name") : "", text));
        }
        return true;
    }

    // ---- ✏️ / 📝 typed after tapping them in the device menu ----

    /** The value a rep typed after ✏️ <field> or 📝: to the operator (an edit waits for ✅),
     * and to the app, which records it. True when handled. */
    private static boolean handleFormText(Context context, String token, String chatId, String text) throws JSONException {
        String[] pending = TelegramStore.pendingForm(context, chatId);
        if (pending == null) return false;
        String repId = TelegramStore.repIdForChat(context, chatId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        // A keyboard button or a command means he moved on.
        boolean command = text.trim().startsWith("/") || (snapshot != null && snapshot.repWords.containsKey(TelegramReplies.normalize(TelegramReplies.commandWord(text))));
        TelegramStore.clearPendingForm(context, chatId);
        if (repId == null || snapshot == null || command) return false;
        TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, pending[1], snapshot);
        if (entry == null) return false;
        String value = text.trim();
        if (value.isEmpty()) return true;
        if (value.length() > TelegramReplies.MAX_FORM_CHARS) value = value.substring(0, TelegramReplies.MAX_FORM_CHARS);
        Map<String, String> mine = snapshot.reps.get(repId);
        String repName = mine != null && mine.get("name") != null ? mine.get("name") : "";
        boolean owner = TelegramStore.isConfigured(context);
        JSONObject data = new JSONObject();
        data.put("repId", repId);
        data.put("accountId", entry.id);
        data.put("at", System.currentTimeMillis());
        if ("note".equals(pending[0])) {
            data.put("text", value);
            addToInbox(context, TelegramStore.REPS, chatId, "", "", "", true, null, null, "repNote", data.toString());
            if (owner) tellOwner(context, TelegramReplies.noteToOwner(repName, entry, value), null);
            send(context, TelegramStore.REPS, token, chatId, TelegramReplies.noteSent(entry), snapshot.repKeyboard);
            return true;
        }
        String id = Long.toString(System.currentTimeMillis() % 2176782336L, 36) + Integer.toString((int) (Math.random() * 1296), 36);
        String old = entry.editValues.get(pending[2]);
        data.put("id", id);
        data.put("field", pending[2]);
        data.put("value", value);
        data.put("old", old == null ? "" : old);
        data.put("repChat", chatId);
        data.put("device", entry.deviceName());
        TelegramStore.putEdit(context, id, data.toString());
        addToInbox(context, TelegramStore.REPS, chatId, "", "", "", true, null, null, "repEdit", data.toString());
        if (owner) tellOwner(context, TelegramReplies.editToOwner(repName, entry, pending[2], value), TelegramReplies.editButtons(id));
        send(context, TelegramStore.REPS, token, chatId, TelegramReplies.editSent(entry, pending[2], value), snapshot.repKeyboard);
        return true;
    }

    // ---- the device menu ----

    /** Replaces the menu message in place; a new message when it can't be edited. */
    private static void editOrSend(Context context, String token, String chatId, long messageId, String text, String markup) {
        editOrSend(context, TelegramStore.REPS, token, chatId, messageId, text, markup);
    }

    private static void editOrSend(Context context, String bot, String token, String chatId, long messageId, String text, String markup) {
        if (messageId > 0) {
            try {
                TelegramClient.editMessageText(token, chatId, messageId, text, markup);
                return;
            } catch (TelegramClient.TelegramError rejected) {
                // "message is not modified" (the same button twice) - nothing to do.
                if (rejected.getMessage() != null && rejected.getMessage().contains("not modified")) return;
            } catch (IOException offline) {
                // fall through to a new message (queued if still offline)
            }
        }
        send(context, bot, token, chatId, text, markup);
    }

    private static final long NETWORK_WAIT_MS = 150_000;
    private static final long NETWORK_POLL_MS = 2_000;

    /** 📶: refresh the device from Starlink now, then show its dots - never an older reading. */
    private static void checkNetwork(Context context, String token, String chatId, long messageId, TelegramReplies.SearchEntry entry, TelegramReplies.Snapshot snapshot) {
        String menu = TelegramReplies.menuMarkup(entry, snapshot);
        if (SyncPacing.inCooldown(SyncPacing.rateLimitedAt(context), System.currentTimeMillis())) {
            editOrSend(context, token, chatId, messageId, TelegramReplies.networkBusy(entry), menu);
            return;
        }
        boolean signedIn = false;
        for (AutoSyncAccountStore.Entry e : AutoSyncAccountStore.load(context)) signedIn |= e.accountId.equals(entry.id);
        if (!signedIn) {
            editOrSend(context, token, chatId, messageId, TelegramReplies.networkNoLogin(entry), menu);
            return;
        }
        long askedAt = System.currentTimeMillis();
        AutoSyncScheduler.triggerNow(context, entry.id, true);
        editOrSend(context, token, chatId, messageId, TelegramReplies.networkChecking(entry), null);
        Thread wait = new Thread(() -> {
            String[] dots = null;
            long until = System.currentTimeMillis() + NETWORK_WAIT_MS;
            while (dots == null && System.currentTimeMillis() < until) {
                sleep(NETWORK_POLL_MS);
                dots = LiveCheckStore.since(context, entry.id, askedAt);
            }
            String time = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT).format(new java.util.Date());
            String text = dots == null ? TelegramReplies.networkFailed(entry) : TelegramReplies.networkResult(entry, dots[0], dots[1], time);
            editOrSend(context, token, chatId, messageId, text, menu);
        }, "starnet-network-check");
        wait.setDaemon(true);
        wait.start();
    }

    /** A tapped device-menu button; null when `data` isn't one. */
    private static String menuCallback(Context context, String token, String chatId, long messageId, String repId, TelegramReplies.Snapshot snapshot, String data) {
        TelegramReplies.Tap tap = TelegramReplies.parseTap(data);
        if (tap == null) return null;
        TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, tap.accountId, snapshot);
        if (entry == null || !entry.hasMenu()) return "هذا الجهاز ليس من أجهزتك";
        switch (tap.kind) {
            case "menu":
                send(context, TelegramStore.REPS, token, chatId, TelegramReplies.menuText(entry), TelegramReplies.menuMarkup(entry, snapshot));
                return entry.deviceName();
            case "view":
                if ("n".equals(tap.code)) {
                    checkNetwork(context, token, chatId, messageId, entry, snapshot);
                    return "📶 جارٍ التحديث...";
                }
                String text = "h".equals(tap.code) ? TelegramReplies.menuText(entry) : TelegramReplies.sectionText(entry, tap.code, snapshot);
                editOrSend(context, token, chatId, messageId, text, TelegramReplies.menuMarkup(entry, snapshot));
                return "";
            case "edit":
                editOrSend(context, token, chatId, messageId, TelegramReplies.editText(entry), TelegramReplies.editMarkup(entry.id));
                return "";
            case "field":
                TelegramStore.setPendingForm(context, chatId, "edit", entry.id, tap.code);
                send(context, TelegramStore.REPS, token, chatId, TelegramReplies.fieldQuestion(entry, tap.code), TelegramReplies.EDIT_REPLY);
                return "";
            case "note":
                TelegramStore.setPendingForm(context, chatId, "note", entry.id, "");
                send(context, TelegramStore.REPS, token, chatId, TelegramReplies.noteQuestion(entry), TelegramReplies.NOTE_REPLY);
                return "";
            default:
                return null;
        }
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
            long messageId = message != null ? message.optLong("message_id") : 0;
            if (data.startsWith("bk") && (TelegramStore.REPS.equals(bot) || TelegramStore.MONEY.equals(bot))) {
                // 📒 ➕➖ له/عليه and ↩️ تراجع - the rep's own book.
                String repId = TelegramStore.repIdForChat(context, chatId);
                TelegramReplies.Snapshot snapshot = loadSnapshot(context);
                toast = repId == null || snapshot == null ? "افتح تطبيق المسؤول مرة ثم أعد المحاولة"
                    : bookCallback(context, bot, token, chatId, messageId, repId, snapshot, data, message != null ? message.optString("text", "") : "");
            } else if (TelegramStore.REPS.equals(bot)) {
                toast = repCallback(context, token, chatId, messageId, data);
            } else if (TelegramStore.MONEY.equals(bot)) {
                toast = moneyCallback(context, token, chatId, messageId, data);
            } else if (TelegramStore.ALERTS.equals(bot)) {
                toast = alertsCallback(context, token, chatId, messageId, message != null ? message.optString("text", "") : "", data);
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

    private static String repCallback(Context context, String token, String chatId, long messageId, String data) throws JSONException {
        String repId = TelegramStore.repIdForChat(context, chatId);
        TelegramReplies.Snapshot snapshot = loadSnapshot(context);
        if (repId == null || snapshot == null) return "افتح تطبيق المسؤول مرة ثم أعد المحاولة";
        if (data.startsWith("pay")) return paymentCallback(context, TelegramStore.REPS, token, chatId, messageId, repId, snapshot, data);
        if (data.startsWith("ln")) return loanCallback(context, TelegramStore.REPS, token, chatId, messageId, repId, snapshot, data);
        String menu = menuCallback(context, token, chatId, messageId, repId, snapshot, data);
        if (menu != null) return menu.isEmpty() ? null : menu;
        TelegramReplies.DayQuery day = TelegramReplies.dayCallback(data);
        if (day != null) {
            TelegramReplies.Reply reply = TelegramReplies.dayReply(repId, day, snapshot);
            send(context, TelegramStore.REPS, token, chatId, reply.text, reply.markup);
            return day.label;
        }
        return activationCallback(context, TelegramStore.REPS, token, chatId, repId, snapshot, data);
    }

    /** ⚡: a device (a:) -> its plans (p:) -> the price question - in the devices or money bot. */
    private static String activationCallback(Context context, String bot, String token, String chatId, String repId, TelegramReplies.Snapshot snapshot, String data) throws JSONException {
        if (data.startsWith("ap:")) {
            String[] pending = TelegramStore.pendingActivation(context, chatId);
            TelegramReplies.Price price = activationPrice(pending);
            if (price == null) return "انتهت المهلة - اضغط ⚡ تفعيل من جديد";
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, pending[0], snapshot);
            if (entry == null) return "هذا الجهاز ليس من أجهزتك";
            String paid = data.substring(3);
            if ("no".equals(paid)) paid = "";
            else if (TelegramReplies.payMethodName(price.currency, paid) == null) return "اختيار غير صالح";
            TelegramStore.clearPendingActivation(context, chatId);
            submitActivation(context, bot, token, chatId, repId, entry, pending[1], price, snapshot, paid);
            return "✅ أُرسل";
        }
        if (data.startsWith("a:")) {
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, data.substring(2), snapshot);
            if (entry == null) return "هذا الجهاز ليس من أجهزتك";
            TelegramReplies.Reply reply = TelegramReplies.pickPlan(entry, snapshot);
            send(context, bot, token, chatId, reply.text, reply.markup);
            return null;
        }
        if (data.startsWith("p:")) {
            int split = data.lastIndexOf(':');
            if (split <= 2) return "اختيار غير صالح";
            String accountId = data.substring(2, split);
            String plan = data.substring(split + 1);
            TelegramReplies.SearchEntry entry = TelegramReplies.findEntry(repId, accountId, snapshot);
            if (entry == null || !snapshot.plans.contains(plan)) return "اختيار غير صالح";
            TelegramStore.setPendingActivation(context, chatId, accountId, plan);
            send(context, bot, token, chatId, TelegramReplies.priceQuestion(plan, entry), TelegramReplies.FORCE_REPLY);
            return plan;
        }
        return null;
    }

    private static String ownerCallback(Context context, String token, String chatId, long messageId, String messageText, String data) throws JSONException {
        if (data.startsWith("ey:") || data.startsWith("en:")) return editDecision(context, token, chatId, messageId, messageText, data);
        boolean approve = data.startsWith("y:");
        if (!approve && !data.startsWith("n:")) return null;
        String id = data.substring(2);
        String raw = TelegramStore.activation(context, id);
        if (raw == null) return "هذا الطلب انتهى";
        JSONObject record = new JSONObject(raw);
        TelegramStore.removeActivation(context, id);
        // The app records it (✅: a renewal on the device) or drops it, whenever it opens.
        JSONObject decision = new JSONObject(raw);
        decision.put("id", id);
        decision.put("approve", approve);
        addToInbox(context, TelegramStore.OWNER, chatId, "", "", "", true, null, null, "repActivationDecision", decision.toString());
        String what = record.optString("plan") + " لـ " + record.optString("device") + " بسعر " + record.optString("price");
        String toRep = "❌ لم يوافق المسؤول على تفعيل " + what;
        String repId = record.optString("repId", "");
        if (approve && !repId.isEmpty() && record.has("amount")) {
            // 💰 The approved amount with this month's total, in the money bot.
            String month = new java.text.SimpleDateFormat("yyyy-MM", java.util.Locale.ROOT).format(new java.util.Date());
            String[] tally = TelegramStore.addApprovedActivation(context, repId, month, record.optString("currency", "MRU"), record.optDouble("amount", 0));
            toRep = TelegramReplies.approvedActivation(what, TelegramText.tallyLabel(tally[0]), tally[1]);
        } else if (approve) {
            toRep = "✅ وافق المسؤول على تفعيل " + what;
        }
        String moneyBot = TelegramStore.repBotFor(context, TelegramStore.MONEY);
        String repsToken = TelegramStore.tokenFor(context, moneyBot);
        String repChat = record.optString("repChat");
        if (repsToken != null && TelegramStore.isLinkedRepChat(context, repChat)) send(context, moneyBot, repsToken, repChat, toRep, null);
        try {
            TelegramClient.editMessageText(token, chatId, messageId, messageText + "\n\n" + (approve ? "✅ وافقت - أُبلغ المندوب" : "❌ رفضت - أُبلغ المندوب"));
        } catch (IOException | TelegramClient.TelegramError ignored) {
            // The buttons stay; tapping again says the request is over.
        }
        return approve ? "✅ تمت الموافقة" : "❌ تم الرفض";
    }

    /** ✅/❌ on a rep's ✏️: he's told, and the app applies (or drops) it when it opens. */
    private static String editDecision(Context context, String token, String chatId, long messageId, String messageText, String data) throws JSONException {
        boolean approve = data.startsWith("ey:");
        String id = data.substring(3);
        String raw = TelegramStore.edit(context, id);
        if (raw == null) return "هذا الطلب انتهى";
        JSONObject record = new JSONObject(raw);
        TelegramStore.removeEdit(context, id);
        // The whole edit rides along, so the app can apply it even if its "repEdit" got lost.
        JSONObject decision = new JSONObject(raw);
        decision.put("approve", approve);
        addToInbox(context, TelegramStore.REPS, record.optString("repChat"), "", "", "", true, null, null, "repEditDecision", decision.toString());
        String what = TelegramReplies.editFieldName(record.optString("field")) + " لـ " + record.optString("device") + " إلى «" + record.optString("value") + "»";
        String toRep = approve ? "✅ وافق المسؤول على تعديل " + what : "❌ لم يوافق المسؤول على تعديل " + what;
        String repsToken = TelegramStore.repsToken(context);
        String repChat = record.optString("repChat");
        if (repsToken != null && TelegramStore.isLinkedRepChat(context, repChat)) send(context, TelegramStore.REPS, repsToken, repChat, toRep, null);
        try {
            TelegramClient.editMessageText(token, chatId, messageId, messageText + "\n\n" + (approve ? "✅ وافقت - يُحفظ عند فتح التطبيق وأُبلغ المندوب" : "❌ رفضت - أُبلغ المندوب"));
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
        if (reply.ownerNotice != null) tellOwner(context, reply.ownerNotice, null);
    }

    /** Right away; if the network drops, queued through TelegramSendWorker (linked chats only). */
    private static void send(Context context, String bot, String token, String chatId, String text, String markup) {
        try {
            TelegramClient.sendMessage(token, chatId, text, markup);
            TelegramStore.diag(context, "replyAt", now());
        } catch (IOException offline) {
            TelegramStore.diag(context, "sendError", now() + " " + offline.getClass().getSimpleName());
            if (TelegramStore.isRepBot(bot)) TelegramSendWorker.enqueueToRepBot(context, bot, chatId, text, markup);
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
            s.clientMoved = json.optString("clientMoved", "");
            s.requestReceived = json.optString("requestReceived", "");
            s.promiseHint = json.optString("promiseHint", "");
            s.promiseReceived = json.optString("promiseReceived", "");
            s.promiseNotice = json.optString("promiseNotice", "");
            s.requestNotice = json.optString("requestNotice", "");
            s.activationHint = json.optString("activationHint", "");
            s.devicesBot = json.optString("devicesBot", "");
            s.moneyBot = json.optString("moneyBot", "");
            s.alertsBot = json.optString("alertsBot", "");
            s.moneyKeyboard = json.optString("moneyKeyboard", "");
            s.moneyHelp = json.optString("moneyHelp", "");
            s.moneyRedirect = json.optString("moneyRedirect", "");
            s.handoverHint = json.optString("handoverHint", "");
            s.handoverReceived = json.optString("handoverReceived", "");
            s.alertsInfo = json.optString("alertsInfo", "");
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
                        TelegramReplies.SearchEntry entry = new TelegramReplies.SearchEntry(
                            e.optString("k", ""), e.optString("t", ""), e.optString("l", null), e.optString("w", null),
                            e.optString("d", ""), e.optString("s", ""), e.optString("r", null), e.optString("i", ""),
                            e.optString("h", ""), strings(e.optJSONObject("x")), strings(e.optJSONObject("ev")));
                        entry.hasD = "1".equals(e.optString("dm", ""));
                        entry.stoppedUrl = e.optString("sw", null);
                        entry.debtUrl = e.optString("dw", null);
                        entry.clientId = e.optString("c", "");
                        entry.clientName = e.optString("cn", "");
                        entry.balance = e.optString("b", "");
                        entry.clientBalance = e.optString("cb", "");
                        entry.own = "1".equals(e.optString("o", ""));
                        entries.add(entry);
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

    /** A rep's event for the operator: the operator's Telegram (when connected) and the phone's notification
     * bar - tapping it opens the representatives page, even with the app closed. */
    private static void tellOwner(Context context, String text, String markup) {
        if (text == null || text.trim().isEmpty()) return;
        if (TelegramStore.isConfigured(context)) {
            send(context, TelegramStore.OWNER, TelegramStore.token(context), TelegramStore.chatId(context), text, markup);
        }
        AppEventNotifier.post(context, text, AppEventText.REPS_ROUTE);
    }

    // ---- inbox (drained by the app) ----

    private static void addToInbox(Context context, String bot, String chatId, String name, String username, String text, boolean replied) throws JSONException {
        addToInbox(context, bot, chatId, name, username, text, replied, null, null);
    }

    private static void addToInbox(Context context, String bot, String chatId, String name, String username, String text, boolean replied, String fileId, String fileName) throws JSONException {
        addToInbox(context, bot, chatId, name, username, text, replied, fileId, fileName, null, null);
    }

    /** `kind` / `data`: a record for the app from the device menu (repEdit, repEditDecision,
     * repNote - JSON data), never answered by the app. */
    private static void addToInbox(Context context, String bot, String chatId, String name, String username, String text, boolean replied,
                                   String fileId, String fileName, String kind, String data) throws JSONException {
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
            if (kind != null) {
                item.put("kind", kind);
                item.put("data", data != null ? data : "");
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
