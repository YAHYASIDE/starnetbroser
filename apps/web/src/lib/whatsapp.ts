/**
 * wa.me link building for the account card's "تواصل عبر واتساب" action. Deliberately pure/
 * framework-free (no window, no DOM) so the phone-number normalization and message wording are
 * directly testable.
 */

/** Strips everything but digits and a leading "00" international-dialing prefix - wa.me wants a
 * bare digit string with the country code, no "+", no "00", no spaces/dashes. Returns null for
 * anything too short to plausibly be a real number (an empty/placeholder phone field), so callers
 * can hide the WhatsApp action entirely rather than link to an unusable "wa.me/123". */
export function normalizePhoneForWhatsApp(phone: string | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 ? digits : null;
}

/** null when the account has no usable phone number - callers must hide the action, never link
 * to a broken wa.me URL. */
export function buildWhatsAppLink(phone: string | undefined, message?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The three canned messages the card's WhatsApp menu offers - kept together so their exact
 * wording is reviewable and testable in one place. */
export function buildExpiryReminderMessage(accountName: string): string {
  return `مرحبًا ${accountName}، نود تذكيرك بأن اشتراك Starlink الخاص بك سينتهي الليلة. يرجى التجديد لتفادي انقطاع الخدمة.\n\n- STAR NET`;
}

/** STAR NET's own payment-collection numbers (not customer data) - shown to the customer inside
 * the balance-reminder WhatsApp message so they know where to send payment. */
export function buildBalanceReminderMessage(accountName: string, balanceDue: string, currency: string): string {
  return (
    `مرحبًا ${accountName} 👋\n\n` +
    `نود إعلامك بأن لديك رصيدًا مستحقًا حاليًا بقيمة ${currency}${balanceDue}.\n` +
    `نرجو منك التكرم بتسديد المبلغ في أقرب وقت ممكن لتفادي انقطاع الخدمة.\n\n` +
    `يمكنكم الدفع عبر إحدى الوسائل التالية:\n` +
    `• بنكيلي / سداد / نيتا: 22227268\n` +
    `• أورانج موني: 74646158\n\n` +
    `شكرًا لتعاونكم معنا 🙏\n` +
    `- STAR NET`
  );
}
