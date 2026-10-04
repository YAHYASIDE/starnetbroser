package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

// Shaped like the operator's real bank notifications - fake names and numbers only.
public class BankNoticeTest {

    @Test
    public void knowsTheAppsByPackage() {
        assertEquals("bankily", BankNotice.appKey("mr.example.bankily", "Transfert d'argent"));
        assertEquals("sedad", BankNotice.appKey("com.example.sedad.app", "ENVOI"));
        assertEquals("binance", BankNotice.appKey("com.binance.dev", "USDT Deposit Successful"));
        assertEquals("nita", BankNotice.appKey("com.example.mynita", "Compte à Compte"));
        assertEquals("masrvi", BankNotice.appKey("com.example.masrvi", "Anything"));
    }

    @Test
    public void knowsTheAppsByTitleWhenThePackageIsUnknown() {
        assertEquals("bankily", BankNotice.appKey("com.unknown.wallet", "Gimtel envoie de l'argent"));
        assertEquals("sedad", BankNotice.appKey("com.unknown.wallet", "PAIEMENT_CREDIT"));
        assertEquals("nita", BankNotice.appKey("com.unknown.wallet", "Compte à Compte"));
    }

    @Test
    public void dropsEveryOtherApp() {
        assertNull(BankNotice.appKey("com.whatsapp", "DEMO NAME"));
        assertNull(BankNotice.appKey("com.zhiliaoapp.musically", "شارك فيديو"));
        assertNull(BankNotice.appKey("com.starnetbroser.app", "ENVOI"));
        assertNull(BankNotice.keep("com.whatsapp", "Transfert", "10 MRU"));
    }

    @Test
    public void keepsOnlyNotificationsWithAFigure() {
        assertEquals("sedad", BankNotice.keep("com.example.sedad", "ENVOI", "أرسلتم مبلغ 200.0 أوقية جديدة لصالح DEMO ( 40000000 )"));
        assertNull(BankNotice.keep("com.example.sedad", "Sedad", "اكتشف عروضنا الجديدة"));
    }

    @Test
    public void oneIdPerPostedNotification() {
        String a = BankNotice.id("p", 1000L, "ENVOI", "200");
        assertEquals(a, BankNotice.id("p", 1000L, "ENVOI", "200"));
        assertNotEquals(a, BankNotice.id("p", 2000L, "ENVOI", "200"));
    }
}
