package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class TravelCheckReportTest {

    @Test
    public void aDeviceIsClearOnlyWhenHomeReallySaidSo() {
        assertEquals("needs", TravelCheckReport.result("ok", Boolean.TRUE));
        assertEquals("clear", TravelCheckReport.result("ok", Boolean.FALSE));
        // Read something, but Home never showed the account line nor the banner: not checked.
        assertEquals("nothing", TravelCheckReport.result("ok", null));
        assertEquals("signedOut", TravelCheckReport.result("signedOut", null));
        assertEquals("stuck", TravelCheckReport.result("stuck", Boolean.TRUE));
        assertEquals("nothing", TravelCheckReport.result(null, null));
    }

    @Test
    public void reportListsTheDevicesThatNeedItThenTheUnchecked() {
        String text = TravelCheckReport.report(
            "كل الأجهزة",
            Arrays.asList("demo-a", "demo-b", "demo-c", "demo-d"),
            Arrays.asList("needs", "clear", "signedOut", "nothing"),
            Arrays.asList("October 15", null, null, null),
            false);
        assertEquals(
            "🛂 انتهى كشف التوثيق في الخلفية (كل الأجهزة)\nفُحص 2 جهاز · يحتاج توثيق: 1 · لم يُفحص 2\n"
                + "\n1) demo-a · ⏰ قبل October 15"
                + "\n\nلم يُفحص:\n🔒 غير مسجّل في Starlink · demo-c\n⚠️ لم تظهر الصفحة الرئيسية - لم يُفحص · demo-d"
                + "\n\nافتح التطبيق: أزرار الواتساب جاهزة للزبائن.",
            text);
    }

    @Test
    public void allClearAndStopped() {
        String text = TravelCheckReport.report("", Collections.singletonList("demo-a"), Collections.singletonList("clear"), Collections.singletonList(null), true);
        assertEquals("⏹ أُوقف كشف التوثيق في الخلفية\nفُحص 1 جهاز · يحتاج توثيق: 0\n\n✅ لا جهاز يحتاج توثيقًا.", text);
        assertFalse(text.contains("لم يُفحص"));
        assertTrue(TravelCheckReport.progress(0, 5, "demo-a").endsWith("1 / 5 · demo-a"));
    }
}
