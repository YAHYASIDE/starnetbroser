package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class CodeBotTextTest {

    @Test
    public void aStarlinkCodeWithItsDevice() {
        assertEquals(
            "🔑 رمز 🛰️ دخول Starlink: 482913\n📡 الجهاز: جهاز السوق\n👤 الزبون: زبون تجريبي\n✉️ demo-1@example.com\n🔢 KIT000000\n🕒 22/10 14:05\n⏳ الرمز يعمل دقائق فقط.",
            CodeBotText.message("starlink", "482913", "جهاز السوق", "زبون تجريبي", "demo-1@example.com", "KIT000000", "22/10 14:05"));
    }

    @Test
    public void aCardCodeHasNoDeviceLines() {
        assertEquals("🔑 رمز 💳 دفع البطاقة: 9988\n🕒 22/10 14:05\n⏳ الرمز يعمل دقائق فقط.",
            CodeBotText.message("card", "9988", null, " ", null, null, "22/10 14:05"));
        assertEquals("📧 دخول البريد", CodeBotText.kindLabel("mail"));
    }
}
