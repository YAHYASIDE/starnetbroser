package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AlertCryptoTest {

    private static final String KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    // sealed by the app's own code (WebCrypto AES-GCM, as lib/deviceSyncCrypto.ts sealText)
    private static final String IV = "AQIDBAUGBwgJCgsM";
    private static final String DATA = "AVBrz5xyh3vIIBwY6DeoyttHIdfudT7kDEt+d+bvkJHB/G+erRrK9m2VCrZVbk9fGAGM5OqW1QEUkDAZn4L0BlCwGGU=";

    @Test
    public void opensWhatTheAppSealed() {
        assertEquals("{\"note\":\"الطبق لا يتصل\",\"level\":\"urgent\"}", AlertCrypto.open(IV, DATA, KEY));
    }

    @Test
    public void aWrongKeyOrDamagedDataOpensNothing() {
        assertNull(AlertCrypto.open(IV, DATA, KEY.replace('0', '1')));
        assertNull(AlertCrypto.open(IV, "AAAA" + DATA.substring(4), KEY));
        assertNull(AlertCrypto.open(IV, DATA, "short"));
        assertNull(AlertCrypto.open(IV, "not base64 !", KEY));
    }

    @Test
    public void theNotificationSaysHowUrgentAndFromWhom() {
        assertEquals("🔴 مستعجل - 🚩 تحذير من المندوب الحسين\n📡 DEMO 1\n📝 لا يتصل", AlertCrypto.repFlagText("urgent", " الحسين ", "DEMO 1", "لا يتصل"));
        assertEquals("🟡 🚩 تنبيه من المسؤول 2\n📡 DEMO 1\n📝 بطيء", AlertCrypto.teamFlagText(null, "المسؤول 2", "DEMO 1", "بطيء"));
        assertTrue(AlertCrypto.teamFlagText("normal", "", "x", "y").contains("تنبيه من مسؤول"));
    }

    @Test
    public void onlyWhatCameAfterTheAppLooked() {
        assertTrue(AlertCrypto.isNewSince(10_000, 8_000));
        assertTrue(AlertCrypto.isNewSince(10_000, 12_000)); // a few seconds of clock slack
        assertFalse(AlertCrypto.isNewSince(10_000, 20_000));
        assertTrue(AlertCrypto.isNewSince(0, 20_000));
    }
}
