package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🏦 The bank / wallet notifications (BankNotice) waiting for the app - kept on disk the moment they
 * arrive, so nothing is lost while the app is closed; the app reads them («حسابي»), saves them as
 * suggestions in its own store, then acks them here. Only these apps' notifications are ever
 * stored, on this phone only; nothing is logged.
 */
final class BankNoticeStore {

    private BankNoticeStore() {}

    private static final String PREFS = "starnet_bank_notices";
    private static final String KEY = "pending";
    /** A phone left closed for weeks keeps the newest ones. */
    private static final int MAX = 400;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** [{"id","app","pkg","title","text","at"}], oldest first. */
    static synchronized JSONArray pending(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void add(Context context, String app, String pkg, String title, String text, long at) {
        String id = BankNotice.id(pkg, at, title, text);
        JSONArray all = pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject n = all.optJSONObject(i);
            if (n != null && id.equals(n.optString("id"))) return;
        }
        try {
            JSONObject n = new JSONObject();
            n.put("id", id);
            n.put("app", app);
            n.put("pkg", pkg);
            n.put("title", title);
            n.put("text", text);
            n.put("at", at);
            all.put(n);
        } catch (JSONException e) {
            return;
        }
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, all.length() - MAX); i < all.length(); i++) kept.put(all.opt(i));
        prefs(context).edit().putString(KEY, kept.toString()).commit();
    }

    /** The app saved these - drop them here. */
    static synchronized void ack(Context context, Set<String> ids) {
        JSONArray kept = new JSONArray();
        JSONArray all = pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject n = all.optJSONObject(i);
            if (n != null && !ids.contains(n.optString("id"))) kept.put(n);
        }
        prefs(context).edit().putString(KEY, kept.toString()).commit();
    }
}
