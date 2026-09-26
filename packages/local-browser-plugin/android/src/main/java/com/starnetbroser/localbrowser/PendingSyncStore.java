package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Durable staging area for "تحديث من Starlink" results, bridging AccountBrowserActivity (a
 * separate Activity that can run while the main STAR NET Activity/Bridge is stopped) to the web
 * UI. A result is written here BEFORE AccountBrowserActivity shows its own success toast, and is
 * only removed once the web UI has confirmed it actually merged and saved it (ack()) - a live
 * LocalBrowserPlugin.emitAccountDataSynced() event is a best-effort optimization on top of this,
 * never the only delivery path, since Capacitor drops events fired while its WebView/Bridge isn't
 * attached and resumed (exactly what happens while this separate Activity is in front of it).
 */
final class PendingSyncStore {

    private static final String PREFS_NAME = "starnet_pending_account_syncs";
    private static final String KEY_PENDING = "pending_syncs";

    private PendingSyncStore() {}

    // ---- Pure JSON accumulation/ack logic - no Android Context/SharedPreferences involved, so
    // this is what is actually unit-tested (PendingSyncStoreTest): multiple consecutive results
    // accumulating in order, ack being an idempotent no-op for an unknown/already-removed id, and
    // a record that's listed but never acked staying fully intact for the next list. ----

    /** Appends one record and returns the updated store JSON. `fields` is copied by reference. */
    static String addRecord(String currentJson, String syncId, String accountId, JSONObject fields, long recordedAt)
        throws JSONException {
        JSONArray records = parseRecords(currentJson);
        JSONObject record = new JSONObject();
        record.put("syncId", syncId);
        record.put("accountId", accountId);
        record.put("fields", fields);
        record.put("recordedAt", recordedAt);
        records.put(record);
        return records.toString();
    }

    /** Never throws - malformed/missing storage reads back as "no pending syncs", not a crash. */
    static JSONArray parseRecords(String currentJson) {
        if (currentJson == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(currentJson);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Removes exactly the records whose syncId is in `syncIdsToRemove`; unknown ids are ignored. */
    static String removeRecords(String currentJson, List<String> syncIdsToRemove) {
        JSONArray records = parseRecords(currentJson);
        JSONArray remaining = new JSONArray();
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (record == null) {
                continue;
            }
            String id = record.optString("syncId", null);
            if (id != null && syncIdsToRemove.contains(id)) {
                continue;
            }
            remaining.put(record);
        }
        return remaining.toString();
    }

    // ---- Android-touching wrappers ----

    /**
     * Persists one result and returns its new syncId - or null if the write did not actually
     * reach disk. Uses the synchronous commit() (not apply(), which queues the write and returns
     * immediately with no way to know whether it ever lands) specifically because the caller
     * (AccountBrowserActivity) must never show its success toast or fire the live event before
     * this result is genuinely safe on disk - apply()'s "probably fine" isn't good enough for
     * that guarantee.
     */
    static synchronized String save(Context context, String accountId, JSONObject fields) {
        String syncId = UUID.randomUUID().toString();
        SharedPreferences prefs = prefs(context);
        try {
            String updated = addRecord(prefs.getString(KEY_PENDING, null), syncId, accountId, fields, System.currentTimeMillis());
            boolean committed = prefs.edit().putString(KEY_PENDING, updated).commit();
            if (!committed) {
                return null;
            }
        } catch (JSONException e) {
            // fields (already a parsed JSObject) cannot actually fail to serialize here - but a
            // staging write must never crash the caller regardless; treat it as a failed save.
            return null;
        }
        return syncId;
    }

    /** All results not yet acknowledged by the web UI, oldest first. */
    static synchronized JSONArray listPending(Context context) {
        return parseRecords(prefs(context).getString(KEY_PENDING, null));
    }

    /**
     * Removes exactly the given syncIds and returns whether that write actually reached disk
     * (commit(), not apply() - same reasoning as save()). A false return means the caller must
     * treat these syncIds as still pending and retry the ack later, never as delivered.
     */
    static synchronized boolean ack(Context context, List<String> syncIds) {
        SharedPreferences prefs = prefs(context);
        String updated = removeRecords(prefs.getString(KEY_PENDING, null), syncIds);
        return prefs.edit().putString(KEY_PENDING, updated).commit();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
