package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;

public class TelegramTextTest {

    @Test
    public void readsTheOldOnePhoneMapAsChatToRepAndListsEveryPhoneOfARep() {
        Map<String, String> old = new LinkedHashMap<>();
        old.put("rep1", "111");
        old.put("rep2", "222");
        Map<String, String> chatReps = TelegramText.invertPairs(old);
        assertEquals("rep1", chatReps.get("111"));
        assertEquals("rep2", chatReps.get("222"));
        chatReps.put("333", "rep1");
        assertEquals(java.util.Arrays.asList("111", "333"), TelegramText.keysFor(chatReps, "rep1"));
        assertEquals(java.util.Collections.emptyList(), TelegramText.keysFor(chatReps, "rep9"));
        assertEquals(chatReps, TelegramText.decodePairs(TelegramText.encodePairs(chatReps)));
    }

    @Test
    public void truncatesOnlyWhenTooLong() {
        assertEquals("abc", TelegramText.truncate("abc", 5));
        assertEquals("abcd…", TelegramText.truncate("abcdefgh", 5));
        assertEquals("", TelegramText.truncate(null, 5));
    }

    @Test
    public void formEncodesArabicAndSkipsMissingValues() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("chat_id", "123");
        params.put("text", "توقف & جهاز");
        params.put("parse_mode", null);
        assertEquals("chat_id=123&text=%D8%AA%D9%88%D9%82%D9%81+%26+%D8%AC%D9%87%D8%A7%D8%B2", TelegramText.formEncode(params));
    }

    @Test
    public void buildsAMultipartBodyWithTheFileLast() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("chat_id", "42");
        fields.put("caption", "كشف");
        byte[] body = TelegramText.multipart("XYZ", fields, "document", "كشف \"مورد\".pdf", "application/pdf", new byte[] {1, 2, 3});
        String text = new String(body, StandardCharsets.UTF_8);
        assertTrue(text.startsWith("--XYZ\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n42\r\n"));
        assertTrue(text.contains("name=\"document\"; filename=\"كشف مورد.pdf\""));
        assertTrue(text.contains("Content-Type: application/pdf\r\n\r\n"));
        assertTrue(text.endsWith("\r\n--XYZ--\r\n"));
    }

    @Test
    public void groupsStoppedDevicesByRepAndSkipsThoseWithoutOne() {
        Map<String, java.util.List<String>> groups = TelegramText.groupByRep(
            Arrays.asList("r1", null, "r2", "r1", ""),
            Arrays.asList("أ", "ب", "ج", "د", "هـ")
        );
        assertEquals(2, groups.size());
        assertEquals(Arrays.asList("أ", "د"), groups.get("r1"));
        assertEquals(Arrays.asList("ج"), groups.get("r2"));
        assertEquals("⛔ توقف 2 من أجهزتك - أوقفت Starlink الاشتراك، تواصل مع الزبون:\n• أ\n• د", TelegramText.repStoppedMessage(groups.get("r1")));
    }

    @Test
    public void repChatMapRoundTrips() {
        Map<String, String> chats = new LinkedHashMap<>();
        chats.put("rep-1", "111");
        chats.put("rep-2", "-222");
        chats.put("bad", "");
        Map<String, String> back = TelegramText.decodePairs(TelegramText.encodePairs(chats));
        assertEquals(2, back.size());
        assertEquals("111", back.get("rep-1"));
        assertEquals("-222", back.get("rep-2"));
        assertTrue(TelegramText.decodePairs(null).isEmpty());
        assertTrue(TelegramText.decodePairs("junk\n=x\ny=").isEmpty());
    }

    @Test
    public void listsEveryStoppedDevice() {
        assertEquals("⛔ توقف جهاز - أوقفت Starlink الاشتراك:\n• مقهى", TelegramText.stoppedMessage(Arrays.asList("مقهى")));
        assertEquals(
            "⛔ توقف 2 أجهزة - أوقفت Starlink الاشتراك:\n• أ\n• ب",
            TelegramText.stoppedMessage(Arrays.asList("أ", "ب"))
        );
    }
}
