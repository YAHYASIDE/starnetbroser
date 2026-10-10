package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import org.junit.Test;

public class SyncNotifierTest {

    @Test
    public void listsUpToFiveNamesThenACount() {
        assertEquals("مقهى", SyncNotifier.stoppedText(Arrays.asList("مقهى")));
        assertEquals("أ، ب", SyncNotifier.stoppedText(Arrays.asList("أ", "ب")));
        assertEquals("1، 2، 3، 4، 5 و2 آخر", SyncNotifier.stoppedText(Arrays.asList("1", "2", "3", "4", "5", "6", "7")));
    }
}
