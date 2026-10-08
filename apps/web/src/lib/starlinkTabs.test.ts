import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { cardDeviceRows } from "./cardDevices";
import type { LedgerEntry } from "./ledgerStore";
import type { OpenShipmentDebt } from "./starlinkDebt";
import { debtRepId, isStarlinkTab, splitDebtsByRep } from "./starlinkTabs";

const debt = (id: string, accountId: string, costUsd: number, representativeId?: string): OpenShipmentDebt => ({
  accountId,
  costUsd,
  entry: { id, kind: "debit", amount: 1, currency: "USD", note: "", email: "", date: "2026-10-01", createdAt: "2026-10-01T00:00:00.000Z", ...(representativeId ? { representativeId } : {}) } as LedgerEntry,
});

describe("starlinkTabs", () => {
  it("knows its four tabs", () => {
    expect(isStarlinkTab("reps")).toBe(true);
    expect(isStarlinkTab("other")).toBe(false);
  });

  it("puts each rep's D's on their own, his own apart", () => {
    const accounts: Record<string, { representativeId?: string }> = { a: {}, b: { representativeId: "r2" }, c: {} };
    const names: Record<string, string> = { r1: "حسين", r2: "أحمد" };
    const { mine, reps } = splitDebtsByRep(
      [debt("1", "a", 10), debt("2", "b", 20), debt("3", "c", 5, "r1"), debt("4", "b", 7)],
      (id) => accounts[id],
      (id) => names[id] ?? id,
    );
    expect(mine.map((d) => d.entry.id)).toEqual(["1"]);
    expect(reps.map((g) => [g.repId, g.debts.map((d) => d.entry.id), g.totalUsd])).toEqual([
      ["r2", ["2", "4"], 27],
      ["r1", ["3"], 5],
    ]);
    expect(debtRepId(debt("5", "a", 1, "r1"), { representativeId: "r2" })).toBe("r1"); // the shipment's rep wins
  });
});

describe("cardDeviceRows", () => {
  it("lists a card's devices with email and renewal day, soonest day first", () => {
    const devices = [
      { id: "1", name: "ب", starlinkAccountEmail: "b@example.com", rechargeDate: "2026/10/20" },
      { id: "2", name: "أ", expectedEmail: "a@example.com", lockedRenewalDay: 3, rechargeDate: "2026/10/30" },
      { id: "3", name: "ج" },
    ] as StarlinkAccountSummary[];
    expect(cardDeviceRows(devices)).toEqual([
      { id: "2", name: "أ", email: "a@example.com", day: 3 },
      { id: "1", name: "ب", email: "b@example.com", day: 20 },
      { id: "3", name: "ج" },
    ]);
  });
});
