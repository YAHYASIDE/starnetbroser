import { describe, expect, it } from "vitest";
import { checkReceiptAmount, findReceiptUse, parseReceipt, receiptAmountLabel, receiptDateLabel, receiptIsOld, receiptKeys, registerReceipt } from "./receiptCheck";

// Fake receipts only - made-up numbers and references, laid out the way the phone's reader returns them.
const TWO_COLUMNS = ["Transfert d'argent réussi !", "Bénéficiaire", "70000001", "Montant", "50 000 CFA", "Total", "50 000 CFA", "Expéditeur", "70000002", "Date", "01 11 2026 à 09:30", "Référence", "PP261101.0930.B1234", "5"].join("\n");

describe("🧾 reading a transfer receipt (his Nov 7 2026 ask)", () => {
  it("a two-column receipt: the reference (with its broken last digit), the amount and the date", () => {
    expect(parseReceipt(TWO_COLUMNS)).toEqual({ ref: "PP261101.0930.B12345", amount: 50000, unit: "CFA", at: "2026-11-01T09:30" });
  });

  it("label and value on one line; a digits-only reference; أوقية and Arabic", () => {
    expect(parseReceipt("Référence : PP261101.0930.B12345\nMontant: 10 000 FCFA").ref).toBe("PP261101.0930.B12345");
    expect(parseReceipt("Paiement effectué\nID Transaction: 0012345678901\nMontant: 3 200 MRU\n2026-11-02 14:05")).toEqual({ ref: "0012345678901", amount: 3200, unit: "MRU", at: "2026-11-02T14:05" });
    expect(parseReceipt("تم التحويل\nالمبلغ 1500 أوقية\nرقم العملية: TX99887766\n٠٢/١١/٢٠٢٦")).toEqual({ ref: "TX99887766", amount: 1500, unit: "MRU", at: "2026-11-02" });
  });

  it("a receipt sheet over the wallet: the balance above it is never the amount (his Nov 10 2026 report)", () => {
    // the phone reads the wallet's balance first, then the sheet's labels column, then its values column
    const overWallet = ["Simple", "72 ** ** 36", "111 163 CFA", "Transfert d'argent réussi !", "Bénéficiaire", "Montant", "Total", "@shop.example", "67 500 CFA", "67 500 CFA", "Expéditeur", "70000002", "Date", "10 11 2026 à 13:14", "Référence", "PP261110.1314.B00001", "Nouveau solde"].join("\n");
    expect(parseReceipt(overWallet)).toMatchObject({ amount: 67500, unit: "CFA", ref: "PP261110.1314.B00001" });
    expect(checkReceiptAmount(parseReceipt(overWallet), 13500, "SIFA")).toBe("ok");
    // one value only, and a «Nouveau solde» amount printed: the solde is skipped
    expect(parseReceipt("Montant\nNouveau solde 43 663 CFA\n20 000 CFA").amount).toBe(20000);
    expect(parseReceipt("Solde: 90 000 CFA\nTransfert 15 000 CFA")).toMatchObject({ amount: 15000 });
  });

  it("a phone number, a date or a year is never taken for the reference; nothing readable → nothing", () => {
    expect(parseReceipt("Bénéficiaire 70000001\nDate 01 11 2026\nMontant 5 000 CFA").ref).toBeUndefined();
    expect(parseReceipt("photo floue")).toEqual({});
  });

  it("the amount against what he wrote: 1 سيفا = 5 فرنك", () => {
    const read = { amount: 75000, unit: "CFA" as const };
    expect(checkReceiptAmount(read, 15000, "SIFA")).toBe("ok");
    expect(checkReceiptAmount(read, 75000, "SIFA")).toBe("mismatch");
    expect(checkReceiptAmount({ amount: 3200, unit: "MRU" }, 3200, "MRU")).toBe("ok");
    expect(checkReceiptAmount({ amount: 3200, unit: "MRU" }, 3000, "MRU")).toBe("mismatch");
    expect(checkReceiptAmount({ amount: 75000 }, 15000, "SIFA")).toBe("ok");
    expect(checkReceiptAmount({}, 15000, "SIFA")).toBe("unknown");
    expect(receiptAmountLabel(read)).toBe("75,000 CFA = 15,000 سيفا");
  });

  it("a receipt more than a day older than the request is flagged", () => {
    expect(receiptIsOld({ at: "2026-11-05T17:15" }, new Date("2026-11-07T09:50").toISOString())).toBe(true);
    expect(receiptIsOld({ at: "2026-11-07T08:00" }, new Date("2026-11-07T09:50").toISOString())).toBe(false);
    expect(receiptIsOld({ at: "2026-11-06" }, new Date("2026-11-07T09:50").toISOString())).toBe(false);
    expect(receiptIsOld({}, new Date().toISOString())).toBe(false);
    expect(receiptDateLabel("2026-11-05T17:15")).toBe("05/11 17:15");
  });

  it("⛔ the same reference or the same picture twice - a rejected request frees it", () => {
    const keys = receiptKeys({ ref: "PP1" }, "h1");
    expect(keys).toEqual(["ref:PP1", "img:h1"]);
    const none = () => false;
    let reg = registerReceipt({}, keys, { requestId: "r1", repId: "rep", at: "t1" }, none);
    expect(findReceiptUse(reg, keys, "r1", none)).toBeNull();
    // another request with the same picture but no reference read
    expect(findReceiptUse(reg, receiptKeys({}, "h1"), "r2", none)).toEqual({ key: "img:h1", use: { requestId: "r1", repId: "rep", at: "t1" } });
    // registering r2 keeps r1 as the first use
    reg = registerReceipt(reg, receiptKeys({ ref: "PP1" }, undefined), { requestId: "r2", repId: "rep", at: "t2" }, none);
    expect(reg["ref:PP1"]!.requestId).toBe("r1");
    // r1 rejected: the receipt is free for r2
    const rejected = (id: string) => id === "r1";
    expect(findReceiptUse(reg, ["ref:PP1"], "r2", rejected)).toBeNull();
    expect(registerReceipt(reg, ["ref:PP1"], { requestId: "r2", repId: "rep", at: "t2" }, rejected)["ref:PP1"]!.requestId).toBe("r2");
  });
});
