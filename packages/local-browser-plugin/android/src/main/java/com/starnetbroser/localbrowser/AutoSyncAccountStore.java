package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The list of accounts AutoSyncWorker should visit on its next periodic run - set wholesale by
 * the web UI (LocalBrowserPlugin#setAutoSyncAccountIds) every time the account list changes, so a
 * closed/killed app still has an up-to-date list for its next scheduled run. This store never
 * establishes a login itself: an entry whose isolated profile (see ProfileNaming) has no cookies
 * yet - because that account was never opened via "فتح" - simply yields no fields each run, same
 * as a manual "تحديث من Starlink" tap on a logged-out page.
 */
final class AutoSyncAccountStore {

    private static final String PREFS_NAME = "starnet_auto_sync_accounts";
    private static final String KEY_ACCOUNTS = "accounts";

    private AutoSyncAccountStore() {
    }

    /** One account to visit: the isolation key, a display name (unused by the worker itself, kept
     * only for future diagnostics), and the URL to load - defaults to LocalBrowserPlugin.DEFAULT_URL
     * when the caller didn't provide one. */
    static final class Entry {
        final String accountId;
        final String accountName;
        final String url;

        Entry(@NonNull String accountId, @Nullable String accountName, @NonNull String url) {
            this.accountId = accountId;
            this.accountName = accountName != null ? accountName : accountId;
            this.url = url;
        }
    }

    // ---- Pure JSON logic - no Android Context/SharedPreferences involved, so this is what is
    // actually unit-tested (AutoSyncAccountStoreTest). ----

    static String toJson(List<Entry> entries) throws JSONException {
        JSONArray array = new JSONArray();
        for (Entry entry : entries) {
            JSONObject obj = new JSONObject();
            obj.put("accountId", entry.accountId);
            obj.put("accountName", entry.accountName);
            obj.put("url", entry.url);
            array.put(obj);
        }
        return array.toString();
    }

    /** Never throws - malformed/missing storage reads back as "no accounts to sync", not a crash. */
    static List<Entry> fromJson(@Nullable String json) {
        List<Entry> entries = new ArrayList<>();
        if (json == null) {
            return entries;
        }
        JSONArray array;
        try {
            array = new JSONArray(json);
        } catch (JSONException e) {
            return entries;
        }
        for (int i = 0; i < array.length(); i++) {
            JSONObject obj = array.optJSONObject(i);
            if (obj == null) {
                continue;
            }
            String accountId = obj.optString("accountId", null);
            if (accountId == null || accountId.trim().isEmpty()) {
                continue;
            }
            String url = obj.optString("url", null);
            entries.add(new Entry(accountId, obj.optString("accountName", null), url != null ? url : LocalBrowserPlugin.DEFAULT_URL));
        }
        return entries;
    }

    // ---- Android-touching wrappers ----

    /** Returns whether the write actually reached disk (commit(), not apply()) - same reasoning as
     * PendingSyncStore.save(): a caller must never report success over a write that isn't safe. */
    static synchronized boolean save(Context context, List<Entry> entries) {
        try {
            return prefs(context).edit().putString(KEY_ACCOUNTS, toJson(entries)).commit();
        } catch (JSONException e) {
            return false;
        }
    }

    static synchronized List<Entry> load(Context context) {
        return fromJson(prefs(context).getString(KEY_ACCOUNTS, null));
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
