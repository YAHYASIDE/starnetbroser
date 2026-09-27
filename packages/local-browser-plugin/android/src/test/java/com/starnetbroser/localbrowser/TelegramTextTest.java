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
    public void listsEveryStoppedDevice() {
        assertEquals("⛔ توقف جهاز - أوقفت Starlink الاشتراك:\n• مقهى", TelegramText.stoppedMessage(Arrays.asList("مقهى")));
        assertEquals(
            "⛔ توقف 2 أجهزة - أوقفت Starlink الاشتراك:\n• أ\n• ب",
            TelegramText.stoppedMessage(Arrays.asList("أ", "ب"))
        );
    }
}
