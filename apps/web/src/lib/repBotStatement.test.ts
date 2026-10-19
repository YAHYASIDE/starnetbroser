import { describe, expect, it } from "vitest";
import { botBalanceWords, botOperationIds, newBotOperations, newOperationsText, opSearchKey, repBotAccountPdf, repBotAccounts, repBotPages, repBotRemaining } from "./repBotStatement";
import { addRepLedgerEntry, createRepLedger, EMPTY_REP_LEDGER_BOOK, setRepLedgerFranc } from "./repLedgers";
import type { RepStatementRow } from "./repStore";
import type { RepWallet } from "./repWallets";

const now = new Date("2026-10-19T10:00:00.000Z");
const row = { type: "settlement" } as unknown as RepStatementRow;
const line = (key: string, date: string, amount: number, after: number, code = "SIFA") => ({ key, date, row, amount: { [code]: amount }, after: { [code]: after } });

const wallets: RepWallet[] = [
  { id: "SIFA", balance: { SIFA: -571464.55 }, lines: [line("w2", "2026-10-19", 81470.92, -571464.55), line("w1", "2026-10-18", -652935.47, -652935.47)] },
  { id: "profit", balance: { SIFA: 6445 }, lines: [line("p1", "2026-10-17", 6445, 6445)] },
  { id: "MRU", balance: { MRU: 0 }, lines: [] },
  { id: "USD", balance: { USD: 0 }, lines: [] },
];

function book() {
  const orange = createRepLedger(EMPTY_REP_LEDGER_BOOK, { repId: "r1", name: "ORANJ MONEY", kind: "free", currencies: ["SIFA"] }, now);
  if (!orange.ok) throw new Error(orange.message);
  const e1 = addRepLedgerEntry(orange.book, orange.ledger.id, { direction: "debit", amount: 1330.4, date: "2026-10-16", note: "سلفة" }, now);
  if (!e1.ok) throw new Error(e1.message);
  const travel = createRepLedger(e1.book, { repId: "r1", name: "توثيق الأجهزة", kind: "travel", currencies: ["SIFA"], opening: { direction: "credit", amount: 89000, date: "2026-10-01" } }, now);
  if (!travel.ok) throw new Error(travel.message);
  return travel.book;
}

describe("📊 «كشفي» in the money bot", () => {
  it("his accounts in the order of «حساباته», an empty other currency left out, named ones as shown", () => {
    const accounts = repBotAccounts(wallets, book(), "r1", () => "➕ له");
    expect(accounts.map((a) => [a.key, a.title])).toEqual([
      ["a0", "🟠 حساب شخصي"],
      ["a1", "💰 حساب الربح"],
      ["a2", "🟢 حساب الأوقية"],
      ["a3", "📒 ORANJ MONEY"],
      ["a4", "🛂 توثيق الأجهزة"],
    ]);
    // ORANJ MONEY is in فرنك: shown ×5, added up in سيفا.
    expect(accounts[3]!.balance).toEqual({ FRANC: -6652 });
    expect(accounts[3]!.stored).toEqual({ SIFA: -1330.4 });
    expect(botBalanceWords(accounts[3]!.balance)).toBe("عليك 6,652 فرنك FCFA");
  });

  it("what is left: after his profit only, and after everything", () => {
    const { afterProfit, afterAll } = repBotRemaining(repBotAccounts(wallets, book(), "r1", () => "x"));
    expect(afterProfit).toEqual({ SIFA: -565019.55, MRU: 0 });
    expect(afterAll).toEqual({ SIFA: -477349.95, MRU: 0 });
  });

  it("summary with a button per account, pages of 10 with older / newer, PDF and back", () => {
    const many: RepWallet[] = [{ ...wallets[0]!, lines: Array.from({ length: 23 }, (_, i) => line(`k${i}`, `2026-10-${String(28 - i).padStart(2, "0")}`, -100, -100 * (i + 1))) }];
    const pages = repBotPages("الحسين", repBotAccounts(many, EMPTY_REP_LEDGER_BOOK, "r1", () => "📡 تجديد عليه · جهاز"), "2026-10-01");
    expect(pages.summary).toContain("📊 كشف حسابك يا الحسين");
    expect(pages.summary).toContain("⚖️ الباقي بعد خصم ربحك فقط:");
    expect(pages.summary).toContain("⚖️ الباقي بعد خصم كل شيء:");
    const kb = JSON.parse(pages.summaryKb).inline_keyboard as { text: string; callback_data: string }[][];
    expect(kb[0]![0]).toEqual({ text: "🟠 حساب شخصي · عليك 571,464.55 سيفا", callback_data: "ks:a0:0" });
    expect(kb.at(-1)![0]!.callback_data).toBe("ks:s");
    expect(Object.keys(pages.pages).filter((k) => /^ks:a0:\d$/.test(k))).toEqual(["ks:a0:0", "ks:a0:1", "ks:a0:2"]);
    expect(pages.pages["ks:a0:2"]).toContain("العمليات 21-23 من 23");
    const middle = JSON.parse(pages.pages["ks:a0:1#kb"]!).inline_keyboard.flat().map((b: { callback_data: string }) => b.callback_data);
    expect(middle).toEqual(["ks:a0:2", "ks:a0:0", "kp:a0", "ks:l"]);
    expect(pages.pages["ks:l"]).toBe(pages.summary);
  });

  it("🔎 the search index finds an amount however typed, a date, a word", () => {
    const { ops } = repBotPages("x", repBotAccounts(wallets, book(), "r1", () => "➕ له · استلمت منه نقدًا"));
    const find = (q: string) => ops.split("\n").filter((r) => opSearchKey(q).split(" ").every((w) => r.split("\t")[0]!.includes(w))).map((r) => r.split("\t")[1]);
    expect(find("81,470.92")).toHaveLength(1);
    expect(find("١٧/١٠")[0]).toContain("💰 حساب الربح");
    expect(find("سلفة")[0]).toContain("ORANJ MONEY");
    expect(find("سلفة")[0]).toContain("فرنك FCFA");
    expect(find("دين 16/10")).toHaveLength(1);
    expect(opSearchKey("أوقية ٥,٠٠٠")).toBe("اوقيه 5000");
  });

  it("🔔 new operations: nothing the first time, then only the new ones", () => {
    const accounts = repBotAccounts(wallets, book(), "r1", () => "➕ له");
    expect(newBotOperations(accounts, null)).toEqual([]);
    const seen = botOperationIds(accounts).filter((id) => id !== "SIFA:w2");
    const fresh = newBotOperations(accounts, seen);
    expect(fresh.map((f) => f.line.id)).toEqual(["SIFA:w2"]);
    expect(newOperationsText(fresh)).toBe("🔔 عملية جديدة في حسابك\n\n🟠 حساب شخصي\n19/10 ➕ له: +81,470.92 سيفا\nرصيده بعدها: عليك 571,464.55 سيفا");
  });

  it("📄 one account as a PDF", () => {
    const b = setRepLedgerFranc(book(), book().ledgers[0]!.id, true);
    const doc = repBotAccountPdf("الحسين", repBotAccounts([], b, "r1", () => "")[0]!, "2026-10-01");
    expect(doc.title).toBe("كشف 📒 ORANJ MONEY");
    expect(doc.rows).toEqual([["2026-10-16", "➖ عليه · سلفة", "-6,652 فرنك FCFA", "عليك 6,652 فرنك FCFA"]]);
  });
});
