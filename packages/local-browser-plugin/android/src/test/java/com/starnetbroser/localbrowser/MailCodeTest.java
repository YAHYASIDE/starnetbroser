package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class MailCodeTest {

    @Test
    public void findsTheCodeInAnOutlookListPreview() {
        String page = "Inbox\nFocused\nStarlink\nYour Starlink verification code\n10:42\nYour code is 482913. It expires in 10 minutes.\nMicrosoft account team\nNew sign-in 2026";
        assertEquals("482913", MailCode.find(page));
    }

    @Test
    public void theNewestMessageComesFirst() {
        String page = "Starlink\nVerification code 111222\nStarlink\nVerification code 333444";
        assertEquals("111222", MailCode.find(page));
    }

    @Test
    public void skipsYearsTimesDatesAndLongNumbers() {
        assertEquals("5831", MailCode.find("Starlink 2026 - 10:42 - 29/09/2026 - +22212345678\ncode: 5831"));
        assertNull(MailCode.find("Starlink invoice 2026\nKIT 4012345678901 due 29/09"));
    }

    @Test
    public void readsArabicCodes() {
        assertEquals("739015", MailCode.find("Starlink\nرمز التحقق الخاص بك هو ٧٣٩٠١٥"));
    }

    @Test
    public void numbersFarFromAnyCodeLineAreIgnored() {
        assertNull(MailCode.find("Order 123456 shipped"));
        assertNull(MailCode.find(null));
        assertNull(MailCode.find(""));
    }
}
