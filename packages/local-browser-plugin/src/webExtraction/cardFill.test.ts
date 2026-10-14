// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cardFieldKind, cardFields, fillCardFields, type FillCard } from "./cardFill";

// A test card number (Visa test digits) and fake data only.
const CARD: FillCard = { number: "4111111111111111", name: "DEMO NAME", expMonth: "03", expYear: "30", cvc: "123", postal: "00000", address: "DEMO STREET", taxId: "DEMOTAX123" };

function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("cardFieldKind", () => {
  it("reads Starlink's Arabic card form (labels and placeholders)", () => {
    const doc = page(`
      <input id="n" placeholder="الاسم (كما يظهر في البطاقة)">
      <label for="c">رقم البطاقة</label><input id="c" placeholder="4444 3333 2222 1111">
      <label for="e">شهر/سنة</label><input id="e" placeholder="03/30">
      <label for="v">رمز التحقق من البطاقة</label><input id="v" placeholder="123">
      <input id="z" placeholder="الرمز البريدي لعنوان الفوترة (اختياري)">
      <input id="other" placeholder="البحث برقم الفاتورة أو برقم الطلب">`);
    expect(cardFields(doc).map((f) => [f.el.id, f.kind])).toEqual([
      ["n", "name"],
      ["c", "number"],
      ["e", "expiry"],
      ["v", "cvc"],
      ["z", "postal"],
    ]);
  });

  it("autocomplete hints and English wording (payment-company frames)", () => {
    page(`<input id="a" autocomplete="cc-number"><input id="b" name="cardnumber"><input id="c" aria-label="Expiration date MM / YY"><input id="d" name="cvc"><input id="e" autocomplete="billing postal-code">`);
    expect(["a", "b", "c", "d", "e"].map((id) => cardFieldKind(document.getElementById(id)))).toEqual(["number", "number", "expiry", "cvc", "postal"]);
  });

  it("a plain name / email / password field is not a card field", () => {
    page(`<input id="a" name="name"><input id="b" type="email" autocomplete="cc-number"><input id="c" type="password" name="password"><input id="d" type="checkbox" name="cvc">`);
    expect(["a", "b", "c", "d"].map((id) => cardFieldKind(document.getElementById(id)))).toEqual([null, null, null, null]);
  });
});

describe("fillCardFields", () => {
  it("fills every card field of the frame with real input events", () => {
    const doc = page(`
      <input id="n" placeholder="الاسم (كما يظهر في البطاقة)">
      <input id="c" autocomplete="cc-number">
      <input id="e" autocomplete="cc-exp" placeholder="MM / YY">
      <input id="v" autocomplete="cc-csc">
      <input id="z" autocomplete="postal-code">`);
    const seen: string[] = [];
    doc.getElementById("c")!.addEventListener("input", () => seen.push("input"));
    doc.getElementById("c")!.addEventListener("change", () => seen.push("change"));
    expect(fillCardFields(doc, CARD)).toBe(5);
    const v = (id: string) => (doc.getElementById(id) as HTMLInputElement).value;
    expect([v("n"), v("c"), v("e"), v("v"), v("z")]).toEqual(["DEMO NAME", "4111111111111111", "03 / 30", "123", "00000"]);
    expect(seen).toContain("input");
    expect(seen).toContain("change");
  });

  it("the second pass refills only what the form emptied again (the CVC cleared after the number)", () => {
    const doc = page(`
      <input id="c" autocomplete="cc-number">
      <input id="v" placeholder="CVC">
      <input id="e" placeholder="MM / YY">`);
    expect(fillCardFields(doc, CARD)).toBe(3);
    // The form checks the card type and empties the security code.
    (doc.getElementById("v") as HTMLInputElement).value = "";
    const numberInputs: string[] = [];
    doc.getElementById("c")!.addEventListener("input", () => numberInputs.push("x"));
    expect(fillCardFields(doc, CARD, true)).toBe(1);
    expect((doc.getElementById("v") as HTMLInputElement).value).toBe("123");
    expect(numberInputs).toEqual([]); // the number wasn't typed again
    expect(fillCardFields(doc, CARD, true)).toBe(0);
  });

  it("separate month / year selects, and a 4-digit year", () => {
    const doc = page(`
      <select id="m" autocomplete="cc-exp-month"><option value="">--</option><option value="3">03</option></select>
      <input id="y" autocomplete="cc-exp-year" placeholder="YYYY" maxlength="4">`);
    expect(fillCardFields(doc, CARD)).toBe(2);
    expect((doc.getElementById("m") as HTMLSelectElement).value).toBe("3");
    expect((doc.getElementById("y") as HTMLInputElement).value).toBe("2030");
  });

  it("a frame with only the number field fills only it; an empty optional value is skipped", () => {
    const doc = page(`<input id="c" name="cardnumber"><input id="z" autocomplete="postal-code">`);
    expect(fillCardFields(doc, { ...CARD, postal: "" })).toBe(1);
    expect((doc.getElementById("z") as HTMLInputElement).value).toBe("");
  });

  it("fills a «DNI / RTN / Passport» tax-id field when the form requires it", () => {
    const doc = page(`<input id="t" placeholder="DNI / RTN / Passport"><input id="other" placeholder="Search by name">`);
    expect(cardFields(doc).map((f) => [f.el.id, f.kind])).toEqual([["t", "taxId"]]);
    expect(fillCardFields(doc, CARD)).toBe(1);
    expect((document.getElementById("t") as HTMLInputElement).value).toBe("DEMOTAX123");
  });
});
