package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class SessionProbeTest {

    @Test
    public void parsesTheQuotedScriptResult() {
        assertEquals("login", SessionProbe.parse("\"login\""));
        assertEquals("account", SessionProbe.parse("\"account\""));
        assertEquals("other", SessionProbe.parse("\"other\""));
        assertEquals("other", SessionProbe.parse("null"));
        assertEquals("other", SessionProbe.parse(null));
        assertEquals("other", SessionProbe.parse("\"something else\""));
    }

    @Test
    public void aLoginPageIsDecisiveImmediately() {
        int[] count = { 0 };
        assertEquals(SessionProbe.STATUS_LOGIN_REQUIRED, SessionProbe.decide("login", count));
    }

    @Test
    public void theAccountPortalMustBeSeenTwiceInARow() {
        int[] count = { 0 };
        assertNull(SessionProbe.decide("account", count));
        assertEquals(SessionProbe.STATUS_LOGGED_IN, SessionProbe.decide("account", count));
    }

    @Test
    public void anSpaRedirectToLoginAfterShowingTheAccountStillMeansLoginRequired() {
        int[] count = { 0 };
        assertNull(SessionProbe.decide("account", count));
        assertEquals(SessionProbe.STATUS_LOGIN_REQUIRED, SessionProbe.decide("login", count));
    }

    @Test
    public void anOtherPageResetsTheAccountStreak() {
        int[] count = { 0 };
        assertNull(SessionProbe.decide("account", count));
        assertNull(SessionProbe.decide("other", count));
        assertNull(SessionProbe.decide("account", count));
        assertEquals(SessionProbe.STATUS_LOGGED_IN, SessionProbe.decide("account", count));
    }

    @Test
    public void timeoutAnswersFromTheLastReport() {
        assertEquals(SessionProbe.STATUS_LOGGED_IN, SessionProbe.onTimeout("account"));
        assertEquals(SessionProbe.STATUS_UNKNOWN, SessionProbe.onTimeout("other"));
        assertEquals(SessionProbe.STATUS_UNKNOWN, SessionProbe.onTimeout(null));
    }
}
