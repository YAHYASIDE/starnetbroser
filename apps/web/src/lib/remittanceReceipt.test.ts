import { describe, expect, it } from "vitest";
import { buildRemittanceReceipt, rateLine, remittanceNumber } from "./remittanceReceipt";
import { addRemittancePayment, createRemittance, deleteRemittancePayment, rateFromQuote, remittanceRemaining, updateRemittance, type RemittanceInput } from "./remittances";

// His real example, fake names: 50,000 فرانك in on أورانج (10,000 سيفا) at 3600 → 36,000 أوقية out of بنكيلي.
const RATES = { USD: 1, MRU: 430, SIFA: 120 };
const NOW = new Date("2026-10-10T12:00:00Z");
const input = (o: Partial<RemittanceInput> = {}): RemittanceInput => ({
  date: "2026-10-10",
  client: "زبون تجريبي",
  beneficiary: "مستفيد تجريبي",
  beneficiaryNumber: "40000009",
  inAccountId: "orange",
  inCurrency: "SIFA",
  amount: 10000,
  commissionMode: "fixed",
  commissionValue: 0,
  commissionWho: "onTop",
  outAccountId: "bankily",
  outCurrency: "MRU",
  rate: rateFromQuote(3600, "SIFA", "MRU"),
  rates: RATES,
  ...o,
});
const places = { in: { name: "أورانج موني (مالي)", franc: true }, out: { name: "بنكيلي" }, of: (id: string) => (id === "cash" ? { name: "الكاش" } : { name: id }) };

describe("🧾 وصل حوالة", () => {
  it("what the customer sees: amounts in his units, the agreed rate - never the profit", () => {
    const r = createRemittance([], input(), NOW);
    if (!r.ok) throw new Error();
    const doc = buildRemittanceReceipt(r.remittance, places);
    expect(doc.title).toBe("وصل حوالة");
    expect(doc.partyName).toBe("زبون تجريبي");
    expect(doc.summary.map((s) => s.value)).toEqual(["36,000 أوقية", "50,000 فرانك", "مدفوعة بالكامل ✓"]);
    expect(doc.rows).toContainEqual(["السعر", "1,000 سيفا = 3,600 أوقية"]);
    expect(doc.rows).toContainEqual(["استلمنا عبر", "أورانج موني (مالي)"]);
    expect(JSON.stringify(doc)).not.toContain("ربح");
    expect(remittanceNumber(r.remittance)).toMatch(/^H-20261010-[0-9A-Z]{4}$/);
  });

  it("an unpaid part shows as «الباقي عليه», with each later payment", () => {
    const r = createRemittance([], input({ paidNow: 6000 }), NOW);
    if (!r.ok) throw new Error();
    const p = addRemittancePayment(r.list, r.remittance.id, { amount: 1000, date: "2026-10-12", accountId: "cash" }, NOW);
    if (!p.ok) throw new Error();
    const doc = buildRemittanceReceipt(p.list[0]!, places);
    expect(doc.summary[2]).toEqual({ label: "الباقي عليه", value: "15,000 فرانك", tone: "due" });
    expect(doc.rows.some((row) => row[0]!.includes("دفعة") && row[1]!.includes("5,000 فرانك (الكاش)"))).toBe(true);
  });

  it("rate line for dollars and for one currency", () => {
    expect(rateLine({ rate: 1 / 430, inCurrency: "MRU", outCurrency: "USD" })).toBe("1 دولار = 430 أوقية");
    expect(rateLine({ rate: 1, inCurrency: "MRU", outCurrency: "MRU" })).toBe("");
  });
});

describe("✎ editing a transfer", () => {
  it("recomputes from the new figures, keeps its id, creation and payments", () => {
    const r = createRemittance([], input({ paidNow: 5000 }), NOW);
    if (!r.ok) throw new Error();
    const p = addRemittancePayment(r.list, r.remittance.id, { amount: 2000, date: "2026-10-11", accountId: "cash" }, NOW);
    if (!p.ok) throw new Error();
    const e = updateRemittance(p.list, r.remittance.id, input({ paidNow: 5000, rate: rateFromQuote(3500, "SIFA", "MRU") }));
    if (!e.ok) throw new Error(e.message);
    expect(e.remittance).toMatchObject({ id: r.remittance.id, createdAt: r.remittance.createdAt, sent: 35000 });
    expect(e.remittance.payments).toHaveLength(1);
    expect(remittanceRemaining(e.remittance)).toBe(3000);
  });

  it("refuses a total below what was already paid, or a new received currency while payments exist", () => {
    const r = createRemittance([], input({ paidNow: 5000 }), NOW);
    if (!r.ok) throw new Error();
    const p = addRemittancePayment(r.list, r.remittance.id, { amount: 4000, date: "2026-10-11", accountId: "cash" }, NOW);
    if (!p.ok) throw new Error();
    expect(updateRemittance(p.list, r.remittance.id, input({ amount: 6000, paidNow: 5000 }))).toMatchObject({ ok: false });
    expect(updateRemittance(p.list, r.remittance.id, input({ inAccountId: "cash", inCurrency: "MRU", amount: 9000, paidNow: 1000 }))).toMatchObject({ ok: false });
    expect(deleteRemittancePayment(p.list, r.remittance.id, p.payment.id)[0]!.payments).toEqual([]);
  });
});
