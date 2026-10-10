package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// The steps of his real «add a KAST card» run (screenshots), with fake card digits only.
public class CardAddFlowTest {

    private static CardAddFlow.Sight sight(String json) {
        return CardAddFlow.Sight.of("{\"type\":\"sight\"," + json + "}");
    }

    private static final CardAddFlow.Sight NOTHING = sight("\"save\":false,\"onFile\":null,\"error\":null");

    @Test
    public void theWholeRunFromBillingToTheSavedCard() {
        Object billing = new Object();
        Object form = new Object();
        Object verify = new Object();
        CardAddFlow flow = new CardAddFlow("1111", 0, "9999");

        assertEquals(CardAddFlow.Action.OPEN_FORM, flow.onSight(billing, sight("\"paymentEdit\":true,\"onFile\":\"9999\""), 1));
        // The form shows Save before it's filled: nothing yet.
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(form, sight("\"save\":true"), 2));
        assertEquals(CardAddFlow.Action.SAVE, flow.filled(5));
        assertSame(form, flow.saveFrame());
        flow.clicked("save", 3);

        assertEquals(CardAddFlow.Action.EMAIL, flow.onSight(verify, sight("\"verifyChoice\":true"), 4));
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(verify, sight("\"verifyChoice\":true,\"save\":false"), 5));
        assertEquals(CardAddFlow.Action.AWAIT_CODE, flow.onSight(verify, sight("\"otp\":true"), 6));
        assertTrue(flow.awaitingCode());
        flow.clicked("code", 7);
        assertFalse(flow.awaitingCode());

        assertEquals(CardAddFlow.Action.SAVED, flow.onSight(billing, sight("\"paymentEdit\":true,\"onFile\":\"1111\""), 8));
        assertTrue(flow.isOver(9));
    }

    @Test
    public void theFrozenCardErrorEndsTheRun() {
        Object form = new Object();
        CardAddFlow flow = new CardAddFlow("1111", 0, null);
        flow.onSight(form, sight("\"save\":true"), 1);
        assertEquals(CardAddFlow.Action.SAVE, flow.filled(5));
        flow.clicked("save", 2);
        assertEquals(CardAddFlow.Action.NEEDS_VERIFICATION, flow.onSight(form, sight("\"save\":true,\"error\":\"needs-verification\""), 3));
        assertTrue(flow.isOver(4));
    }

    @Test
    public void anErrorAlreadyOnThePageIsNotNew() {
        Object billing = new Object();
        CardAddFlow flow = new CardAddFlow("1111", 0, null);
        flow.onSight(billing, sight("\"error\":\"declined\""), 1);
        flow.filled(3);
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(billing, sight("\"error\":\"declined\",\"onFile\":\"9999\""), 2));
        assertFalse(flow.isOver(3));
    }

    @Test
    public void theSameCardAlreadyOnFileIsNotAResultBeforeTheCode() {
        Object billing = new Object();
        Object form = new Object();
        CardAddFlow flow = new CardAddFlow("1111", 0, "1111");
        flow.onSight(form, sight("\"save\":true"), 1);
        flow.filled(5);
        flow.clicked("save", 2);
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(billing, sight("\"onFile\":\"1111\""), 3));
        assertEquals(CardAddFlow.Action.AWAIT_CODE, flow.onSight(form, sight("\"otp\":true"), 4));
        flow.clicked("code", 5);
        assertEquals(CardAddFlow.Action.SAVED, flow.onSight(billing, sight("\"onFile\":\"1111\",\"paymentEdit\":true"), 6));
    }

    @Test
    public void nothingIsTappedBeforeTheCardIsFilled() {
        CardAddFlow flow = new CardAddFlow("1111", 0, null);
        Object frame = new Object();
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(frame, sight("\"verifyChoice\":true,\"otp\":true"), 1));
        assertEquals(CardAddFlow.Action.NONE, flow.onSight(frame, NOTHING, 2));
        assertEquals(CardAddFlow.Action.NONE, flow.filled(0));
    }

    @Test
    public void endsAfterTenMinutesAndTellsOnceWhenNoResult() {
        CardAddFlow flow = new CardAddFlow("1111", 0, null);
        Object form = new Object();
        flow.onSight(form, sight("\"save\":true"), 1);
        flow.filled(5);
        flow.clicked("save", 10);
        assertFalse(flow.noResultYet(10 + CardAddFlow.NO_RESULT_MS - 1));
        assertTrue(flow.noResultYet(10 + CardAddFlow.NO_RESULT_MS));
        assertFalse(flow.noResultYet(10 + CardAddFlow.NO_RESULT_MS + 5));
        assertTrue(flow.isOver(CardAddFlow.MAX_MS + 1));
    }

    @Test
    public void readsTheSightMessage() {
        CardAddFlow.Sight s = sight("\"save\":true,\"verifyChoice\":false,\"otp\":false,\"paymentEdit\":false,\"onFile\":\"1111\",\"error\":null");
        assertTrue(s.save);
        assertFalse(s.otp);
        assertEquals("1111", s.onFile);
        assertNull(s.error);
    }
}
