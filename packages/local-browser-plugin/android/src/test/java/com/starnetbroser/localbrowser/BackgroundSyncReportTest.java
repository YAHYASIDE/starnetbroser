package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class BackgroundSyncReportTest {

    @Test
    public void reportListsEveryDeviceTriedWithItsStatus() {
        String text = BackgroundSyncReport.report("3 أيام", Arrays.asList("demo-a", "demo-b", "demo-c"), Arrays.asList("ok", "signedOut", "stuck"), false);
        assertEquals("🔄 انتهت المزامنة في الخلفية (3 أيام): تمت 1 من 3\n✅ تمت · demo-a\n🔒 غير مسجّل في Starlink · demo-b\n⏳ تعلّقت - تُخطّيت · demo-c", text);
    }

    @Test
    public void stoppedRunAndEmptyNames() {
        String text = BackgroundSyncReport.report("", Collections.singletonList(""), Collections.singletonList("nothing"), true);
        assertEquals("⏹ أُوقفت المزامنة في الخلفية: تمت 0 من 1\n⚠️ لم تُقرأ بيانات · جهاز", text);
    }

    @Test
    public void alertAndProgress() {
        assertTrue(BackgroundSyncReport.signedOutAlert("demo-a").contains("«demo-a» غير مسجّل في Starlink"));
        assertEquals("3 / 10 · demo-a", BackgroundSyncReport.progress(2, 10, "demo-a"));
        assertEquals("❔ بلا نتيجة", BackgroundSyncReport.label(null));
    }
}
