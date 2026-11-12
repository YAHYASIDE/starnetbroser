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
        String conversation = Build.VERSION.SDK_INT >= 26 ? n.getShortcutId() : null;
        if (WhatsAppMessage.isGroup(conversation, extras.getBoolean("android.isGroupConversation", false))) return;
        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        String title = titleCs == null ? "" : titleCs.toString();
        String text = null;
        long at = n.when > 0 ? n.when : sbn.getPostTime();
        android.os.Parcelable[] messages = extras.getParcelableArray("android.messages");
        if (messages != null && messages.length > 0 && messages[messages.length - 1] instanceof Bundle) {
            Bundle lastMessage = (Bundle) messages[messages.length - 1];
            // his own message (no sender) - never answered
            if (lastMessage.getCharSequence("sender") == null && lastMessage.getParcelable("sender_person") == null) return;
            CharSequence line = lastMessage.getCharSequence("text");
            text = line == null ? null : line.toString();
            long time = lastMessage.getLong("time", 0L);
            if (time > 0) at = time;
        } else {
            CharSequence line = extras.getCharSequence(Notification.EXTRA_TEXT);
            text = line == null ? null : line.toString();
        }
        if (text == null || text.trim().isEmpty()) return;
        final String phone = WhatsAppMessage.phoneOf(conversation, title);
        final String id = WhatsAppMessage.id(sbn.getPackageName(), phone, title, text, at);
        synchronized (WHATSAPP_SEEN) {
            if (!WHATSAPP_SEEN.add(id)) return;
        }
        final Context context = getApplicationContext();
        final String name = title;
        final String body = text;
        final long when = at;
        if (!WhatsAppMessage.emails(text).isEmpty()) WORK.execute(() -> WhatsAppStore.addMessage(context, id, phone, name, body, when));
        String key = WhatsAppMessage.key(phone);
        if (key == null || !WhatsAppStore.enabled(context) || !WhatsAppMessage.asksAboutDevice(text)) return;
        String answer = WhatsAppStore.answerFor(context, key);
        long now = System.currentTimeMillis();
        if (answer == null || !WhatsAppMessage.mayAnswer(WhatsAppStore.lastAnsweredAt(context, key), now)) return;
        if (replyFrom(n, answer)) WhatsAppStore.noteAnswered(context, key, name, body, now);
    }

    /** Sends `text` through the notification's own «رد» (its RemoteInput) - false when it has none. */
    private boolean replyFrom(Notification n, String text) {
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
                action.actionIntent.send(this, 0, intent);
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
