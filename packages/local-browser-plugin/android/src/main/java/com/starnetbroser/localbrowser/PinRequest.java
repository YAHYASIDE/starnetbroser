package com.starnetbroser.localbrowser;

/**
 * 📌 «تثبيت - لم يُسجَّل الشحن بعد» from a device's browser (the app side: lib/deviceNotes.ts
 * `applyBrowserPins`). Pure, no android.* - JUnit: PinRequestTest.
 */
final class PinRequest {

    /** The purple note the app puts on the pinned device (the same text as BROWSER_PIN_NOTE). */
    static final String NOTE = "⏳ لم يُسجَّل الشحن بعد - الفوترة 0 حتى تنزل الفاتورة؛ سجّل المبلغ مع D";

    /** The key of the pin in the staged read (PendingSyncStore). */
    static final String FIELD = "pinRequest";

    private PinRequest() {}
}
