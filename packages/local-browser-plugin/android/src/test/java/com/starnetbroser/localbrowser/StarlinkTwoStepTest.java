package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class StarlinkTwoStepTest {

    @Test
    public void anOldCodeIsNeverTypedTwice() {
        String stored = StarlinkTwoStep.remember("", "111111");
        assertFalse(StarlinkTwoStep.isNew("111111", stored));
        assertTrue(StarlinkTwoStep.isNew("222222", stored));
        assertFalse(StarlinkTwoStep.isNew(null, stored));
    }

    @Test
    public void remembersTheNewestTenWithoutDuplicates() {
        String stored = "";
        for (int i = 0; i < 12; i++) stored = StarlinkTwoStep.remember(stored, String.valueOf(100000 + i));
        assertEquals(StarlinkTwoStep.REMEMBERED, StarlinkTwoStep.parseTried(stored).size());
        assertEquals("100011", StarlinkTwoStep.parseTried(stored).get(0));
        assertFalse(StarlinkTwoStep.parseTried(stored).contains("100000")); // the oldest dropped
        stored = StarlinkTwoStep.remember("a,b,c", "b");
        assertEquals("b,a,c", stored);
    }

    @Test
    public void theFillScriptCarriesTheCodeAsASafeLiteral() {
        String script = StarlinkTwoStep.fillScript("482913");
        assertTrue(script.endsWith("(\"482913\");"));
        assertTrue(StarlinkTwoStep.fillScript("1\"</script>").contains("\\u003c/script\\u003e"));
    }
}
