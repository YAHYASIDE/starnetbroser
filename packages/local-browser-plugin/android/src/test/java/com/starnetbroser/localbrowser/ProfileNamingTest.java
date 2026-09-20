package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
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
    public void resultOnlyContainsFilesystemSafeCharacters() {
        String name = ProfileNaming.profileNameFor("acc/../../etc passwd*?");
        assertTrue(name.matches("starnet_account_[0-9a-f]{64}"));
    }

    /**
     * Regression test for the exact collision found by an independent review: the previous
     * sanitize-unsafe-characters-to-"_" implementation mapped these pairs to the identical
     * profile name, which would have silently merged two different accounts' Starlink sessions.
     * SHA-256 of the full accountId makes this class of collision computationally infeasible.
     */
    @Test
    public void doesNotCollideOnPairsThatUsedToSanitizeIdentically() {
        String[][] pairs = {
            {"acc/a", "acc?a"},
            {"client 1", "client?1"},
            {"أحمد", "محمد"},
        };
        for (String[] pair : pairs) {
            String a = ProfileNaming.profileNameFor(pair[0]);
            String b = ProfileNaming.profileNameFor(pair[1]);
            assertNotEquals("\"" + pair[0] + "\" and \"" + pair[1] + "\" must not collide", a, b);
        }
    }

    /**
     * The hash input must be accountId exactly as given, not a trimmed copy - two ids differing
     * only in leading/trailing whitespace are different ids and must resolve to different
     * profiles, never be silently folded together.
     */
    @Test
    public void whitespaceOnlyDifferencesProduceDifferentProfiles() {
        assertNotEquals(ProfileNaming.profileNameFor("acc-1"), ProfileNaming.profileNameFor(" acc-1"));
        assertNotEquals(ProfileNaming.profileNameFor("client"), ProfileNaming.profileNameFor("client "));
    }

    @Test
    public void doesNotCollideOnLongDifferingIds() {
        String base = "customer-";
        StringBuilder padding = new StringBuilder();
        for (int i = 0; i < 500; i++) padding.append('x');

        String idA = base + padding + "-A";
        String idB = base + padding + "-B";
        assertNotEquals(ProfileNaming.profileNameFor(idA), ProfileNaming.profileNameFor(idB));
    }

    /**
     * Regression guard for "prevent use of a shared profile" at scale: many distinct account ids
     * - including ids that would have collided under the old sanitize-to-"_" scheme - must never
     * collapse onto the same profile name.
     */
    @Test
    public void isStableAcrossThousandsOfDistinctAccountIds() {
        Set<String> seen = new HashSet<>();
        String[] weirdChars = {"/", "?", "*", " ", ".", "#", "%", "أ", "م", "خ"};
        for (int i = 0; i < 5000; i++) {
            String id = "customer" + weirdChars[i % weirdChars.length] + i;
            String profile = ProfileNaming.profileNameFor(id);
            assertTrue("duplicate profile name for distinct account id " + id, seen.add(profile));
        }
    }
}
