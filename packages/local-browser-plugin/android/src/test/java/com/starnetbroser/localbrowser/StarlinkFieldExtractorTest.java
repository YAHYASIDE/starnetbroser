package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.starnetbroser.localbrowser.support.HtmlToVisibleText;
import org.junit.Test;

public class StarlinkFieldExtractorTest {

    private static final String STARLINK_URL = "https://starlink.com/account/home";

    private static final String ENGLISH_HTML =
        "<html><body>"
            + "<div class=\"card\"><div class=\"label\">Starlink Dish</div><div class=\"value status-x1\">Online</div></div>"
            + "<div class=\"card\"><div class=\"label\">Wi-Fi</div><div class=\"value status-x2\">Offline</div></div>"
            + "<div>Plan: Residential</div>"
            + "<div class=\"row\"><div>Renewal Date</div><div>2026/09/28</div></div>"
            + "<div class=\"row\"><div>Balance Due</div><div>$0.00</div></div>"
            + "<div class=\"row\"><div>Starlink ID</div><div>SL-99887766</div></div>"
            + "<div class=\"row\"><div>Serial Number</div><div>SN123456789</div></div>"
            + "<div class=\"row\"><div>KIT Number</div><div>KIT-000111</div></div>"
            + "<div class=\"row\"><div>Service Status</div><div>Active</div></div>"
            + "<div class=\"row\"><div>Account Holder</div><div>John Smith</div></div>"
            + "</body></html>";

    private static final String ARABIC_HTML =
        "<html><body dir=\"rtl\">"
            + "<div class=\"card\"><div class=\"label\">الطبق</div><div class=\"value\">متصل</div></div>"
            + "<div class=\"card\"><div class=\"label\">واي فاي</div><div class=\"value\">غير متصل</div></div>"
            + "<div>الخطة: سكني</div>"
            + "<div class=\"row\"><div>تاريخ التجديد</div><div>2026/09/28</div></div>"
            + "<div class=\"row\"><div>الرصيد المستحق</div><div>0 USD</div></div>"
            + "<div class=\"row\"><div>معرف ستارلينك</div><div>SL-55443322</div></div>"
            + "<div class=\"row\"><div>الرقم التسلسلي</div><div>SN987654321</div></div>"
            + "<div class=\"row\"><div>رقم KIT</div><div>KIT-222333</div></div>"
            + "<div class=\"row\"><div>حالة الخدمة</div><div>نشط</div></div>"
            + "<div class=\"row\"><div>اسم صاحب الحساب</div><div>محمد أحمد</div></div>"
            + "</body></html>";

    @Test
    public void extractsAllFieldsFromEnglishHtml() {
        String text = HtmlToVisibleText.convert(ENGLISH_HTML);
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields(STARLINK_URL, text);

        assertTrue(result.accepted);
        assertEquals("online", result.fields.get(StarlinkFieldExtractor.FIELD_DISH_STATUS));
        assertEquals("offline", result.fields.get(StarlinkFieldExtractor.FIELD_WIFI_STATUS));
        assertEquals("Residential", result.fields.get(StarlinkFieldExtractor.FIELD_PLAN_NAME));
        assertEquals("2026/09/28", result.fields.get(StarlinkFieldExtractor.FIELD_RENEWAL_DATE));
        assertEquals("0.00", result.fields.get(StarlinkFieldExtractor.FIELD_BALANCE_DUE));
        assertEquals("$", result.fields.get(StarlinkFieldExtractor.FIELD_CURRENCY));
        assertEquals("SL-99887766", result.fields.get(StarlinkFieldExtractor.FIELD_STARLINK_ID));
        assertEquals("SN123456789", result.fields.get(StarlinkFieldExtractor.FIELD_SERIAL_NUMBER));
        assertEquals("KIT-000111", result.fields.get(StarlinkFieldExtractor.FIELD_KIT_NUMBER));
        assertEquals("Active", result.fields.get(StarlinkFieldExtractor.FIELD_SERVICE_STATUS));
        assertEquals("John Smith", result.fields.get(StarlinkFieldExtractor.FIELD_ACCOUNT_HOLDER_NAME));
    }

    @Test
    public void extractsAllFieldsFromArabicHtml() {
        String text = HtmlToVisibleText.convert(ARABIC_HTML);
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields(STARLINK_URL, text);

        assertTrue(result.accepted);
        assertEquals("online", result.fields.get(StarlinkFieldExtractor.FIELD_DISH_STATUS));
        assertEquals("offline", result.fields.get(StarlinkFieldExtractor.FIELD_WIFI_STATUS));
        assertEquals("سكني", result.fields.get(StarlinkFieldExtractor.FIELD_PLAN_NAME));
        assertEquals("2026/09/28", result.fields.get(StarlinkFieldExtractor.FIELD_RENEWAL_DATE));
        assertEquals("0", result.fields.get(StarlinkFieldExtractor.FIELD_BALANCE_DUE));
        assertEquals("USD", result.fields.get(StarlinkFieldExtractor.FIELD_CURRENCY));
        assertEquals("SL-55443322", result.fields.get(StarlinkFieldExtractor.FIELD_STARLINK_ID));
        assertEquals("SN987654321", result.fields.get(StarlinkFieldExtractor.FIELD_SERIAL_NUMBER));
        assertEquals("KIT-222333", result.fields.get(StarlinkFieldExtractor.FIELD_KIT_NUMBER));
        assertEquals("نشط", result.fields.get(StarlinkFieldExtractor.FIELD_SERVICE_STATUS));
        assertEquals("محمد أحمد", result.fields.get(StarlinkFieldExtractor.FIELD_ACCOUNT_HOLDER_NAME));
    }

    @Test
    public void rejectsDataFromANonStarlinkDomain() {
        String text = HtmlToVisibleText.convert(ENGLISH_HTML);
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields("https://evil.com/account/home", text);

        assertFalse(result.accepted);
        assertTrue(result.fields.isEmpty());
    }

    @Test
    public void rejectsPlainHttpEvenOnTheRealHost() {
        String text = HtmlToVisibleText.convert(ENGLISH_HTML);
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields("http://starlink.com/account/home", text);

        assertFalse(result.accepted);
        assertTrue(result.fields.isEmpty());
    }

    @Test
    public void neverInventsAFieldThatIsNotOnThePage() {
        String text = HtmlToVisibleText.convert("<html><body><div>Plan: Residential</div></body></html>");
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields(STARLINK_URL, text);

        assertTrue(result.accepted);
        assertEquals("Residential", result.fields.get(StarlinkFieldExtractor.FIELD_PLAN_NAME));
        assertFalse("must not fabricate a balance that was never on the page",
            result.fields.containsKey(StarlinkFieldExtractor.FIELD_BALANCE_DUE));
        assertFalse(result.fields.containsKey(StarlinkFieldExtractor.FIELD_DISH_STATUS));
        assertFalse(result.fields.containsKey(StarlinkFieldExtractor.FIELD_STARLINK_ID));
    }

    @Test
    public void handlesLabelAndValueOnTheSameLineSeparatedByAColon() {
        String text = HtmlToVisibleText.convert("<html><body><div>KIT Number: KIT-777888</div></body></html>");
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields(STARLINK_URL, text);

        assertEquals("KIT-777888", result.fields.get(StarlinkFieldExtractor.FIELD_KIT_NUMBER));
    }

    @Test
    public void nullVisibleTextIsRejectedWithoutCrashing() {
        StarlinkFieldExtractor.Result result = StarlinkFieldExtractor.extractFields(STARLINK_URL, null);
        assertFalse(result.accepted);
        assertTrue(result.fields.isEmpty());
    }
}
