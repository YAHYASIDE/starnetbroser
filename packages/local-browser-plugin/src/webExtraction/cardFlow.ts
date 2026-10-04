/**
 * 💳 «أضف البطاقة» by itself (his choice: everything automatic in Starlink, the KAST card is kept
 * unfrozen): what each frame of a device's browser shows on the way to a saved card, and the one
 * tap for each step. The app (CardFillController.java) decides when a step runs - a frame only says
 * what it sees and acts when told:
 *   Billing «Payment Method» → «Edit» → the card form (filled by cardFill.ts) → «Save» → the card
 *   company's «Verify transaction» → «Email» → «Enter the code we sent to your email» → the code
 *   from no-reply's mail → «Submit» → Billing shows «VISA ending in ####».
 * Wording comes from his screenshots (English - every device's browser is switched to English).
 */

import { cardFieldKind } from "./cardFill";

export type CardError = "needs-verification" | "declined";

export interface CardSight {
  /** «Save» of the card form (enabled or not yet). */
  save: boolean;
  /** «How would you like to verify this transaction?» with an «Email» choice. */
  verifyChoice: boolean;
  /** The payment's code field («Enter the code we sent to your email»). */
  otp: boolean;
  /** Billing's «Payment Method» card with its «Edit» / «Add» button. */
  paymentEdit: boolean;
  /** The card on file now («VISA ending in 7408» → "7408"). */
  onFile: string | null;
  error: CardError | null;
}

const CLICKABLE = "button, [role='button'], input[type='submit'], input[type='button'], a";

function textOf(el: Element): string {
  const own = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (own) return own;
  return (el.getAttribute("aria-label") || (el as HTMLInputElement).value || "").trim();
}

function isHidden(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true;
    const style = (node as HTMLElement).style;
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  }
  return false;
}

export function isEnabled(el: Element): boolean {
  return !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true";
}

function clickables(root: ParentNode, pattern: RegExp): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE)).filter((el) => !isHidden(el) && pattern.test(textOf(el)));
}

function pageText(doc: Document): string {
  return (doc.body?.textContent || "").replace(/\s+/g, " ");
}

const SAVE = /^(save|save card|save payment method|حفظ|enregistrer)$/i;
const CANCEL = /^(cancel|إلغاء|annuler)$/i;

function hasCardFieldOrFrame(root: Element): boolean {
  if (root.querySelector("iframe")) return true;
  return Array.from(root.querySelectorAll("input, select")).some((el) => cardFieldKind(el) !== null);
}

/** The card form's «Save»: next to its «Cancel», in the same box as card fields (or the payment
 * company's frames that hold them) - never another page's «Save». */
export function findSaveButton(doc: Document): HTMLElement | null {
  for (const save of clickables(doc, SAVE)) {
    let box: Element | null = save.parentElement;
    for (let depth = 0; box && box !== doc.documentElement && depth < 8; depth++, box = box.parentElement) {
      if (clickables(box, CANCEL).length && hasCardFieldOrFrame(box)) return save;
    }
  }
  return null;
}

const VERIFY_QUESTION = /how would you like to verify|verify (this )?transaction|choose how to (receive|verify)|كيف تريد التحقق|تحقق من المعاملة/i;
const EMAIL_CHOICE = /^(e-?mail|par e-?mail|courriel|البريد الإلكتروني|البريد)$/i;

/** The «Email» choice of the card company's «Verify transaction» page. */
export function findEmailChoice(doc: Document): HTMLElement | null {
  if (!VERIFY_QUESTION.test(pageText(doc))) return null;
  const button = clickables(doc, EMAIL_CHOICE)[0];
  if (button) return button;
  // A radio list instead of buttons: the «Email» label.
  return Array.from(doc.querySelectorAll<HTMLElement>("label")).find((l) => !isHidden(l) && EMAIL_CHOICE.test(textOf(l))) ?? null;
}

