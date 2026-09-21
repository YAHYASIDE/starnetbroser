package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONException;
import org.junit.Test;

/**
 * Pure-logic coverage for AutoSyncAccountStore's JSON round trip, independent of any Android
 * Context/SharedPreferences.
 */
public class AutoSyncAccountStoreTest {

    @Test
    public void roundTripsEntriesInOrder() throws JSONException {
        List<AutoSyncAccountStore.Entry> entries = Arrays.asList(
            new AutoSyncAccountStore.Entry("acc-1", "مقهى النخيل", "https://starlink.com/account/home"),
            new AutoSyncAccountStore.Entry("acc-2", "فيلا الياسمين", "https://starlink.com/account/home")
        );

        String json = AutoSyncAccountStore.toJson(entries);
        List<AutoSyncAccountStore.Entry> loaded = AutoSyncAccountStore.fromJson(json);

        assertEquals(2, loaded.size());
        assertEquals("acc-1", loaded.get(0).accountId);
        assertEquals("مقهى النخيل", loaded.get(0).accountName);
        assertEquals("acc-2", loaded.get(1).accountId);
    }

    @Test
    public void emptyListRoundTripsAsEmpty() throws JSONException {
        String json = AutoSyncAccountStore.toJson(Collections.emptyList());
        assertTrue(AutoSyncAccountStore.fromJson(json).isEmpty());
    }

    @Test
    public void emptyOrMalformedStoreParsesAsEmptyListRatherThanThrowing() {
        assertTrue(AutoSyncAccountStore.fromJson(null).isEmpty());
        assertTrue(AutoSyncAccountStore.fromJson("").isEmpty());
        assertTrue(AutoSyncAccountStore.fromJson("not json").isEmpty());
    }

    @Test
    public void entryWithBlankAccountIdIsSkippedOnLoad() {
        List<AutoSyncAccountStore.Entry> loaded = AutoSyncAccountStore.fromJson(
            "[{\"accountId\":\"\",\"accountName\":\"x\",\"url\":\"https://starlink.com/account/home\"}," +
            "{\"accountId\":\"acc-1\",\"accountName\":\"y\",\"url\":\"https://starlink.com/account/home\"}]"
        );
        assertEquals(1, loaded.size());
        assertEquals("acc-1", loaded.get(0).accountId);
    }

    @Test
    public void missingAccountNameFallsBackToAccountId() {
        AutoSyncAccountStore.Entry entry = new AutoSyncAccountStore.Entry("acc-1", null, "https://starlink.com/account/home");
        assertEquals("acc-1", entry.accountName);
    }

    @Test
    public void missingUrlOnLoadFallsBackToTheDefaultAccountHomeUrl() {
        List<AutoSyncAccountStore.Entry> loaded = AutoSyncAccountStore.fromJson(
            "[{\"accountId\":\"acc-1\",\"accountName\":\"x\"}]"
        );
        assertEquals(1, loaded.size());
        assertEquals(LocalBrowserPlugin.DEFAULT_URL, loaded.get(0).url);
    }

    /** Models replacing the whole list on every account-list change (add/edit/remove) - never
     * additive, so a removed/renamed account never lingers in the next scheduled run. */
    @Test
    public void savingAShorterListFullyReplacesTheStoredOne() throws JSONException {
        String first = AutoSyncAccountStore.toJson(Arrays.asList(
            new AutoSyncAccountStore.Entry("acc-1", "a", "https://starlink.com/account/home"),
            new AutoSyncAccountStore.Entry("acc-2", "b", "https://starlink.com/account/home")
        ));
        assertEquals(2, AutoSyncAccountStore.fromJson(first).size());

        String second = AutoSyncAccountStore.toJson(Collections.singletonList(
            new AutoSyncAccountStore.Entry("acc-2", "b", "https://starlink.com/account/home")
        ));
        List<AutoSyncAccountStore.Entry> loaded = AutoSyncAccountStore.fromJson(second);
        assertEquals(1, loaded.size());
        assertEquals("acc-2", loaded.get(0).accountId);
    }
}
