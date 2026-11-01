package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TelegramRatingsTest {

    @Test
    public void aTapIsParsedAndAnythingElseIsNot() {
        TelegramRatings.Tap good = TelegramRatings.parse("rt:g:0a1b2c3d");
        assertEquals('g', good.verdict);
        assertEquals("0a1b2c3d", good.token);
        assertEquals('b', TelegramRatings.parse("rt:b:ffffffff").verdict);
        assertNull(TelegramRatings.parse("rt:x:0a1b2c3d"));
        assertNull(TelegramRatings.parse("rt:g:0A1B2C3D"));
        assertNull(TelegramRatings.parse("rt:g:0a1b2c"));
        assertNull(TelegramRatings.parse("ks:l"));
        assertNull(TelegramRatings.parse(null));
    }

    @Test
    public void theSameChoiceTwiceIsRememberedAsSameAndAChangeReplacesIt() {
        String r = TelegramRatings.remember("", "0a1b2c3d", 'g');
        assertEquals('g', TelegramRatings.recalled(r, "0a1b2c3d"));
        assertEquals(0, TelegramRatings.recalled(r, "11111111"));
        r = TelegramRatings.remember(r, "11111111", 'b');
        r = TelegramRatings.remember(r, "0a1b2c3d", 'b');
        assertEquals('b', TelegramRatings.recalled(r, "0a1b2c3d"));
        assertEquals('b', TelegramRatings.recalled(r, "11111111"));
        assertEquals("11111111=b;0a1b2c3d=b", r);
        // a token that ends another one is not confused with it
        assertEquals(0, TelegramRatings.recalled("aa0a1b2c3d=g", "0a1b2c3d"));
    }

    @Test
    public void theMemoryIsCapped() {
        String r = "";
        for (int i = 0; i < TelegramRatings.MAX_REMEMBERED + 50; i++) r = TelegramRatings.remember(r, String.format("%08x", i), 'g');
        assertEquals(TelegramRatings.MAX_REMEMBERED, r.split(";").length);
        assertEquals(0, TelegramRatings.recalled(r, String.format("%08x", 0)));
        assertEquals('g', TelegramRatings.recalled(r, String.format("%08x", TelegramRatings.MAX_REMEMBERED + 49)));
    }

    @Test
    public void theChosenButtonIsMarkedAndBothStay() {
        String kb = TelegramRatings.markup("0a1b2c3d", 'b');
        assertTrue(kb.contains("\"✅ جيد\",\"callback_data\":\"rt:g:0a1b2c3d\""));
        assertTrue(kb.contains("\"❌ غير جيد ✓\",\"callback_data\":\"rt:b:0a1b2c3d\""));
    }

    @Test
    public void theOwnerAlertSaysWhoAndWhat() {
        String text = TelegramRatings.ownerAlert("الحسين", "Mamadou", "🔔 STAR NET | حركة مالية جديدة\n💵 العملية: 3,000 سيفا");
        assertTrue(text.startsWith("🚨 المندوب الحسين (Mamadou) ضغط «❌ غير جيد»"));
        assertTrue(text.contains("💵 العملية: 3,000 سيفا"));
        assertTrue(TelegramRatings.ownerAlert("", "", "x").startsWith("🚨 المندوب ضغط"));
        assertTrue(TelegramRatings.toast('b', false).contains("أُبلغ المسؤول"));
        assertTrue(TelegramRatings.toast('g', true).contains("من قبل"));
    }

    @Test
    public void htmlIsStrippedForThePlainFallback() {
        assertEquals("💵 العملية: 3,000 سيفا <x> & y", TelegramText.stripHtml("<b>💵 العملية: 3,000 سيفا</b> &lt;x&gt; &amp; y"));
    }
}
