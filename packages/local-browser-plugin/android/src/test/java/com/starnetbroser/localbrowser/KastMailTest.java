package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

// Shaped like the real, confirmed KAST mails (Arabic) - fake names, cards and amounts only.
public class KastMailTest {

    private static String b64url(String text) {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String mail(String from, String subject, String body) {
        return "{\"id\":\"k1\",\"internalDate\":\"1000\",\"snippet\":\"\",\"payload\":{\"mimeType\":\"text/html\","
            + "\"headers\":[{\"name\":\"From\",\"value\":\"" + from + "\"},{\"name\":\"Subject\",\"value\":\"" + subject + "\"}],"
            + "\"body\":{\"data\":\"" + b64url(body) + "\"}}}";
    }

    private static final String KAST = "KAST <hello@kast.example>";

    @Test
    public void readsARefusedStarlinkPayment() {
        KastMail.Message m = KastMail.parse(mail(KAST, "تم رفض عملية بطاقتك ❌",
            "<p>مرحباً Demo,</p><p>تم رفض دفعتك إلى DLC* STARLINK INTERNET باستخدام البطاقة التي تنتهي بـ <b>1234</b>. يمكنك التحقق من السبب</p>"
                + "<div><p>تفاصيل المعاملة:</p><p>حالة الدفع: غير ناجح</p><p>المبلغ: 7.30 دولار أمريكي</p><p>معرف المعاملة: 01ab-cd</p></div>"));
        assertNotNull(m);
        assertEquals(KastMail.Kind.DECLINED, m.kind);
        assertEquals(7.30, m.amount, 0.001);
        assertEquals("1234", m.cardLast4);
        assertEquals("DLC* STARLINK INTERNET", m.merchant);
        assertTrue(m.isStarlink());
    }

    @Test
    public void readsDollarsReceived() {
        KastMail.Message m = KastMail.parse(mail(KAST, "لقد تلقيت دولارات من demo-sender!",
            "<p>مرحباً، Demo!</p><p>لقد استلمت للتو <b>18.30 دولار أمريكي</b> في حسابك على KAST.</p>"
                + "<p>تفاصيل المعاملة:</p><p>المبلغ: 18.30 دولار أمريكي<br>اسم المرسل: demo-sender</p>"));
        assertNotNull(m);
        assertEquals(KastMail.Kind.RECEIVED, m.kind);
        assertEquals(18.30, m.amount, 0.001);
        assertEquals("demo-sender", m.sender);
    }

    @Test
    public void readsTheEnglishWordingToo() {
        KastMail.Message m = KastMail.parse(mail(KAST, "Your card transaction was declined",
            "Your payment to STARLINK INTERNET using the card ending in 5678 was declined. Amount: $45.74 USD"));
        assertNotNull(m);
        assertEquals("5678", m.cardLast4);
        assertEquals(45.74, m.amount, 0.001);
        assertEquals("STARLINK INTERNET", m.merchant);
    }

    @Test
    public void ignoresCodesAndOtherSenders() {
        assertNull(KastMail.parse(mail(KAST, "Your KAST verification code", "565562 is your KAST verification code.")));
        assertNull(KastMail.parse(mail("Shop <news@shop.example>", "تم رفض عملية بطاقتك", "المبلغ: 7.30 دولار أمريكي")));
        assertNull(KastMail.parse("not json"));
        assertTrue(KastMail.listUrl().contains("from%3Akast"));
    }

    @Test
    public void guessesTheDeviceFromTheAmountTheCardsOwnFirst() {
        List<KastMatch.Device> devices = KastMatch.parseDevices(
            "[{\"name\":\"Demo A\",\"expectedUsd\":10.05,\"cardLast4\":\"\"},{\"name\":\"Demo B\",\"expectedUsd\":9.99,\"cardLast4\":\"1234\"},"
                + "{\"name\":\"Demo C\",\"expectedUsd\":43.2,\"cardLast4\":\"1234\"},{\"name\":\"\",\"expectedUsd\":9.99},{\"name\":\"Demo D\",\"expectedUsd\":0}]");
        assertEquals(3, devices.size());
        List<KastMatch.Device> likely = KastMatch.candidates(devices, 9.99, "1234");
        assertEquals(Arrays.asList("Demo B", "Demo A"), Arrays.asList(likely.get(0).name, likely.get(1).name));
        // ARS converted at KAST's rate vs the app's: a few percent apart still counts.
        assertEquals("Demo C", KastMatch.candidates(devices, 44.5, "").get(0).name);
        assertTrue(KastMatch.candidates(devices, 25, "1234").isEmpty());
        assertTrue(KastMatch.parseDevices("oops").isEmpty());
    }

    @Test
    public void theTelegramAlertNamesTheLikelyDevices() {
        KastMail.Message m = KastMail.parse(mail(KAST, "تم رفض عملية بطاقتك",
            "تم رفض دفعتك إلى STARLINK INTERNET باستخدام البطاقة التي تنتهي بـ 1234. المبلغ: 9.99 دولار أمريكي"));
        List<KastMatch.Device> devices = KastMatch.parseDevices("[{\"name\":\"Demo B\",\"expectedUsd\":9.99,\"cardLast4\":\"1234\"}]");
        String text = KastMatch.alert(m, devices);
        assertTrue(text, text.startsWith("❌ رُفض دفع Starlink 9.99$ بالبطاقة 1234"));
        assertTrue(text.contains("الأرجح: «Demo B» (عليه 9.99$)"));
        assertTrue(KastMatch.alert(m, KastMatch.parseDevices("[]")).contains("لم أجد جهازاً"));
        assertFalse(text.contains("null"));
    }
}
