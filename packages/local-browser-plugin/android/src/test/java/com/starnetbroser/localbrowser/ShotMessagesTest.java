package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ShotMessagesTest {

    @Test
    public void travelDoneGreetsTheCustomerAndNamesTheDevice() {
        assertEquals("مرحبًا أحمد،\n✅ تم توثيق جهاز Starlink الخاص بك (DEMO 1) بنجاح.\n⭐ STAR NET", ShotMessages.text(ShotMessages.TRAVEL_DONE, " أحمد ", "DEMO 1"));
    }

    @Test
    public void noNameNoDeviceStillReads() {
        assertEquals("مرحبًا،\n✅ جهاز Starlink الخاص بك يعمل بشكل طبيعي.\n⭐ STAR NET", ShotMessages.text(ShotMessages.WORKING, null, " "));
    }

    @Test
    public void everyReadyButtonHasItsMessage() {
        assertEquals(ShotMessages.READY_LABELS.length, ShotMessages.READY_KINDS.length);
        for (int kind : ShotMessages.READY_KINDS) assertTrue(ShotMessages.text(kind, "x", "y").contains("(y)"));
    }
}
