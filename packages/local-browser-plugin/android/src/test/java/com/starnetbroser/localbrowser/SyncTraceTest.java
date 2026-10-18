package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SyncTraceTest {

    @Test
    public void onePageAfterAnother() {
        SyncTrace trace = new SyncTrace();
        trace.signedIn(4000);
        trace.page("الاشتراكات", true, true, 1240);
        trace.page("الأجهزة", true, false, 7000);
        trace.page("الفوترة", false, false, 9050);
        trace.stopped("تعلّقت");
        assertEquals("⏳ دخول 4ث · الاشتراكات ✓ 1.2ث · الأجهزة ⚪ 7ث · الفوترة ✗ 9.1ث · ⛔ تعلّقت", trace.text());
    }

    @Test
    public void emptyWhenNothingHappened() {
        assertEquals("", new SyncTrace().text());
        assertEquals("0ث", SyncTrace.seconds(-5));
    }
}
