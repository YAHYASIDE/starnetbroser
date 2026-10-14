package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AppEventTextTest {

    @Test
    public void firstLineIsTheTitleAndTheRestTheBody() {
        assertArrayEquals(
            new String[] {"💵 طلب دفعة من المندوب DEMO", "وافق عليه من صفحة المندوبين"},
            AppEventText.titleAndBody("💵 طلب دفعة من المندوب DEMO\nوافق عليه من صفحة المندوبين\n"));
    }

    @Test
    public void aSingleLineIsBothTitleAndBody() {
        assertArrayEquals(new String[] {"✅ انتهت المزامنة", "✅ انتهت المزامنة"}, AppEventText.titleAndBody("  ✅ انتهت المزامنة  "));
        assertArrayEquals(new String[] {"STAR NET", ""}, AppEventText.titleAndBody(null));
    }

    @Test
    public void aLongTitleIsShortened() {
        StringBuilder longLine = new StringBuilder();
        for (int i = 0; i < 120; i++) longLine.append('x');
        String title = AppEventText.titleAndBody(longLine.toString())[0];
        assertEquals(90, title.length());
        assertEquals('…', title.charAt(89));
    }

    @Test
    public void aDeviceRouteSearchesForItOnTheHomeScreen() {
        assertEquals("/?q=demo-a%40example.com", AppEventText.deviceRoute("demo-a@example.com"));
        assertEquals("/?q=DEMO%20NAME", AppEventText.deviceRoute(" DEMO NAME "));
        assertEquals("/", AppEventText.deviceRoute(""));
    }

    @Test
    public void onlyInAppRoutesAreKept() {
        assertEquals("/representatives", AppEventText.safeRoute("/representatives"));
        assertEquals("/", AppEventText.safeRoute("https://example.com"));
        assertEquals("/", AppEventText.safeRoute("//example.com"));
        assertEquals("/", AppEventText.safeRoute(null));
    }
}
