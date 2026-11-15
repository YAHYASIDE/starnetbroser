package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Fake numbers only. */
public class WhatsAppAgentRulesTest {

    @Test
    public void onlyHisTestNumbersUntilEveryone() {
        List<String> test = Arrays.asList("20000001");
        List<String> reps = Arrays.asList("40000004");
        assertTrue(WhatsAppAgentRules.answers("20000001", true, false, test, reps));
        assertFalse(WhatsAppAgentRules.answers("30000003", true, false, test, reps));
        assertTrue(WhatsAppAgentRules.answers("30000003", true, true, test, reps));
        assertFalse(WhatsAppAgentRules.answers("40000004", true, true, test, reps));
        assertFalse(WhatsAppAgentRules.answers("20000001", false, true, test, reps));
        assertFalse(WhatsAppAgentRules.answers(null, true, true, test, Collections.<String>emptyList()));
    }

    @Test
    public void freshAndLimited() {
        long now = 10_000_000L;
        assertTrue(WhatsAppAgentRules.fresh(now - 60_000L, now));
        assertFalse(WhatsAppAgentRules.fresh(now - 16 * 60_000L, now));
        List<Long> sent = new ArrayList<>();
        for (int i = 0; i < 19; i++) sent.add(now - 1000L * i);
        assertTrue(WhatsAppAgentRules.underHourlyLimit(sent, now));
        sent.add(now);
        assertFalse(WhatsAppAgentRules.underHourlyLimit(sent, now));
        sent.clear();
        for (int i = 0; i < 30; i++) sent.add(now - 2 * WhatsAppAgentRules.HOUR_MS);
        assertTrue(WhatsAppAgentRules.underHourlyLimit(sent, now));
    }
}
