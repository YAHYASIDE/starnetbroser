/**
 * 💳 Filling a payment-card form (Starlink's «إضافة طريقة دفع») with one of the operator's own
 * saved cards. The card fields are often inside the payment company's own frames (one frame per
 * field), so this runs in every frame (cardFillScript.ts) and fills whatever card fields that
 * frame has. Fields are recognised by their autocomplete hint, else by their wording (English,
 * Arabic, French) - never by guessing a field with no card wording.
 */

import { typeValue } from "./formInput";

export type CardFieldKind = "number" | "name" | "expiry" | "expMonth" | "expYear" | "cvc" | "postal" | "address" | "taxId";

export interface FillCard {
  number: string;
  name: string;
  /** "03" */
  expMonth: string;
  /** "30" */
  expYear: string;
  cvc: string;
  postal?: string;
  address?: string;
  /** DNI / RTN / Passport / tax id (some countries' Starlink payment form requires it). */
  taxId?: string;
}

const AUTOCOMPLETE: Record<string, CardFieldKind> = {
  "cc-number": "number",
  "cc-name": "name",
  "cc-exp": "expiry",
  "cc-exp-month": "expMonth",
  "cc-exp-year": "expYear",
  "cc-csc": "cvc",
  "postal-code": "postal",
  "address-line1": "address",
  "street-address": "address",
};

// Order matters: the first match wins (an expiry placeholder "MM/YY" before a plain number).
const WORDING: [CardFieldKind, RegExp][] = [
  ["cvc", /\b(cvc|cvv|csc|cvn)\b|security code|card code|رمز التحقق|رمز الأمان|cryptogramme/i],
  ["expMonth", /exp\w*[\s_-]*month|\bmonth\b|^mm$|الشهر$/i],
  ["expYear", /exp\w*[\s_-]*year|\byear\b|^yy(yy)?$|السنة$/i],
  ["expiry", /expir|exp[\s._-]*date|valid\s*thru|mm\s*\/\s*yy|شهر\s*\/\s*سنة|تاريخ الانتهاء|date d'expiration/i],
  ["number", /card[\s._-]*n(umber|o\b)|cardnumber|cc[\s._-]*num|رقم البطاقة|num[ée]ro de carte/i],
  ["name", /name on card|card\s*holder|cardholder|as it appears on|كما يظهر في البطاقة|اسم حامل البطاقة|titulaire|nom sur la carte/i],
  ["postal", /zip|postal|post code|الرمز البريدي|code postal/i],
  ["address", /billing address|address line|street|عنوان الفوترة|adresse/i],
  ["taxId", /\bdni\b|\brtn\b|passport|tax[\s._-]*id|\bcpf\b|\bcuit\b|\brut\b|c[eé]dula|documento|رقم الهوية|الهوية|الجواز|الرقم الضريبي/i],
];

function labelText(el: HTMLInputElement | HTMLSelectElement): string {
  const parts: string[] = [];
  const add = (v: string | null | undefined) => {
    if (v && v.trim()) parts.push(v.trim());
  };
  add(el.getAttribute("name"));
  add(el.id);
  add(el.getAttribute("placeholder"));
  add(el.getAttribute("aria-label"));
  add(el.getAttribute("data-elements-stable-field-name"));
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) for (const id of labelledBy.split(/\s+/)) add(el.ownerDocument.getElementById(id)?.textContent);
  if ("labels" in el && el.labels) for (const label of Array.from(el.labels)) add(label.textContent);
  return parts.join(" | ");
}

/** What card field this is, or null. A plain "name" / "123" with no card wording is not one. */
export function cardFieldKind(target: EventTarget | Element | null): CardFieldKind | null {
  if (!target || !(target instanceof Element)) return null;
  const tag = target.tagName;
  if (tag !== "INPUT" && tag !== "SELECT") return null;
  const el = target as HTMLInputElement | HTMLSelectElement;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (!["text", "tel", "number", "password", "search", ""].includes(type)) return null;
  }
  const auto = (el.getAttribute("autocomplete") || "").toLowerCase().trim().split(/\s+/).pop() || "";
  if (AUTOCOMPLETE[auto]) return AUTOCOMPLETE[auto]!;
  const text = labelText(el);
  for (const [kind, pattern] of WORDING) if (pattern.test(text)) return kind;
  // The card-number field's sample digits ("4444 3333 2222 1111", "1234 1234 1234 1234").
  if (/^\s*\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{2,4}\s*$/.test(el.getAttribute("placeholder") || "")) return "number";
  return null;
}

/** The card fields of this document. */
export function cardFields(doc: Document): { el: HTMLInputElement | HTMLSelectElement; kind: CardFieldKind }[] {
  const out: { el: HTMLInputElement | HTMLSelectElement; kind: CardFieldKind }[] = [];
  for (const el of Array.from(doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) {
    const kind = cardFieldKind(el);
    if (kind) out.push({ el, kind });
  }
  return out;
}

function valueFor(kind: CardFieldKind, card: FillCard, el: HTMLInputElement | HTMLSelectElement): string | undefined {
  const fourDigitYear = (el.getAttribute("placeholder") || "").toUpperCase().includes("YYYY") || Number(el.getAttribute("maxlength")) === 4;
  switch (kind) {
    case "number":
      return card.number;
    case "name":
      return card.name;
    case "expiry": {
      const max = Number(el.getAttribute("maxlength")) || 0;
      if (max === 4) return `${card.expMonth}${card.expYear}`;
      if (/\s\/\s/.test(el.getAttribute("placeholder") || "")) return `${card.expMonth} / ${card.expYear}`;
      return `${card.expMonth}/${card.expYear}`;
    }
    case "expMonth":
      return card.expMonth;
    case "expYear":
      return fourDigitYear ? `20${card.expYear}` : card.expYear;
    case "cvc":
      return card.cvc;
    case "postal":
      return card.postal || undefined;
    case "address":
      return card.address || undefined;
    case "taxId":
      return card.taxId || undefined;
  }
}

function pickOption(select: HTMLSelectElement, value: string): boolean {
  const wanted = [value, String(Number(value)), value.length === 2 ? `20${value}` : value];
  const option = Array.from(select.options).find((o) => wanted.includes(o.value.trim()) || wanted.includes(o.text.trim()));
  if (!option) return false;
  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Types the value the way a person would (frameworks and payment fields see real input events);
 * falls back to setting it directly. */
function typeInto(input: HTMLInputElement, value: string): boolean {
  // Set the value the way a keystroke would, so React re-validates and «Save» enables - a plain
  // value set leaves the form pristine and the button greyed out (see formInput.ts).
  typeValue(input, value);
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  const looksRight = (v: string) => (digitsOf(value) ? digitsOf(v) === digitsOf(value) : v.trim() === value.trim());
  return looksRight(input.value);
}

/** Fills this document's card fields; returns how many were filled. `onlyEmpty` = the second pass:
 * only fields that are (again) empty - typing the card number makes many forms clear the security
 * code a moment later while they check the card type, and a late field misses the first pass (his
 * Oct 2026 report «دايم خانة الكود لا تمتلئ»). */
export function fillCardFields(doc: Document, card: FillCard, onlyEmpty = false): number {
  let filled = 0;
  for (const { el, kind } of cardFields(doc)) {
    if (onlyEmpty && el.value.trim() !== "") continue;
    const value = valueFor(kind, card, el);
    if (!value) continue;
    if (el.tagName === "SELECT" ? pickOption(el as HTMLSelectElement, value) : typeInto(el as HTMLInputElement, value)) filled++;
  }
  return filled;
}
