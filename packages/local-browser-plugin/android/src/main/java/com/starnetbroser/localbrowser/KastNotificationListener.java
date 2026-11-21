package com.starnetbroser.localbrowser;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 💳 The KAST app's own notifications - the only place a successful card payment shows (KAST mails
 * nothing for it; real, confirmed) - and 🏦 the operator's bank / wallet apps' (BankNotice:
 * بنكيلي، سداد، نيتا، بينانس…). Every other app's notification is ignored at once and never read
 * further. The operator turns this on in Android's «Notification access» (from «ستارلينك
 * والبطاقة» or «حسابي»). A KAST event goes to KastWatch.handle: a refusal → Telegram, a Starlink
 * payment or dollars received → waits for the app to suggest it. A bank one is stored
 * (BankNoticeStore) for «حسابي» to suggest. 💳 While a device's browser adds a card, the card
 * company's code from his mail notification goes to it (PaymentCodeInbox). Nothing is logged.
 */
public class KastNotificationListener extends NotificationListenerService {

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    /** The connected listener (null while Android has it disconnected) - for rescan(). */
    private static volatile KastNotificationListener connected;

    /** KAST's own app (its package name carries "kast"). */
    static boolean isKast(String packageName) {
        return packageName != null && packageName.toLowerCase(Locale.ROOT).contains("kast");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        connected = this;
        markSeen(System.currentTimeMillis());
        // 💬 WhatsApp Business (WhatsAppMessage): read for his customers' emails and questions only
        if (WhatsAppMessage.isWhatsApp(sbn.getPackageName())) {
            handleWhatsApp(sbn);
            return;
        }
        if (isKast(sbn.getPackageName())) {
            handleKast(sbn);
        } else {
            offerPaymentCode(sbn);
            keepBankNotice(sbn);
        }
    }

    /** Bank notifications posted while access was off are still on the screen: kept once (the same
     * posted notification is never stored twice). */
    @Override
    public void onListenerConnected() {
        connected = this;
        rebindAskedAt = 0;
        keepActiveBankNotices(this);
        // 🏦 The permanent «يقرأ إشعارات البنوك» notification that keeps it running.
        BankWatchService.refresh(this);
    }

    /** Some phones (HONOR, Huawei…) drop the reader to save battery - ask Android to reconnect it. */
    @Override
    public void onListenerDisconnected() {
        if (connected == this) connected = null;
        ensureConnected(this);
    }

