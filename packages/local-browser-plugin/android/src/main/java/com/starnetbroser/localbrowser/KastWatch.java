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
    private static final int MAX_SEEN = 300;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void setDevices(Context context, String json) {
        prefs(context).edit().putString(KEY_DEVICES, json == null ? "[]" : json).apply();
    }

    /** The dollars received, waiting for the app: [{"id","amountUsd","sender","at"}]. */
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
        d.put("amountUsd", m.amount);
        d.put("sender", m.sender);
        d.put("at", m.at);
        all.put(d);
        prefs(context).edit().putString(KEY_DEPOSITS, all.toString()).commit();
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
        List<KastMatch.Device> devices = KastMatch.parseDevices(prefs.getString(KEY_DEVICES, "[]"));
        try {
            List<String> ids = GmailCodes.parseIds(GmailCodeFetcher.get(KastMail.listUrl(), token));
            List<String> fresh = new ArrayList<>();
            for (String id : ids) if (!seen.contains(id)) fresh.add(id);
            // Oldest first, so two alerts arrive in the order they happened.
            java.util.Collections.reverse(fresh);
            for (String id : fresh) {
                if (started) {
                    KastMail.Message m = KastMail.parse(GmailCodeFetcher.get(GmailCodes.messageUrl(id), token));
                    if (m != null && m.kind == KastMail.Kind.DECLINED && TelegramStore.isConfigured(context)) {
                        TelegramClient.sendMessage(TelegramStore.token(context), TelegramStore.chatId(context), KastMatch.alert(m, devices));
                    } else if (m != null && m.kind == KastMail.Kind.RECEIVED) {
                        addDeposit(context, m);
                    }
                }
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
