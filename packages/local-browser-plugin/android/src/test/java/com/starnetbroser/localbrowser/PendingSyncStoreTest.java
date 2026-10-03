package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Pure-logic coverage for PendingSyncStore's JSON accumulation/ack, independent of any Android
 * Context/SharedPreferences - correctness of the actual on-device delivery guarantee (multiple
 * consecutive results accumulating, ack being an idempotent no-op, a listed-but-unacked record
 * never being silently dropped) lives entirely in these static methods.
 */
public class PendingSyncStoreTest {

    private static JSONObject fields(String key, String value) throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put(key, value);
        return obj;
    }

    @Test
    public void addRecordStartsFromAnEmptyStore() throws JSONException {
        String updated = PendingSyncStore.addRecord(null, "sync-1", "acc-1", fields("planName", "X"), 1000L);
        JSONArray records = PendingSyncStore.parseRecords(updated);

        assertEquals(1, records.length());
        JSONObject record = records.getJSONObject(0);
        assertEquals("sync-1", record.getString("syncId"));
        assertEquals("acc-1", record.getString("accountId"));
        assertEquals("X", record.getJSONObject("fields").getString("planName"));
    }

    /** Models several "تحديث من Starlink" taps on different sections (Devices, then Subscriptions,
     * then Billing, ...) - none of them may erase an earlier one still waiting to be delivered. */
    @Test
    public void severalConsecutiveResultsAllAccumulateWithoutErasingEarlierOnes() throws JSONException {
        String json = PendingSyncStore.addRecord(null, "sync-1", "acc-1", fields("dishStatus", "online"), 1000L);
        json = PendingSyncStore.addRecord(json, "sync-2", "acc-1", fields("planName", "Residential"), 2000L);
        json = PendingSyncStore.addRecord(json, "sync-3", "acc-2", fields("balanceDue", "0.00"), 3000L);

        JSONArray records = PendingSyncStore.parseRecords(json);
        assertEquals(3, records.length());
        assertEquals("sync-1", records.getJSONObject(0).getString("syncId"));
        assertEquals("sync-2", records.getJSONObject(1).getString("syncId"));
        assertEquals("sync-3", records.getJSONObject(2).getString("syncId"));
        assertEquals("online", records.getJSONObject(0).getJSONObject("fields").getString("dishStatus"));
        assertEquals("Residential", records.getJSONObject(1).getJSONObject("fields").getString("planName"));
        assertEquals("0.00", records.getJSONObject(2).getJSONObject("fields").getString("balanceDue"));
    }

    @Test
    public void ackRemovesOnlyTheGivenSyncIds() throws JSONException {
        String json = PendingSyncStore.addRecord(null, "sync-1", "acc-1", fields("a", "1"), 1000L);
        json = PendingSyncStore.addRecord(json, "sync-2", "acc-1", fields("b", "2"), 2000L);
        json = PendingSyncStore.addRecord(json, "sync-3", "acc-1", fields("c", "3"), 3000L);

        String updated = PendingSyncStore.removeRecords(json, Collections.singletonList("sync-2"));
        JSONArray records = PendingSyncStore.parseRecords(updated);

        assertEquals(2, records.length());
        assertEquals("sync-1", records.getJSONObject(0).getString("syncId"));
        assertEquals("sync-3", records.getJSONObject(1).getString("syncId"));
    }

    /** No duplicate result with the same syncId: acking it (once delivered/merged) must make it
     * disappear for good, and acking it again (e.g. a retried ack call) must never throw or
     * resurrect anything. */
    @Test
    public void ackingAnUnknownOrAlreadyRemovedSyncIdIsASafeNoOp() throws JSONException {
        String json = PendingSyncStore.addRecord(null, "sync-1", "acc-1", fields("a", "1"), 1000L);

        String updated = PendingSyncStore.removeRecords(json, Arrays.asList("sync-404", "sync-1"));
        assertEquals(0, PendingSyncStore.parseRecords(updated).length());

        String updatedAgain = PendingSyncStore.removeRecords(updated, Collections.singletonList("sync-1"));
        assertEquals(0, PendingSyncStore.parseRecords(updatedAgain).length());
    }

    /** Models the app being backgrounded (or crashing) after listing but before acking - the
     * record must still be there, completely unchanged, next time it's listed. */
    @Test
    public void listingWithoutAckingNeverLosesTheRecord() throws JSONException {
        String json = PendingSyncStore.addRecord(null, "sync-1", "acc-1", fields("dishStatus", "online"), 1000L);

        JSONArray firstList = PendingSyncStore.parseRecords(json);
        JSONArray secondList = PendingSyncStore.parseRecords(json);

        assertEquals(1, firstList.length());
        assertEquals(1, secondList.length());
        assertEquals("online", secondList.getJSONObject(0).getJSONObject("fields").getString("dishStatus"));
    }

    @Test
    public void emptyOrMalformedStoreParsesAsEmptyArrayRatherThanThrowing() {
        assertEquals(0, PendingSyncStore.parseRecords(null).length());
        assertEquals(0, PendingSyncStore.parseRecords("").length());
        assertEquals(0, PendingSyncStore.parseRecords("not json").length());
    }
}