    private static void keepActiveBankNotices(KastNotificationListener listener) {
        try {
            StatusBarNotification[] active = listener.getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification sbn : active) if (sbn != null && !isKast(sbn.getPackageName())) listener.keepBankNotice(sbn, true);
        } catch (RuntimeException ignored) {
            // not allowed right now - the next ones still arrive one by one
        }
    }

    /** 🏦 Re-reads the bank notifications still on the screen (one missed while the reader was
     * down is kept now; the same posted notification is never stored twice). Synchronous, so the
     * app reading the store right after sees them. */
    static void rescan(Context context) {
        KastNotificationListener listener = connected;
        if (listener != null) keepActiveBankNotices(listener);
        else ensureConnected(context);
    }

    /** When the reader last asked Android to reconnect (ms) - a second ask that finds it still down
     * restarts it (forceRebind). */
    private static volatile long rebindAskedAt;

    /** Asks Android to reconnect the reader when access is on but it isn't connected; if an earlier
     * ask (20 s+ ago) didn't bring it back, restarts it. */
    static void ensureConnected(Context context) {
        if (context == null || connected != null || Build.VERSION.SDK_INT < 24 || !isEnabled(context)) return;
        long now = System.currentTimeMillis();
        if (rebindAskedAt > 0 && now - rebindAskedAt > 20_000L) {
            forceRebind(context);
            return;
        }
        rebindAskedAt = now;
        try {
            requestRebind(new ComponentName(context.getApplicationContext(), KastNotificationListener.class));
        } catch (RuntimeException ignored) {
            // not allowed right now - the next check tries again
        }
    }

    /**
     * 🔄 After an app update some phones (HONOR, Huawei…) never bind the reader again although
     * «Notification access» still shows on - nothing was read from 15:21 on Oct 10 2026 (his
     * report). Turning our own reader component off and on makes Android bind it afresh (the same
     * as him switching access off and on), then it's asked to reconnect.
     */
    static void forceRebind(Context context) {
        if (context == null || !isEnabled(context)) return;
        Context app = context.getApplicationContext();
        ComponentName me = new ComponentName(app, KastNotificationListener.class);
        rebindAskedAt = System.currentTimeMillis();
        try {
            android.content.pm.PackageManager pm = app.getPackageManager();
            pm.setComponentEnabledSetting(me, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(me, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP);
        } catch (RuntimeException ignored) {
            // not allowed on this phone - the rebind below still tries
        }
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                requestRebind(me);
            } catch (RuntimeException ignored) {
                // the next check tries again
            }
        }
    }

    /** Whether the reader is bound right now (access on is not enough - see forceRebind). */
    static boolean isConnected() {
        return connected != null;
    }

    private static final String SEEN_PREFS = "starnet_bank_reader";

    /** When the reader last received any notification (ms, 0 = never) - shown in «حسابي». */
    static long lastSeenAt(Context context) {
        return context.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE).getLong("lastSeenAt", 0L);
    }

    private void markSeen(long at) {
        getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE).edit().putLong("lastSeenAt", at).apply();
    }

    /** {title, text} - the expanded text when the app gives one (a cut line ends with «…»). */
    private static String[] titleAndText(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return null;
        Bundle extras = n.extras;
        if (extras == null) return null;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        StringBuilder body = new StringBuilder(text == null ? "" : text.toString());
        // 🏦 InboxStyle: several lines (Bankily's «Montant : … MRU» / «Beneficiaire : …») that
        // aren't in EXTRA_TEXT; without them a bank notice carries no amount and would be dropped.
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) if (line != null && line.length() > 0) body.append('\n').append(line);
        }
        // MessagingStyle: the words are only in EXTRA_MESSAGES (each a Bundle with its "text").
        if (body.length() == 0) {
            android.os.Parcelable[] messages = extras.getParcelableArray("android.messages");
            if (messages != null) {
                for (android.os.Parcelable m : messages) {
                    if (!(m instanceof Bundle)) continue;
                    CharSequence line = ((Bundle) m).getCharSequence("text");
                    if (line != null && line.length() > 0) body.append(body.length() > 0 ? "\n" : "").append(line);
                }
            }
        }
        if (title == null) title = extras.getCharSequence(Notification.EXTRA_TITLE_BIG);
        CharSequence sub = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        if (sub != null && sub.length() > 0) body.append('\n').append(sub);
        return new String[] {title == null ? "" : title.toString(), body.toString()};
    }

    /** 💳 Only while a device's browser is adding a card and waits for the card company's code
     * (no-reply's mail «STARLINK INTERNET … code: ######») - otherwise nothing here is read. */
    private void offerPaymentCode(StatusBarNotification sbn) {
        if (!PaymentCodeInbox.isWaiting()) return;
        String[] tt = titleAndText(sbn);
        // Gmail re-posts an old mail's notification (a new one in the same group) with a fresh post
        // time: the mail's own time (`when`) says how old the code really is.
        long when = sbn.getNotification() != null ? sbn.getNotification().when : 0;
        long at = when > 0 ? Math.min(when, sbn.getPostTime()) : sbn.getPostTime();
        if (tt != null) PaymentCodeInbox.offer(tt[0], tt[1], at);
    }

    private void keepBankNotice(StatusBarNotification sbn) {
        keepBankNotice(sbn, false);
    }

    /** `now`: store on this thread (a rescan the app waits for) instead of the background one. */
    private void keepBankNotice(StatusBarNotification sbn, boolean now) {
        final String[] tt = titleAndText(sbn);
        if (tt == null) return;
        final String app = BankNotice.keep(sbn.getPackageName(), tt[0], tt[1]);
        if (app == null) return;
        final Context context = getApplicationContext();
        final String pkg = sbn.getPackageName();
        final long at = sbn.getPostTime();
        if (now) BankNoticeStore.add(context, app, pkg, tt[0], tt[1], at);
        else WORK.execute(() -> BankNoticeStore.add(context, app, pkg, tt[0], tt[1], at));
    }

    /** Messages already handled (WhatsApp re-posts a chat's notification with every new message). */
    private static final java.util.Set<String> WHATSAPP_SEEN = java.util.Collections.newSetFromMap(new java.util.LinkedHashMap<String, Boolean>() {
        @Override
        protected boolean removeEldestEntry(java.util.Map.Entry<String, Boolean> eldest) {
            return size() > 300;
        }
    });

    /**
     * 💬 A customer's WhatsApp message (his Nov 12 2026 ask): an email in it → kept for the app (a new device); a
     * question about his device from a registered number → his ready answer sent from the notification's «رد»,
     * at most once every 30 minutes. A group, his own message or a summary is never read.
     */
    private void handleWhatsApp(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = n.extras;
        if (extras == null) return;
        final Context context = getApplicationContext();
        String conversation = Build.VERSION.SDK_INT >= 26 ? n.getShortcutId() : null;
        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        String title = titleCs == null ? "" : titleCs.toString();
        long at = n.when > 0 ? n.when : sbn.getPostTime();
        if (WhatsAppMessage.isGroup(conversation, extras.getBoolean("android.isGroupConversation", false))) {
            noteSeen(context, title, conversation, new WhatsAppMessage.Found(null, null), at, "مجموعة - لا يُقرأ ولا يُرد");
            return;
        }
        String text = null;
        Bundle lastMessage = lastMessageOf(extras);
        if (lastMessage != null) {
            // his own message (no sender) - never answered
            if (lastMessage.getCharSequence("sender") == null && lastMessage.getParcelable("sender_person") == null) {
                noteSeen(context, title, conversation, new WhatsAppMessage.Found(null, null), at, "رسالتك أنت - لا يُرد عليها");
                return;
            }
            CharSequence line = lastMessage.getCharSequence("text");
            text = line == null ? null : line.toString();
            long time = lastMessage.getLong("time", 0L);
            if (time > 0) at = time;
        } else {
            CharSequence line = extras.getCharSequence(Notification.EXTRA_TEXT);
            text = line == null ? null : line.toString();
        }
        if (text == null || text.trim().isEmpty()) return;
        final WhatsAppMessage.Found found = senderOf(n);
        final String phone = found.phone;
        final String id = WhatsAppMessage.id(sbn.getPackageName(), phone, title, text, at);
        synchronized (WHATSAPP_SEEN) {
            if (!WHATSAPP_SEEN.add(id)) return;
        }
        // 🔁 never twice, even after a restart re-posts the notifications (his Nov 21 2026 brief)
        if (!WhatsAppStore.firstTime(getApplicationContext(), id)) return;
        final String name = title;
        final String body = text;
        final long when = at;
        if (!WhatsAppMessage.emails(text).isEmpty()) WORK.execute(() -> WhatsAppStore.addMessage(context, id, phone, name, body, when));
        String key = WhatsAppMessage.key(phone);
        // 💬 this customer's latest «رد»: his answer from «🎓 تدريب الوكيل» goes out through it later, even after the
        // agent's own «لحظة…» made WhatsApp replace or clear the notification (his Nov 21 2026 «لم يُرسل»)
        if (key != null && hasReply(n)) LAST_REPLY.put(key, n);
        noteSeen(context, title, conversation, found, at, WhatsAppStore.agentReason(context, key, phone == null && WhatsAppMessage.numberText(title) == null && !title.trim().isEmpty()));
        // 🤖 «وكيل واتساب»: the app writes the answer (Claude), this notification's «رد» sends it - never the fixed one too
        if (key != null && WhatsAppStore.agentAnswers(context, key)) {
            keepForAgent(id, n);
            final String agentKey = key;
            AGENT_WORK.execute(() -> routeAgent(context, id, phone, agentKey, name, body, when));
            return;
        }
        if (key == null || !WhatsAppStore.enabled(context) || !WhatsAppMessage.asksAboutDevice(text)) return;
        String answer = WhatsAppStore.answerFor(context, key);
        long now = System.currentTimeMillis();
        if (answer == null || !WhatsAppMessage.mayAnswer(WhatsAppStore.lastAnsweredAt(context, key), now)) return;
        if (replyFrom(n, answer)) WhatsAppStore.noteAnswered(context, key, name, body, now);
    }

    /** The agent's own calls to Claude (one at a time, off the main thread). */
    private static final ExecutorService AGENT_WORK = Executors.newSingleThreadExecutor();

    /**
     * 🤖 The agent's answer while the app is closed (his Nov 21 2026 ask): the same words the app would write, from the
     * app's pack, sent through the message's «رد»; a hand-off notifies him. Everything goes to the log the app takes in.
     */
    private static void answerNatively(Context context, String id, String phone, String key, String name, String text, long at, String topic, String suffix) {
        long now = System.currentTimeMillis();
        org.json.JSONObject entry = new org.json.JSONObject();
        try {
            entry.put("id", id).put("key", key).put("name", name == null ? "" : name).put("text", text).put("at", at);
            if (phone != null) entry.put("phone", phone);
            org.json.JSONObject pack = WhatsAppStore.agentPack(context);
            if (pack == null) return;
            entry.put("model", pack.optString("model", ""));
            if (now - at > WhatsAppAgentRules.FRESH_MS) {
                entry.put("error", "قُرئت متأخرة - تُركت لك");
                WhatsAppStore.agentNativeLog(context, entry);
                return;
            }
            org.json.JSONObject waiting = pack.optJSONObject("open");
            int open = waiting == null ? 0 : waiting.optInt(key, 0);
            if (WhatsAppAgentNative.silenced(open, WhatsAppStore.agentNativeHandoffs(context, key), now)) {
                WhatsAppStore.agentSeenPath(context, "📴 🤐 سكت: سؤالان بلا جوابك");
                entry.put("handoff", true).put("silent", true).put("reason", "سكت الوكيل: سؤالان قبله بلا جوابك");
                WhatsAppStore.agentNativeLog(context, entry);
                return;
            }
            org.json.JSONArray chat = WhatsAppAgentNative.chat(pack, key, WhatsAppStore.agentNativeChat(context, key));
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new java.util.Date(now));
            String user = WhatsAppAgentNative.userText(pack, key, name, text, chat, today, topic);
            WhatsAppAgentNative.Answer answer = callClaude(pack.optString("apiKey"), WhatsAppAgentNative.requestBody(pack, user).toString());
            entry.put("input", answer.input).put("output", answer.output);
            if (answer.error != null) {
                WhatsAppStore.agentSeenPath(context, "📴 ✗ القارئ لم يرد: " + answer.error);
                entry.put("handoff", true).put("error", answer.error);
                WhatsAppStore.agentNativeLog(context, entry);
                AppEventNotifier.post(context, WhatsAppAgentNative.handoffNotice(name, phone, text, "لم يرد الوكيل: " + answer.error), "/agent");
                return;
            }
            String out = suffix == null || suffix.isEmpty() ? answer.reply : answer.reply + "\n\n" + suffix;
            boolean sent = agentReply(context, id, key, out);
            entry.put("ms", System.currentTimeMillis() - at);
            WhatsAppStore.agentSeenPath(context, sent ? "📴 ✓ ردّ القارئ وحده والتطبيق مغلق" : "📴 ✗ كتب القارئ الرد لكن لم يجد «رد» الإشعار");
            entry.put("reply", answer.reply).put("handoff", answer.handoff).put("reason", answer.reason).put("sent", sent);
            org.json.JSONArray turns = new org.json.JSONArray().put(new org.json.JSONObject().put("from", "customer").put("text", text).put("at", at));
            if (sent) turns.put(new org.json.JSONObject().put("from", "agent").put("text", answer.reply).put("at", System.currentTimeMillis()));
            WhatsAppStore.agentNativeTurns(context, key, turns);
            if (answer.handoff) WhatsAppStore.agentNativeHandoff(context, key, now);
            WhatsAppStore.agentNativeLog(context, entry);
            if (answer.handoff || !sent) {
                AppEventNotifier.post(context, WhatsAppAgentNative.handoffNotice(name, phone, text, sent ? answer.reason : "لم يُرسل الرد (الإشعار اختفى) - رد عليه بنفسك"), "/agent");
            }
        } catch (org.json.JSONException | RuntimeException e) {
            try {
                entry.put("error", "تعذّر الرد والتطبيق مغلق: " + e.getClass().getSimpleName());
                WhatsAppStore.agentSeenPath(context, "📴 ✗ تعذّر: " + e.getClass().getSimpleName());
                WhatsAppStore.agentNativeLog(context, entry);
            } catch (org.json.JSONException ignored) {
                // nothing more to keep
            }
        }
    }

    /**
     * 🗂️ One message to the agent: a person has this customer → silent; the published menus answer a number / «0» /
     * «رجوع» / «موظف» / a greeting at once (no Claude, the app open or closed); anything else → Claude, in the app
     * when it is on the screen, else here - with the menu section it came from.
     */
    private static void routeAgent(Context context, String id, String phone, String key, String name, String text, long at) {
        long now = System.currentTimeMillis();
        org.json.JSONObject pack = WhatsAppStore.agentPack(context);
        String topic = "";
        String suffix = "";
        if (pack != null) {
            try {
                if (WhatsAppStore.agentPaused(context, pack, key, now)) {
                    WhatsAppStore.agentSeenPath(context, "👨‍💼 مع موظف - الوكيل صامت مع هذا الزبون");
                    WhatsAppStore.agentNativeLog(context, new org.json.JSONObject().put("id", id).put("key", key).put("name", name == null ? "" : name).put("text", text).put("at", at).put("type", "staff"));
                    return;
                }
                org.json.JSONObject menus = pack.optJSONObject("menus");
                org.json.JSONObject settings = pack.optJSONObject("menuSettings");
                if (menus != null && settings != null) {
                    org.json.JSONObject st = WhatsAppStore.menuState(context, key);
                    java.util.Calendar cal = java.util.Calendar.getInstance();
                    int minutes = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);
                    WhatsAppMenu.Step step = WhatsAppMenu.step(menus, settings, st.isNull("at") ? null : st.optString("at", null), st.optLong("w", 0L), text, now, minutes, pack.optString("payment", ""));
                    WhatsAppStore.saveMenuState(context, key, step.at, step.lastWelcomeAt);
                    if ("reply".equals(step.kind) || "handoff".equals(step.kind)) {
                        boolean sent = agentReply(context, id, key, step.text);
                        org.json.JSONObject entry = new org.json.JSONObject().put("id", id).put("key", key).put("name", name == null ? "" : name).put("text", text).put("at", at)
                            .put("type", step.kind.equals("reply") ? "menu" : "handoff").put("node", step.node).put("reply", step.text).put("sent", sent).put("ms", System.currentTimeMillis() - at);
                        if (phone != null) entry.put("phone", phone);
                        WhatsAppStore.agentNativeLog(context, entry);
                        if ("handoff".equals(step.kind)) {
                            WhatsAppStore.menuHandoff(context, key, now);
                            AppEventNotifier.post(context, "👨‍💼 زبون طلب موظف على واتساب\n" + (name == null ? "" : name) + (phone == null ? "" : " (" + phone + ")") + ": «" + (text.length() > 160 ? text.substring(0, 160) : text) + "»", "/agent");
                        }
                        WhatsAppStore.agentSeenPath(context, sent ? ("reply".equals(step.kind) ? "🗂️ ✓ ردّت القائمة" : "👨‍💼 ✓ حُوّل إلى موظف") : "🗂️ ✗ لم يجد «رد» الإشعار");
                        return;
                    }
                    topic = step.topic;
                    suffix = step.suffix;
                }
            } catch (org.json.JSONException | RuntimeException e) {
                // the menus failed: Claude answers as before
            }
        }
        boolean alive = WhatsAppAgentNative.appAlive(WhatsAppStore.agentHeartbeatAt(context), now);
        if (alive || pack == null) {
            WhatsAppStore.agentAdd(context, id, phone, key, name, text, at, topic, suffix);
            WhatsAppStore.agentSeenPath(context, alive ? "👉 التطبيق مفتوح - يرد هو" : "⚠️ التطبيق مغلق ولا نسخة عند القارئ - افتح قسم الوكيل دقيقة ثم أغلقه");
        } else {
            WhatsAppStore.agentSeenPath(context, "📴 التطبيق مغلق - القارئ يرد وحده…");
            answerNatively(context, id, phone, key, name, text, at, topic, suffix);
        }
    }

    /** POST /v1/messages with his key - never logged. */
    private static WhatsAppAgentNative.Answer callClaude(String apiKey, String body) {
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL("https://api.anthropic.com/v1/messages").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(20_000);
            c.setReadTimeout(90_000);
            c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            c.setRequestProperty("x-api-key", apiKey);
            c.setRequestProperty("anthropic-version", "2023-06-01");
            try (java.io.OutputStream out = c.getOutputStream()) {
                out.write(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            java.io.InputStream in = status >= 200 && status < 300 ? c.getInputStream() : c.getErrorStream();
            StringBuilder sb = new StringBuilder();
            if (in != null) {
                try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line).append('\n');
                }
            }
            return WhatsAppAgentNative.parse(status, sb.toString());
        } catch (java.io.IOException e) {
            WhatsAppAgentNative.Answer a = new WhatsAppAgentNative.Answer();
            a.error = "لا اتصال بالإنترنت";
            return a;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** The MessagingStyle's last message (a Bundle with "text", "time", "sender", "sender_person"), or null. */
    private static Bundle lastMessageOf(Bundle extras) {
        android.os.Parcelable[] messages = extras.getParcelableArray("android.messages");
        if (messages != null && messages.length > 0 && messages[messages.length - 1] instanceof Bundle) return (Bundle) messages[messages.length - 1];
        return null;
    }

    /**
     * The sender's number of a WhatsApp notification (WhatsAppMessage.find): its chat id when that is a phone, its title,
     * the last message's sender, its sender_person (uri «tel:…» / key). The same for reading a message and for finding
     * its conversation again to send the agent's answer - a «…@lid» chat too (his Nov 21 2026 report).
     */
    static WhatsAppMessage.Found senderOf(Notification n) {
        Bundle extras = n.extras;
        if (extras == null) return new WhatsAppMessage.Found(null, null);
        String conversation = Build.VERSION.SDK_INT >= 26 ? n.getShortcutId() : null;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        String sender = null;
        String uri = null;
        String personKey = null;
        Bundle last = lastMessageOf(extras);
        if (last != null) {
            CharSequence s = last.getCharSequence("sender");
            if (s != null) sender = s.toString();
            android.os.Parcelable p = last.getParcelable("sender_person");
            if (Build.VERSION.SDK_INT >= 28 && p instanceof android.app.Person) {
                android.app.Person person = (android.app.Person) p;
                uri = person.getUri();
                personKey = person.getKey();
                if (sender == null && person.getName() != null) sender = person.getName().toString();
            }
        }
        return WhatsAppMessage.find(conversation, title == null ? null : title.toString(), sender, uri, personKey);
    }

    /** 🔍 The agent section's «آخر رسالة رآها القارئ»: when, the title, the number read and from where, why. */
    private static void noteSeen(Context context, String title, String conversation, WhatsAppMessage.Found found, long at, String reason) {
        try {
            org.json.JSONObject seen = new org.json.JSONObject();
            seen.put("at", at);
            seen.put("title", title == null ? "" : title);
            if (found.phone != null) seen.put("phone", found.phone);
            if (found.from != null) seen.put("from", found.from);
            seen.put("hiddenId", WhatsAppMessage.isHiddenId(conversation));
            String key = WhatsAppMessage.key(found.phone);
            seen.put("test", WhatsAppStore.agentIsTest(context, key));
            seen.put("reason", reason);
            // at once (not on WORK): the agent's thread adds «who answered» to this same line right after
            WhatsAppStore.agentNoteSeen(context, seen);
        } catch (org.json.JSONException ignored) {
            // only the diagnostic line
        }
    }

    // ---- 🤖 the agent's answers go out through the message's own notification ----

    /** message id → its WhatsApp notification (this process only; a restarted app looks for it on the screen). */
    private static final java.util.Map<String, Notification> AGENT_NOTIFICATIONS = java.util.Collections.synchronizedMap(
        new java.util.LinkedHashMap<String, Notification>(32, 0.75f, false) {
            @Override
            protected boolean removeEldestEntry(java.util.Map.Entry<String, Notification> eldest) {
                return size() > 60;
            }
        });

    /** Customer (last 8 digits) → his latest WhatsApp notification that has a «رد» (this process only). */
    private static final java.util.Map<String, Notification> LAST_REPLY = java.util.Collections.synchronizedMap(
        new java.util.LinkedHashMap<String, Notification>() {
            @Override
            protected boolean removeEldestEntry(java.util.Map.Entry<String, Notification> eldest) {
                return size() > 200;
            }
        });

    /** The notification carries a «رد» (an action with a RemoteInput). */
    private static boolean hasReply(Notification n) {
        if (n.actions == null) return false;
        for (Notification.Action a : n.actions) {
            if (a != null && a.actionIntent != null && a.getRemoteInputs() != null && a.getRemoteInputs().length > 0) return true;
        }
        return false;
    }

    private static void keepForAgent(String id, Notification n) {
        AGENT_NOTIFICATIONS.put(id, n);
    }

    /**
     * Sends the agent's answer to the message `id` (from number `key`): through that message's notification, else any
     * WhatsApp notification of the same number still on the screen. False when none can be found (WhatsApp cleared it).
     */
    static boolean agentReply(Context context, String id, String key, String text) {
        if (text == null || text.trim().isEmpty()) return false;
        long now = System.currentTimeMillis();
        if (key != null && !WhatsAppAgentRules.underHourlyLimit(WhatsAppStore.agentSentAt(context, key), now)) return false;
        Notification n = AGENT_NOTIFICATIONS.get(id);
        boolean sent = n != null && replyFrom(context, n, text);
        // the customer's latest «رد» - still valid after WhatsApp cleared the notification (its PendingIntent lives on)
        if (!sent && key != null) {
            Notification last = LAST_REPLY.get(key);
            sent = last != null && last != n && replyFrom(context, last, text);
        }
        if (!sent && key != null) {
            KastNotificationListener listener = connected;
            if (listener != null) {
                try {
                    StatusBarNotification[] active = listener.getActiveNotifications();
                    if (active != null) {
                        for (StatusBarNotification sbn : active) {
                            if (sbn == null || !WhatsAppMessage.isWhatsApp(sbn.getPackageName())) continue;
                            Notification other = sbn.getNotification();
                            if (other == null || other.extras == null) continue;
                            // the same reading as the message's (a «…@lid» chat is found by its title / sender)
                            if (!key.equals(WhatsAppMessage.key(senderOf(other).phone))) continue;
                            if (replyFrom(context, other, text)) {
                                sent = true;
                                break;
                            }
                        }
                    }
                } catch (RuntimeException ignored) {
                    // not allowed right now - reported as not sent
                }
            }
        }
        if (sent) {
            AGENT_NOTIFICATIONS.remove(id);
            if (key != null) WhatsAppStore.agentNoteSent(context, key, now);
        }
        return sent;
    }

    /** Sends `text` through the notification's own «رد» (its RemoteInput) - false when it has none. */
    private boolean replyFrom(Notification n, String text) {
        return replyFrom(this, n, text);
    }

    private static boolean replyFrom(Context context, Notification n, String text) {
        Notification.Action[] actions = n.actions;
        if (actions == null) return false;
        for (Notification.Action action : actions) {
            if (action == null || action.actionIntent == null) continue;
            android.app.RemoteInput[] inputs = action.getRemoteInputs();
            if (inputs == null || inputs.length == 0) continue;
            android.content.Intent intent = new android.content.Intent();
            Bundle results = new Bundle();
            for (android.app.RemoteInput input : inputs) results.putCharSequence(input.getResultKey(), text);
            android.app.RemoteInput.addResultsToIntent(inputs, intent, results);
            try {
                action.actionIntent.send(context, 0, intent);
                return true;
            } catch (android.app.PendingIntent.CanceledException e) {
                return false;
            }
        }
        return false;
    }

    private void handleKast(StatusBarNotification sbn) {
        String[] tt = titleAndText(sbn);
        if (tt == null) return;
        final KastMail.Message m = KastMail.fromNotification(tt[0], tt[1], sbn.getPostTime());
        if (m == null) return;
        final Context context = getApplicationContext();
        WORK.execute(() -> {
            try {
                KastWatch.handle(context, m);
            } catch (Exception ignored) {
                // no network for Telegram right now - the alert is lost, the app still shows the rest
            }
        });
    }

    /** Whether the operator gave STAR NET «Notification access». */
    static boolean isEnabled(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        String mine = new ComponentName(context, KastNotificationListener.class).flattenToString();
        for (String entry : enabled.split(":")) if (mine.equalsIgnoreCase(entry)) return true;
        return false;
    }
}