const NEXT = /^(continue|next|send|send code|submit|متابعة|التالي|إرسال|continuer|envoyer)$/i;

/** After picking «Email» from a radio list, its «Continue». */
export function findContinueButton(doc: Document): HTMLElement | null {
  return clickables(doc, NEXT).find(isEnabled) ?? null;
}

// The page must be about a payment - Starlink's own sign-in code page is not this one.
const PAYMENT_PAGE = /transaction|payment|purchase|paiement|achat|card\s*[•·*]|المعاملة|الدفع/i;
const CODE_PAGE = /enter the code|code (we )?sent|verification code|one[- ]time|passcode|saisissez le code|أدخل الرمز|رمز التحقق/i;
const CODE_FIELD = /code|otp|pin|passcode|رمز/i;
const SUBMIT = /^(submit|verify|confirm|continue|valider|confirmer|تأكيد|تحقق|إرسال|متابعة)$/i;

/** The payment's code field and its «Submit». */
export function findOtpField(doc: Document): { input: HTMLInputElement; submit: HTMLElement | null } | null {
  const text = pageText(doc);
  if (!PAYMENT_PAGE.test(text) || !CODE_PAGE.test(text)) return null;
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("input")).filter((el) => {
    const type = (el.type || "text").toLowerCase();
    return ["text", "tel", "number", "password", ""].includes(type) && !isHidden(el) && cardFieldKind(el) === null;
  });
  const described = (el: HTMLInputElement) =>
    [el.getAttribute("autocomplete"), el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), ...Array.from(el.labels ?? []).map((l) => l.textContent)]
      .filter(Boolean)
      .join(" ");
  const input = inputs.find((el) => el.getAttribute("autocomplete") === "one-time-code" || CODE_FIELD.test(described(el))) ?? (inputs.length === 1 ? inputs[0] : undefined);
  if (!input) return null;
  return { input, submit: clickables(doc, SUBMIT)[0] ?? null };
}

/** Types the code like a person (real input events). */
export function typeCode(input: HTMLInputElement, code: string): boolean {
  input.focus();
  let typed = false;
  try {
    input.select();
    typed = input.ownerDocument.execCommand("insertText", false, code);
  } catch {
    typed = false;
  }
  if (!typed || input.value.replace(/\D/g, "") !== code) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, code);
    else input.value = code;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.value.replace(/\D/g, "") === code;
}

const PAYMENT_METHOD = /^(payment method|طريقة الدفع|moyen de paiement)$/i;
const EDIT = /^(edit|add|add payment method|تعديل|إضافة|modifier|ajouter)$/i;

/** Billing's «Payment Method» box → its «Edit» (or «Add» when there's no card yet). */
export function findPaymentEdit(doc: Document): HTMLElement | null {
  const titles = Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, span, div")).filter(
    (el) => el.children.length === 0 && PAYMENT_METHOD.test(textOf(el)),
  );
  for (const title of titles) {
    let box: Element | null = title.parentElement;
    for (let depth = 0; box && depth < 5; depth++, box = box.parentElement) {
      const edit = clickables(box, EDIT)[0];
      if (edit) return edit;
    }
  }
  return null;
}

/** What this frame shows now. */
export function cardSight(doc: Document): CardSight {
  const text = pageText(doc);
  const ending = text.match(/ending in\s*(\d{4})|تنتهي بـ?\s*(\d{4})/i);
  let error: CardError | null = null;
  if (/additional verification needed|additional authentication|تحقق إضافي/i.test(text)) error = "needs-verification";
  else if (/card (was )?declined|payment (was )?declined|transaction (was )?declined|رُفضت البطاقة|carte refus/i.test(text)) error = "declined";
  return {
    save: findSaveButton(doc) !== null,
    verifyChoice: findEmailChoice(doc) !== null,
    otp: findOtpField(doc) !== null,
    paymentEdit: findPaymentEdit(doc) !== null,
    onFile: ending ? (ending[1] ?? ending[2] ?? null) : null,
    error,
  };
}
