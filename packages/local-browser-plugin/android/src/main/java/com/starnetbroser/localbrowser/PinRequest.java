package com.starnetbroser.localbrowser;

/**
 * 📌 «تثبيت - لم يُسجَّل الشحن بعد» from a device's browser (the app side: lib/deviceNotes.ts
 * `applyBrowserPins`), and ⏳ «شحن بانتظار الفاتورة» (his Oct 19 2026 ask): the customer's price typed
 * right there, recorded by the app with a D that fills itself from the invoice (lib/awaitingBill.ts).
 * Pure, no android.* - JUnit: PinRequestTest.
 */
final class PinRequest {

    /** The purple note the app puts on the pinned device (the same text as BROWSER_PIN_NOTE). */
    static final String NOTE = "⏳ لم يُسجَّل الشحن بعد - الفوترة 0 حتى تنزل الفاتورة؛ سجّل المبلغ مع D";

    /** The key of the pin in the staged read (PendingSyncStore). */
    static final String FIELD = "pinRequest";

    /** The customer's currencies (the app's LedgerCurrency codes) and their names, in this order. */
    static final String[] CURRENCIES = {"MRU", "SIFA", "USD"};
    static final String[] CURRENCY_NAMES = {"أوقية", "سيفا", "دولار"};

    private PinRequest() {}

    /** The typed price: Arabic digits and thousands commas allowed; -1 when it isn't a price above 0. */
    static double parseAmount(String text) {
        if (text == null) return -1;
        StringBuilder out = new StringBuilder();
        for (char c : text.trim().toCharArray()) {
            if (c >= '\u0660' && c <= '\u0669') out.append((char) ('0' + (c - '\u0660')));
            else if (c >= '\u06F0' && c <= '\u06F9') out.append((char) ('0' + (c - '\u06F0')));
            else if (c == '\u066B' || c == '.') out.append('.');
            else if (c == ',' || c == '\u066C' || c == ' ') continue;
            else if (c >= '0' && c <= '9') out.append(c);
            else return -1;
        }
        try {
            double value = Double.parseDouble(out.toString());
            return value > 0 && !Double.isInfinite(value) ? value : -1;
        } catch (NumberFormatException notANumber) {
            return -1;
        }
    }

    /** A remembered currency, else the first (أوقية). */
    static int currencyIndex(String code) {
        for (int i = 0; i < CURRENCIES.length; i++) if (CURRENCIES[i].equals(code)) return i;
        return 0;
    }
}
