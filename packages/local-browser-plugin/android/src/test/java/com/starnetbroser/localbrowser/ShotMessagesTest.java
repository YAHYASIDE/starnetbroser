package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ShotMessagesTest {

    @Test
    public void travelDoneGreetsTheCustomerAndNamesTheDevice() {
        assertEquals("مرحبًا أحمد،\n✅ تم توثيق جهاز Starlink الخاص بك بنجاح.\n📡 الجهاز: DEMO 1\n⭐ STAR NET",
            ShotMessages.text(ShotMessages.TRAVEL_DONE, " أحمد ", "DEMO 1"));
    }

    @Test
    public void noNameNoDeviceStillReads() {
        assertEquals("مرحبًا،\n✅ جهازك يعمل بشكل طبيعي وجيد، بدون أي أعطال.\n⭐ STAR NET", ShotMessages.text(ShotMessages.STATUS[0][1], null, " "));
    }

    @Test
    public void hisNineStatesAndFiveActivations() {
        assertEquals(9, ShotMessages.STATUS.length);
        assertEquals(5, ShotMessages.ACTIVATION.length);
        for (String[][] list : new String[][][] {ShotMessages.STATUS, ShotMessages.ACTIVATION}) {
            for (String[] item : list) {
                assertEquals(3, item.length);
                assertFalse(item[0].isEmpty());
                assertFalse(item[1].isEmpty());
                assertFalse(item[2].isEmpty());
            }
        }
        assertTrue(ShotMessages.STATUS[5][1].contains("3 أيام متتالية"));
        assertEquals("📶 100 جيجا", ShotMessages.labels(ShotMessages.ACTIVATION)[0]);
        assertEquals("off3days", ShotMessages.STATUS[5][2]);
        assertEquals("burned", ShotMessages.STATUS[6][2]);
    }

    @Test
    public void hisEditedTextsFromTheAppWinUnlessBroken() {
        String[][] mine = {{"✅ تمام", "✅ جهازك تمام.", "ok"}};
        assertEquals(mine, ShotMessages.pick(mine, ShotMessages.STATUS));
        assertEquals(ShotMessages.STATUS, ShotMessages.pick(null, ShotMessages.STATUS));
        assertEquals(ShotMessages.STATUS, ShotMessages.pick(new String[0][], ShotMessages.STATUS));
        assertEquals(ShotMessages.STATUS, ShotMessages.pick(new String[][] {{"x", " ", "ok"}}, ShotMessages.STATUS));
        assertEquals(ShotMessages.STATUS, ShotMessages.pick(new String[][] {{"x", "y"}}, ShotMessages.STATUS));
    }
}
