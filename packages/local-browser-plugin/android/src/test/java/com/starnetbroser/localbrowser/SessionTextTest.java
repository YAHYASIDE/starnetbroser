package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// Shaped like a «Cookie-Editor» export cut by Telegram - fake values only.
public class SessionTextTest {

    private static String repeat(char c, int n) {
        StringBuilder b = new StringBuilder(n);
        for (int i = 0; i < n; i++) b.append(c);
        return b.toString();
    }

    @Test
    public void anyPieceOfAnExportIsAFragment() {
        // The head (JSON opening), the middle (a cut-off value), and the tail all count.
        assertTrue(SessionText.isFragment("[\n    {\n        \"name\": \"DemoAuth\",\n        \"value\": \"" + repeat('A', 3000)));
        assertTrue(SessionText.isFragment(repeat('A', 4000)));
        assertTrue(SessionText.isFragment(repeat('A', 100) + "\", \"domain\": \"starlink.com\", \"path\": \"/\" }\n]"));
        assertTrue(SessionText.isFragment("Starlink.Com.Demo=" + repeat('B', 20) + "; other=1"));
    }

    @Test
    public void commandsAreNeverFragments() {
        assertFalse(SessionText.isFragment("متوقف"));
        assertFalse(SessionText.isFragment("كشف محمد ولد أحمد"));
        assertFalse(SessionText.isFragment("starlink"));
        assertFalse(SessionText.isFragment(""));
    }

    @Test
    public void everyPieceGoesToTheApp_inWhateverOrder() {
        String chat = "owner";
        // Even the tail arriving first is taken (not answered as a command).
        assertTrue(SessionText.take(chat, repeat('A', 2000) + "\", \"domain\": \"starlink.com\" }]", 1_000));
        assertTrue(SessionText.take(chat, "[{\"name\":\"DemoAuth\",\"value\":\"" + repeat('A', 300), 2_000));
        assertTrue(SessionText.take(chat, repeat('A', 4000), 3_000));
        assertFalse(SessionText.take(chat, "ابحث عن محمد", 4_000));
    }

    @Test
    public void startIsOnlyTheJsonOpening() {
        assertTrue(SessionText.isStart("[{\"name\":\"x\",\"value\":\"" + repeat('A', 60)));
        assertFalse(SessionText.isStart(repeat('A', 4000)));
        assertFalse(SessionText.isStart("\", \"domain\": \"starlink.com\" }]"));
    }
}
