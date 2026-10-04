import { describe, expect, it } from "vitest";
import { fillItems, luhnValid, maskedNumber, normalizeExpiry, removeCardFill, setCardFill, validateCardFill } from "./cardFill";

// Standard test card numbers and fake names only.
const VISA = "4111 1111 1111 1111";
const card = { id: "c1", last4: "1111", name: "KAST", createdAt: "x" };
const now = new Date("2026-10-04T10:00:00Z");

describe("card details for filling Starlink's card form", () => {
  it("checks the number (check digit, matching last 4), name, expiry and code", () => {
    const ok = validateCardFill({ number: VISA, holderName: "  DEMO   NAME ", expiry: "3/30", cvc: "123", postalCode: " 00000 " }, card, now);
    expect(ok).toEqual({ ok: true, data: { number: "4111111111111111", holderName: "DEMO NAME", expiry: "03/30", cvc: "123", postalCode: "00000", updatedAt: now.toISOString() } });
    expect(validateCardFill({ number: "4111 1111 1111 1112", holderName: "X", expiry: "03/30", cvc: "123" }, card).ok).toBe(false);
    expect(validateCardFill({ number: "5555 5555 5555 4444", holderName: "X", expiry: "03/30", cvc: "123" }, card)).toEqual({ ok: false, message: "آخر 4 أرقام لا توافق هذه البطاقة (1111)" });
    expect(validateCardFill({ number: VISA, holderName: " ", expiry: "03/30", cvc: "123" }, card).ok).toBe(false);
    expect(validateCardFill({ number: VISA, holderName: "X", expiry: "13/30", cvc: "123" }, card).ok).toBe(false);
    expect(validateCardFill({ number: VISA, holderName: "X", expiry: "03/30", cvc: "12" }, card).ok).toBe(false);
  });

  it("reads the expiry however it's typed", () => {
    expect(["03/30", "3/30", "0330", "03/2030", "03 / 30"].map(normalizeExpiry)).toEqual(["03/30", "03/30", "03/30", "03/30", "03/30"]);
    expect(normalizeExpiry("00/30")).toBeNull();
    expect(normalizeExpiry("3")).toBeNull();
  });

  it("luhn and the masked number", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(maskedNumber("4111111111111111")).toBe("•••• 1111");
  });

  it("the browser's list: only completed cards, label + what fills the page", () => {
    const made = validateCardFill({ number: VISA, holderName: "DEMO NAME", expiry: "03/30", cvc: "123" }, card, now);
    if (!made.ok) throw new Error(made.message);
    const book = setCardFill({}, "c1", made.data);
    const items = fillItems([card, { id: "c2", last4: "4444", name: "OTHER", createdAt: "x" }], book);
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("KAST •••• 1111 · 03/30");
    expect(JSON.parse(items[0]!.payload)).toEqual({ number: "4111111111111111", name: "DEMO NAME", expMonth: "03", expYear: "30", cvc: "123", postal: "", address: "", taxId: "" });
    expect(fillItems([card], removeCardFill(book, "c1"))).toEqual([]);
  });
});
