/**
 * Country dial-code picker for the account phone field (AccountDialog.tsx) - the operator picks a
 * country from a plain list (no free-text country search needed, unlike countryCurrencies.ts)
 * and types only the local number; the dial code is prefixed automatically. Mauritania is always
 * first/default (this business's home country), followed by Mali, Algeria and Niger by explicit
 * operator request, then the rest of the region.
 */

export interface PhoneCountryCode {
  /** Arabic country name shown in the picker. */
  country: string;
  /** E.164 dial code, always starting with "+". */
  dialCode: string;
}

// Deliberately no 1-digit dial codes (e.g. "+1") - splitPhoneNumber below matches the LONGEST
// known prefix first, but a 1-digit code could still wrongly swallow the first digit of a legacy
// phone number that was saved without any country code at all (pre-existing accounts, back when
// the field was free text). Every code here is 2-3 digits, which keeps that fallback safe.
export const PHONE_COUNTRY_CODES: PhoneCountryCode[] = [
  { country: "موريتانيا", dialCode: "+222" },
  { country: "مالي", dialCode: "+223" },
  { country: "الجزائر", dialCode: "+213" },
  { country: "النيجر", dialCode: "+227" },
  { country: "السنغال", dialCode: "+221" },
  { country: "المغرب", dialCode: "+212" },
  { country: "تونس", dialCode: "+216" },
  { country: "ليبيا", dialCode: "+218" },
  { country: "غينيا", dialCode: "+224" },
  { country: "غينيا بيساو", dialCode: "+245" },
  { country: "ساحل العاج", dialCode: "+225" },
  { country: "بوركينا فاسو", dialCode: "+226" },
  { country: "تشاد", dialCode: "+235" },
  { country: "غامبيا", dialCode: "+220" },
  { country: "غانا", dialCode: "+233" },
  { country: "نيجيريا", dialCode: "+234" },
  { country: "سيراليون", dialCode: "+232" },
  { country: "ليبيريا", dialCode: "+231" },
  { country: "مصر", dialCode: "+20" },
  { country: "السودان", dialCode: "+249" },
  { country: "فرنسا", dialCode: "+33" },
  { country: "إسبانيا", dialCode: "+34" },
  { country: "السعودية", dialCode: "+966" },
  { country: "الإمارات", dialCode: "+971" },
];

export const DEFAULT_PHONE_COUNTRY_CODE: PhoneCountryCode = PHONE_COUNTRY_CODES[0];

/**
 * Splits a stored `account.phone` (digits only, country code included, no "+" - the shape
 * normalizePhoneForWhatsApp/buildWhatsAppLink in whatsapp.ts expect) back into a dial code for the
 * picker plus the local number for the plain input. Matches the LONGEST known dial code first, so
 * e.g. "+22" never wrongly grabs a prefix of "+222". A phone with no recognizable/known prefix -
 * including every pre-existing account saved before this picker existed, when it was typed as a
 * bare local number - falls back to the default country (Mauritania) with the whole thing treated
 * as the local number, never dropped.
 */
export function splitPhoneNumber(phone: string | undefined): { dialCode: string; localNumber: string } {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return { dialCode: DEFAULT_PHONE_COUNTRY_CODE.dialCode, localNumber: "" };

  const byLongestCode = [...PHONE_COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const entry of byLongestCode) {
    const codeDigits = entry.dialCode.slice(1);
    if (digits.startsWith(codeDigits)) {
      return { dialCode: entry.dialCode, localNumber: digits.slice(codeDigits.length) };
    }
  }
  return { dialCode: DEFAULT_PHONE_COUNTRY_CODE.dialCode, localNumber: digits };
}

/** The inverse of splitPhoneNumber - builds the flat digits-only string account.phone stores.
 * Returns "" when there's no local number yet, so an account with no phone entered still saves as
 * an empty/absent phone rather than a bare, unusable country code. */
export function combinePhoneNumber(dialCode: string, localNumber: string): string {
  const digits = localNumber.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${dialCode.slice(1)}${digits}`;
}
