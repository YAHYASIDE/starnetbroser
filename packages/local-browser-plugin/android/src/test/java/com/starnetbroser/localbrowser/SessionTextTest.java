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
    public void theFirstPartOfAnExport() {
        assertTrue(SessionText.isStart("[\n    {\n        \"name\": \"DemoAuth\",\n        \"value\": \"" + repeat('A', 3000)));
        assertTrue(SessionText.isStart("Starlink.Com.Demo=" + repeat('B', 20) + "; other=1"));
        assertFalse(SessionText.isStart("متوقف"));
        assertFalse(SessionText.isStart("[1] تجربة"));
        // A piece from inside the list is never a new session.
        assertFalse(SessionText.isStart("\"domain\": \"starlink.com\", \"name\": \"x\""));
    }

    @Test
    public void followingPartsOnlyWhileOneIsArriving() {
        String chat = "chat-1";
        assertTrue(SessionText.take(chat, "[{\"name\":\"DemoAuth\",\"value\":\"" + repeat('A', 300), 1_000));
        assertTrue(SessionText.take(chat, repeat('A', 4000), 2_000));
        assertTrue(SessionText.take(chat, "\", \"domain\": \"starlink.com\" }]", 3_000));
        assertFalse(SessionText.take(chat, "ابحث عن محمد", 4_000));
        assertFalse(SessionText.take("chat-2", repeat('A', 4000), 4_000));
        assertFalse(SessionText.take(chat, repeat('A', 4000), 4_000 + SessionText.PART_GAP_MS));
    }
}
