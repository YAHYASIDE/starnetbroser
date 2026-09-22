/**
 * Country -> currency lookup for the "إضافة عملة جديدة" form (Settings -> العملات وأسعار الصرف).
 * Picking a country auto-fills its currency's code/name/symbol so the operator only has to type
 * the exchange rate - this is display data only, never a source of truth for rates (those always
 * come from the operator, see currencyStore.ts).
 */

export interface CountryCurrencyOption {
  /** Arabic country name shown in the picker. */
  country: string;
  /** ISO 4217 code, uppercase. */
  code: string;
  /** Arabic currency name, stored as Currency.name. */
  name: string;
  symbol: string;
}

export const COUNTRY_CURRENCIES: CountryCurrencyOption[] = [
  { country: "موريتانيا", code: "MRU", name: "أوقية موريتانية", symbol: "MRU" },
  { country: "المغرب", code: "MAD", name: "درهم مغربي", symbol: "MAD" },
  { country: "الجزائر", code: "DZD", name: "دينار جزائري", symbol: "DZD" },
  { country: "تونس", code: "TND", name: "دينار تونسي", symbol: "TND" },
  { country: "ليبيا", code: "LYD", name: "دينار ليبي", symbol: "LYD" },
  { country: "مصر", code: "EGP", name: "جنيه مصري", symbol: "EGP" },
  { country: "السودان", code: "SDG", name: "جنيه سوداني", symbol: "SDG" },
  { country: "السنغال", code: "XOF", name: "فرنك غرب إفريقي", symbol: "XOF" },
  { country: "مالي", code: "XOF", name: "فرنك غرب إفريقي", symbol: "XOF" },
  { country: "ساحل العاج", code: "XOF", name: "فرنك غرب إفريقي", symbol: "XOF" },
  { country: "غينيا", code: "GNF", name: "فرنك غيني", symbol: "GNF" },
  { country: "نيجيريا", code: "NGN", name: "نايرا نيجيرية", symbol: "NGN" },
  { country: "غانا", code: "GHS", name: "سيدي غاني", symbol: "GHS" },
  { country: "المملكة العربية السعودية", code: "SAR", name: "ريال سعودي", symbol: "SAR" },
  { country: "الإمارات العربية المتحدة", code: "AED", name: "درهم إماراتي", symbol: "AED" },
  { country: "قطر", code: "QAR", name: "ريال قطري", symbol: "QAR" },
  { country: "الكويت", code: "KWD", name: "دينار كويتي", symbol: "KWD" },
  { country: "البحرين", code: "BHD", name: "دينار بحريني", symbol: "BHD" },
  { country: "عُمان", code: "OMR", name: "ريال عماني", symbol: "OMR" },
  { country: "الأردن", code: "JOD", name: "دينار أردني", symbol: "JOD" },
  { country: "لبنان", code: "LBP", name: "ليرة لبنانية", symbol: "LBP" },
  { country: "العراق", code: "IQD", name: "دينار عراقي", symbol: "IQD" },
  { country: "سوريا", code: "SYP", name: "ليرة سورية", symbol: "SYP" },
  { country: "اليمن", code: "YER", name: "ريال يمني", symbol: "YER" },
  { country: "فلسطين (شيكل)", code: "ILS", name: "شيكل جديد", symbol: "₪" },
  { country: "تركيا", code: "TRY", name: "ليرة تركية", symbol: "TRY" },
  { country: "إيران", code: "IRR", name: "ريال إيراني", symbol: "IRR" },
  { country: "الولايات المتحدة الأمريكية", code: "USD", name: "دولار أمريكي", symbol: "$" },
  { country: "المملكة المتحدة", code: "GBP", name: "جنيه إسترليني", symbol: "£" },
  { country: "سويسرا", code: "CHF", name: "فرنك سويسري", symbol: "CHF" },
  { country: "كندا", code: "CAD", name: "دولار كندي", symbol: "CAD" },
  { country: "أستراليا", code: "AUD", name: "دولار أسترالي", symbol: "AUD" },
  { country: "الصين", code: "CNY", name: "يوان صيني", symbol: "CNY" },
  { country: "اليابان", code: "JPY", name: "ين ياباني", symbol: "¥" },
  { country: "الهند", code: "INR", name: "روبية هندية", symbol: "₹" },
  { country: "باكستان", code: "PKR", name: "روبية باكستانية", symbol: "PKR" },
  { country: "روسيا", code: "RUB", name: "روبل روسي", symbol: "RUB" },
  { country: "ألمانيا (يورو)", code: "EUR", name: "يورو", symbol: "€" },
  { country: "فرنسا (يورو)", code: "EUR", name: "يورو", symbol: "€" },
  { country: "إسبانيا (يورو)", code: "EUR", name: "يورو", symbol: "€" },
  { country: "إيطاليا (يورو)", code: "EUR", name: "يورو", symbol: "€" },
];
