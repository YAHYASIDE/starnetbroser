import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { BusinessData, buildBusinessSnapshot, snapshotText } from "./aiContext";
import type { LedgerEntry } from "./ledgerStore";

function entry(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "e", kind: "debit", amount: 100, currency: "USD", note: "", email: "", date: "2026-09-10", createdAt: "2026-09-10T10:00:00.000Z", ...o };
}

const base = { customerId: "x", deviceName: "Kit", serialNumber: "", standbyDate: "", balanceDue: "0", currency: "$", dishStatus: "GREEN", wifiStatus: "GREEN", alertReason: "", lastUpdated: "", lastSuccessfulScanAt: null, planName: "Residential" };

function data(): BusinessData {
  const now = "2026-09-01T00:00:00.000Z";
  return {
    today: "2026-09-26",
    accounts: [
      {
        ...base,
        id: "d1",
        name: "منزل",
        kitNumber: "KIT123",
        rechargeDate: "2026/10/01",
        clientId: "c1",
        representativeId: "r1",
        expectedEmail: "a@b.com",
        expectedEmailPassword: "SECRET-PASS",
        wifiPassword: "WIFI-SECRET",
        extraEmails: [{ address: "x@y.com", password: "EXTRA-SECRET" }],
      } as unknown as StarlinkAccountSummary,
    ],
    clients: { c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: now, updatedAt: now } },
    reps: { r1: { id: "r1", name: "سالم", commissionPercent: 50, createdAt: now, updatedAt: now } },
    suppliers: {},
    ledger: {
      d1: [
        entry({ id: "s1", date: "2026-09-10", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-12" }, profitCurrencyRates: { MRU: 40 } }),
        entry({ id: "s2", date: "2026-09-20", amount: 120, starlinkCost: { status: "pending", currencyCode: "USD", amount: 70 } }),
        entry({ id: "p1", kind: "credit", amount: 100, date: "2026-09-21" }),
        entry({ id: "old", date: "2024-01-01", amount: 50, starlinkCost: { status: "settled", currencyCode: "USD", amount: 30, paidAt: "2024-01-02" } }),
        entry({ id: "oldD", date: "2024-02-01", amount: 50, starlinkCost: { status: "pending", currencyCode: "USD", amount: 30 } }),
      ],
    },
    previousDebts: [],
    cash: [{ id: "c", kind: "in", amount: 100, currencyCode: "USD", date: "2026-09-21", createdAt: now }],
    topUps: [],
    invoices: [],
    items: {},
    transactions: [],
    currencies: {},
  };
}

describe("buildBusinessSnapshot", () => {
  it("never includes passwords, whatever the account holds", () => {
    const text = snapshotText(data());
    expect(text).not.toContain("SECRET");
    expect(text).toContain("a@b.com");
    expect(text).toContain("22212345678");
  });

  it("gives each device its client, rep, balance, profits and open D", () => {
    const snap = buildBusinessSnapshot(data());
    const device = snap.devices[0] as Record<string, any>;
    expect(device.client).toBe("محمد");
    expect(device.rep).toBe("سالم");
    // 100 + 120 + 50 + 50 shipped, 100 paid
    expect(device.balanceOwedByClient).toEqual({ USD: 220 });
    const settled = device.operations.find((o: any) => o.date === "2026-09-10");
    expect(settled).toMatchObject({ profitUsd: 40, profitDate: "2026-09-12", profitMru: 1600 });
    expect(snap.starlinkOwed.openD.map((d) => d.usd).sort()).toEqual([30, 70]);
    expect(snap.starlinkOwed.totalUsd).toBe(100);
    expect(snap.clients[0]).toMatchObject({ name: "محمد", devices: ["منزل"], devicesBalanceOwed: { USD: 220 } });
    expect(snap.cashRegisterBalance).toEqual({ USD: 100 });
  });

  it("drops old settled operations but keeps an old unpaid D", () => {
    const device = buildBusinessSnapshot(data()).devices[0] as Record<string, any>;
    const dates = device.operations.map((o: any) => o.date);
    expect(dates).toContain("2024-02-01");
    expect(dates).not.toContain("2024-01-01");
    expect(device.olderOperationsOmitted).toBe(1);
  });
});
