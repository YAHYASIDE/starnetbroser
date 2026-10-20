package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BillCheckTextTest {

    @Test
    public void theLabelCarriesTheWaitUntilTheNextCheck() {
        String label = BillCheckText.label(3_600_000);
        assertTrue(BillCheckText.isBillLabel(label));
        assertEquals(3_600_000, BillCheckText.nextMs(label));
        assertEquals(-1, BillCheckText.nextMs(BillCheckText.label(-1)));
        assertFalse(BillCheckText.isBillLabel("🌅 مزامنة الصباح"));
    }

    @Test
    public void onlyTheResultNeverTamat() {
        assertEquals("⏳ «الدي عروته»: الفاتورة لم تنزل بعد - الفحص التالي بعد ساعة",
            BillCheckText.line("الدي عروته", "ok", "0.00", 3_600_000));
        assertEquals("⏳ «الدي عروته»: الفاتورة لم تنزل بعد - انتهت الفحوص؛ يُملأ D في أي مزامنة عادية",
            BillCheckText.line("الدي عروته", "ok", "", -1));
        assertEquals("⏳ نزلت فاتورة «الدي عروته»: 70.50 - افتح STAR NET لتُسجَّل D",
            BillCheckText.line("الدي عروته", "ok", "70.50", 3_600_000));
        assertEquals("⏳ «x»: لم يُفحص (🔒 غير مسجّل في Starlink) - الفحص التالي بعد 4 ساعات",
            BillCheckText.line("x", "signedOut", null, 4 * 3_600_000));
    }

    @Test
    public void durationsInArabic() {
        assertEquals("30 دقيقة", BillCheckText.duration(30 * 60_000));
        assertEquals("ساعتين", BillCheckText.duration(2 * 3_600_000));
        assertEquals("6 ساعات", BillCheckText.duration(6 * 3_600_000));
        assertEquals("12 ساعة", BillCheckText.duration(12 * 3_600_000));
        assertTrue(BillCheckText.billCame("ok", "1,234.50"));
        assertFalse(BillCheckText.billCame("nothing", "70"));
    }
}
