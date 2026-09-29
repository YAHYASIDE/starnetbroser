package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MailUrlTest {

    @Test
    public void allowsOutlookAndMicrosoftSignInOverHttpsOnly() {
        assertTrue(MailUrl.isAllowed("https://outlook.live.com/mail/0/"));
        assertTrue(MailUrl.isAllowed("https://login.live.com/login.srf"));
        assertTrue(MailUrl.isAllowed("https://account.microsoft.com/"));
        assertTrue(MailUrl.isAllowed("https://login.microsoftonline.com/common"));
        assertFalse(MailUrl.isAllowed("http://outlook.live.com/mail/0/"));
        assertFalse(MailUrl.isAllowed("https://evil-live.com/"));
        assertFalse(MailUrl.isAllowed("https://live.com.evil.io/"));
        assertFalse(MailUrl.isAllowed("javascript:alert(1)"));
        assertFalse(MailUrl.isAllowed(null));
    }

    @Test
    public void inboxCarriesTheEmailAsASignInHint() {
        assertEquals("https://outlook.live.com/mail/0/?login_hint=a%2Bb%40outlook.com", MailUrl.inboxUrlFor(" a+b@outlook.com "));
        assertEquals(MailUrl.INBOX_URL, MailUrl.inboxUrlFor(null));
        assertTrue(MailUrl.isAllowed(MailUrl.inboxUrlFor("x@hotmail.com")));
    }

    @Test
    public void stopsTheGetTheAppHopButNotTheMailbox() {
        assertTrue(MailUrl.isAppStoreRedirect("https://play.google.com/store/apps/details?id=com.microsoft.office.outlook"));
        assertTrue(MailUrl.isAppStoreRedirect("market://details?id=com.microsoft.office.outlook"));
        assertTrue(MailUrl.isAppStoreRedirect("intent://outlook#Intent;end"));
        assertTrue(MailUrl.isAppStoreRedirect("https://apps.apple.com/app/outlook/id951937596"));
        assertFalse(MailUrl.isAppStoreRedirect("https://outlook.live.com/mail/0/"));
        assertFalse(MailUrl.isAppStoreRedirect("https://login.live.com/login.srf"));
        assertFalse(MailUrl.isAppStoreRedirect(null));
        assertFalse(MailUrl.DESKTOP_USER_AGENT.contains("Android"));
        assertFalse(MailUrl.DESKTOP_USER_AGENT.contains("Mobile"));
    }

    @Test
    public void theMailboxProfileIsSeparateFromTheStarlinkOne() {
        assertNotEquals(ProfileNaming.profileNameFor("acc-1"), ProfileNaming.mailProfileNameFor("acc-1"));
        assertNotEquals(ProfileNaming.mailProfileNameFor("acc-1"), ProfileNaming.mailProfileNameFor("acc-2"));
        assertEquals(ProfileNaming.mailProfileNameFor("acc-1"), ProfileNaming.mailProfileNameFor("acc-1"));
    }
}
