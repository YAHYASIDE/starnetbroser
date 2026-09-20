package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class ProfileNamingTest {

    @Test
    public void sameAccountAlwaysMapsToTheSameProfile() {
        assertEquals(ProfileNaming.profileNameFor("acc-123"), ProfileNaming.profileNameFor("acc-123"));
    }

    @Test
    public void differentAccountsMapToDifferentProfiles() {
        assertNotEquals(ProfileNaming.profileNameFor("acc-1"), ProfileNaming.profileNameFor("acc-2"));
    }

    @Test
    public void neverReturnsTheSharedDefaultProfileName() {
        String[] inputs = {"acc-1", "Default", "default", "DEFAULT", "starnet_account_"};
        for (String input : inputs) {
            assertNotEquals(ProfileNaming.DEFAULT_PROFILE_NAME, ProfileNaming.profileNameFor(input));
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsNullAccountId() {
        ProfileNaming.profileNameFor(null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsBlankAccountId() {
        ProfileNaming.profileNameFor("   ");
    }

    @Test
    public void sanitizesCharactersUnsafeForAFilesystemDirectoryName() {
        String name = ProfileNaming.profileNameFor("acc/../../etc passwd*?");
        assertFalse(name.contains("/"));
        assertFalse(name.contains(" "));
        assertFalse(name.contains("*"));
        assertFalse(name.contains("?"));
        assertTrue(name.startsWith("starnet_account_"));
    }

    /**
     * Regression guard for "prevent use of a shared profile" at scale: many distinct account ids
     * must never collapse onto the same profile name, which would silently merge two customers'
     * Starlink sessions into one.
     */
    @Test
    public void isStableAcrossManyDistinctAccountIds() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            String id = "customer-" + i;
            String profile = ProfileNaming.profileNameFor(id);
            assertTrue("duplicate profile name for distinct account id " + id, seen.add(profile));
        }
    }
}
