import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { keepCurrency } from "./repAccount";
import type { RepBookEntry } from "./repClients";
import { repPosition } from "./repPosition";
import type { Representative } from "./repStore";
import { repPositionDebtsReply, repPositionText } from "./telegramRepMessages";

// Fake data only.
const device = (id: string, clientId: string, representativeId = "r1") => ({ id, name: `جهاز ${id}`, clientId, representativeId }) as StarlinkAccountSummary;
const client = (id: string, extra = {}) => ({ id, name: `زبون ${id}`, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra });
let seq = 0;
function entry(kind: "debit" | "credit", amount: number, date: string, currency = "SIFA", extra: Partial<LedgerEntry> = {}): LedgerEntry {
  seq += 1;
  return { id: `e${seq}`, kind, amount, currency, note: "", email: "", date, createdAt: `${date}T10:00:00.000Z`, ...extra } as LedgerEntry;
}

const rep: Representative = {
  id: "r1",
  name: "حسين",
  commissionPercent: 50,
  createdAt: "",
  updatedAt: "",
  customersHidden: true,
  resetFrom: { date: "2026-10-07", at: "2026-10-07T08:00:00.000Z" },
};
const accounts = [device("d1", "c1"), device("d2", "c2"), device("d3", "c3")];
const clients: ClientStore = { c1: client("c1", { repSegments: [{ repId: "r1", from: "2026-01-01T00:00:00.000Z", carry: true }] }), c2: client("c2"), c3: client("c3") };
const ledgerStore: LedgerByAccount = {
  // before the reset: never shown
  d1: [entry("debit", 99000, "2026-09-01"), entry("debit", 13500, "2026-10-07")],
  d2: [entry("debit", 13500, "2026-10-07"), entry("credit", 3000, "2026-10-08")],
  d3: [entry("debit", 6000, "2026-10-07", "SIFA", { representativeId: "r1" })],
};
const book: RepBookEntry[] = [
  { id: "b1", repId: "r1", clientId: "c1", kind: "payment", amount: 50000, currency: "SIFA", date: "2026-09-02", createdAt: "2026-09-02T10:00:00.000Z" },
];
const input = { rep, clients, accounts, ledgerStore, book, invoices: [], settlements: [], convert: keepCurrency };

describe("⚖️ the rep's position - one way for his card and his money bot", () => {
  it("everything on his devices since the reset is his; nothing older", () => {
    const p = repPosition(input);
    expect(p.since).toBe("2026-10-07");
    expect(p.owed).toEqual({ SIFA: 13500 + 13500 - 3000 + 6000 });
    expect(p.net).toEqual({ SIFA: 30000 });
    expect(p.operations.map((o) => o.amount).sort((a, b) => a - b)).toEqual([-3000, 6000, 13500, 13500]);
    expect(p.operations).toHaveLength(4);
    // his book since the reset: the September payment is gone, the renewal on his customer is there
    expect(p.customers.map((r) => [r.clientId, r.book])).toEqual([["c1", { SIFA: 13500 }]]);
  });

  it("«📊 كشفي» says what he owes, not «متعادل»", () => {
    const text = repPositionText("حسين", repPosition(input), (id) => `جهاز ${id}`);
    expect(text).toContain("🔄 منذ 2026-10-07");
    expect(text).toContain("عليك عن أجهزتك: 30,000 سيفا");
    expect(text).toContain("الصافي: عليك 30,000 سيفا");
    expect(text).not.toContain("متعادل");
    expect(text).toContain("💵 جهاز d2: دفعت 3,000 سيفا");
    expect(text).not.toContain("99,000");
  });

  it("«💰 ديون زبائني»: his book, then what he owes us per device - since the reset", () => {
    const { text } = repPositionDebtsReply(repPosition(input), accounts, clients);
    expect(text).toContain("📒 زبائنك عليهم لك (دفترك): 13,500 سيفا");
    expect(text).toContain("🧾 عليك لنا عن أجهزتك: 30,000 سيفا");
    expect(text).toContain("• جهاز d2: 10,500 سيفا");
    expect(text).not.toContain("99,000");
  });
});
