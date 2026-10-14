package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 💳 Watches the KAST card mail in the linked Gmail («بريد الرموز», read-only) - from the
 * background every hour (KastWatchWorker) and when the app opens:
 *  - a refused payment → one Telegram message to the owner's bot, with the likely devices
 *    (KastMatch, from the snapshot the app pushes: name, expected USD, card);
 *  - dollars received → kept here until the app shows them in «ستارلينك والبطاقة» for the
 *    operator to record as a card top-up (or dismiss) - never recorded by itself.
 * Every message is handled once (its Gmail id is remembered). The first check only remembers
 * what is already there - old mail never alerts. Nothing here is logged.
 */
final class KastWatch {

    private KastWatch() {}

    private static final String PREFS = "starnet_kast_watch";
    private static final String KEY_DEVICES = "devices";
    private static final String KEY_SEEN = "seen";
    private static final String KEY_STARTED = "started";
    private static final String KEY_DEPOSITS = "deposits";
    private static final String KEY_RECENT = "recent";
    /** The same event from the mail and from the notification (or a repeated notification) counts once. */
    private static final long SAME_EVENT_MS = 3 * 60 * 60 * 1000L;
    private static final int MAX_SEEN = 300;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void setDevices(Context context, String json) {
        prefs(context).edit().putString(KEY_DEVICES, json == null ? "[]" : json).apply();
    }

    /** Waiting for the app: [{"id","kind":"received"|"spent","amountUsd","sender","merchant","cardLast4","at"}]. */
    static synchronized JSONArray pendingDeposits(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_DEPOSITS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** The app saved these - drop them here. */
    static synchronized void ackDeposits(Context context, Set<String> ids) {
        JSONArray kept = new JSONArray();
        JSONArray all = pendingDeposits(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject d = all.optJSONObject(i);
            if (d != null && !ids.contains(d.optString("id"))) kept.put(d);
        }
        prefs(context).edit().putString(KEY_DEPOSITS, kept.toString()).commit();
    }

    private static synchronized void addDeposit(Context context, KastMail.Message m) throws JSONException {
        JSONArray all = pendingDeposits(context);
        JSONObject d = new JSONObject();
        d.put("id", m.id);
        d.put("kind", m.kind == KastMail.Kind.SPENT ? "spent" : "received");
        d.put("amountUsd", m.amount);
        d.put("sender", m.sender);
        d.put("merchant", m.merchant);
        d.put("cardLast4", m.cardLast4);
        d.put("at", m.at);
        all.put(d);
        prefs(context).edit().putString(KEY_DEPOSITS, all.toString()).commit();
    }

    /** Seen the same kind/amount/card in the last hours (from the other source, or repeated)? Records it. */
    private static synchronized boolean repeated(Context context, KastMail.Message m) {
        String key = m.kind + "|" + String.format(java.util.Locale.ROOT, "%.2f", m.amount) + "|" + m.cardLast4;
        long now = System.currentTimeMillis();
        JSONObject recent;
        try {
            recent = new JSONObject(prefs(context).getString(KEY_RECENT, "{}"));
        } catch (JSONException e) {
            recent = new JSONObject();
        }
        JSONObject kept = new JSONObject();
        java.util.Iterator<String> keys = recent.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            long at = recent.optLong(k, 0);
            if (now - at < SAME_EVENT_MS) {
                try {
                    kept.put(k, at);
                } catch (JSONException ignored) {
                    // a key that can't be kept is just forgotten
                }
            }
        }
        boolean seen = kept.has(key);
        try {
            kept.put(key, now);
        } catch (JSONException ignored) {
            // not remembered - at worst one more alert
        }
        prefs(context).edit().putString(KEY_RECENT, kept.toString()).commit();
        return seen;
    }

    /** One KAST event (from the mail or the app's notification): a refusal → Telegram; a payment
     * or dollars received → waits for the app. Blocking (network) - never on the main thread. */
    static void handle(Context context, KastMail.Message m) throws IOException, JSONException, TelegramClient.TelegramError {
        if (m == null || repeated(context, m)) return;
        if (m.kind == KastMail.Kind.DECLINED) {
            if (!TelegramStore.isConfigured(context)) return;
            List<KastMatch.Device> devices = KastMatch.parseDevices(prefs(context).getString(KEY_DEVICES, "[]"));
            TelegramClient.sendMessage(TelegramStore.token(context), TelegramStore.chatId(context), KastMatch.alert(m, devices));
        } else if (m.kind == KastMail.Kind.RECEIVED || m.kind == KastMail.Kind.SPENT && m.isStarlink()) {
            addDeposit(context, m);
        }
    }

    /** One check. Blocking (network) - never on the main thread. */
    static synchronized void runOnce(Context context) {
        String linked = GmailCodeFetcher.linkedEmail(context);
        if (linked == null) return;
        String token = DriveAuthorizer.tokenInBackground(context, GmailCodes.SCOPE, linked);
        if (token == null) return;
        SharedPreferences prefs = prefs(context);
        Set<String> seen = new LinkedHashSet<>(Arrays.asList(prefs.getString(KEY_SEEN, "").split(",")));
        seen.remove("");
        boolean started = prefs.getBoolean(KEY_STARTED, false);
        try {
            List<String> ids = GmailCodes.parseIds(GmailCodeFetcher.get(KastMail.listUrl(), token));
            List<String> fresh = new ArrayList<>();
            for (String id : ids) if (!seen.contains(id)) fresh.add(id);
            // Oldest first, so two alerts arrive in the order they happened.
            java.util.Collections.reverse(fresh);
            for (String id : fresh) {
                if (started) handle(context, KastMail.parse(GmailCodeFetcher.get(GmailCodes.messageUrl(id), token)));
                seen.add(id); // only once handled: a failed send is tried again next time
            }
        } catch (IOException | JSONException | TelegramClient.TelegramError e) {
            // the next check tries again (whatever was handled is remembered below)
        } finally {
            List<String> keep = new ArrayList<>(seen);
            if (keep.size() > MAX_SEEN) keep = keep.subList(keep.size() - MAX_SEEN, keep.size());
            prefs.edit().putString(KEY_SEEN, String.join(",", keep)).putBoolean(KEY_STARTED, true).commit();
        }
    }
}
