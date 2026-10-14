import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { clientLeaderboard, monthsSince, repLeaderboard } from "./leaderboards";
import type { RepresentativeStore } from "./repStore";

const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary =>
  ({ id: "", customerId: "x", name: "", deviceName: "", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "", balanceDue: "0", currency: "$", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "", lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...o }) as StarlinkAccountSummary;
const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "x", kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date: "2026-09-10", createdAt: "2026-09-10T00:00:00Z", ...o }) as LedgerEntry;
const now = "2026-01-01T00:00:00Z";
const reps: RepresentativeStore = {
  r1: { id: "r1", name: "سالم", commissionPercent: 50, createdAt: now, updatedAt: now },
  r2: { id: "r2", name: "أحمد", commissionPercent: 50, createdAt: now, updatedAt: now },
};
const clients: ClientStore = {
  c1: { id: "c1", name: "محمد", phone: "222", createdAt: now, updatedAt: now },
  c2: { id: "c2", name: "علي", createdAt: now, updatedAt: now },
};
const accounts = [
  acc({ id: "a", representativeId: "r1", clientId: "c1", rechargeDate: "2026/10/10" }),
  acc({ id: "b", representativeId: "r1", clientId: "c1", rechargeDate: "2026/09/01" }),
  acc({ id: "c", representativeId: "r2", clientId: "c2", rechargeDate: "2026/10/01" }),
  acc({ id: "z", representativeId: "r2", deletedAt: now }),
];
const ledger: LedgerByAccount = {
  a: [e({ amount: 4000 }), e({ kind: "credit", amount: 3000 }), e({ date: "2025-06-01", amount: 3500 }), e({ kind: "credit", date: "2025-06-02", amount: 3500 })],
  b: [e({ amount: 20, currency: "USD" }), e({ previousDebtId: "p", amount: 5 })],
  c: [e({ date: "2026-08-10" })],
  z: [e({})],
};

describe("leaderboards", () => {
  it("ranks reps by the month's shipments with their devices' state and collections", () => {
    expect(repLeaderboard(accounts, ledger, reps, "2026-09", new Date(2026, 8, 28))).toEqual([
      { repId: "r1", name: "سالم", devices: 2, active: 1, lapsed: 1, shipments: 2, collected: { MRU: 3000 } },
      { repId: "r2", name: "أحمد", devices: 1, active: 1, lapsed: 0, shipments: 0, collected: {} },
    ]);
  });

  it("ranks customers by loyalty with paid / owed per currency and since when", () => {
    const rows = clientLeaderboard(accounts, ledger, clients);
    expect(rows[0]).toEqual({
      clientId: "c1",
      name: "محمد",
      phone: "222",
      devices: 2,
      shipments: 3,
      paid: { MRU: 6500 },
      owes: { MRU: 1005, USD: 20 },
      since: "2025-06-01",
    });
    expect(rows[1]).toMatchObject({ clientId: "c2", shipments: 1, owes: { MRU: 1 } });
    expect(monthsSince("2025-06-01", new Date(2026, 8, 28))).toBe(15);
  });
});
