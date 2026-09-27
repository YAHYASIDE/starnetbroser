import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { listPaymentTargets } from "./paymentTargets";

function account(id: string, name: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name, deviceName: "Kit", kitNumber: `KIT-${id}`, serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...extra,
  };
}

function entry(id: string, kind: "debit" | "credit", amount: number, currency = "USD"): LedgerEntry {
  return { id, kind, amount, currency, date: "2026-09-20", note: "", email: "", createdAt: "2026-09-20T00:00:00Z" } as LedgerEntry;
}

const clients = {
  c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: "", updatedAt: "" },
};

describe("listPaymentTargets", () => {
  const accounts = [
    account("a", "أ جهاز مسدد", { clientId: "c1" }),
    account("b", "ب جهاز مدين"),
    account("c", "ج محذوف", { deletedAt: "2026-09-01" }),
    account("d", "د مؤرشف", { archivedAt: "2026-09-01" }),
  ];
  const ledger = {
    a: [entry("1", "debit", 100), entry("2", "credit", 100)],
    b: [entry("3", "debit", 3000, "MRU"), entry("4", "debit", 50), entry("5", "credit", 60)],
  };

  it("lists live devices only, debtors first, with what each still owes per currency", () => {
    const rows = listPaymentTargets(accounts, clients, ledger);
    expect(rows.map((r) => r.account.id)).toEqual(["b", "a"]);
    expect(rows[0].owed).toEqual({ MRU: 3000 });
    expect(rows[1].owed).toEqual({});
    expect(rows[1].clientName).toBe("محمد");
  });

  it("searches by client name, client phone and kit number", () => {
    expect(listPaymentTargets(accounts, clients, ledger, "محمد").map((r) => r.account.id)).toEqual(["a"]);
    expect(listPaymentTargets(accounts, clients, ledger, "2221234").map((r) => r.account.id)).toEqual(["a"]);
    expect(listPaymentTargets(accounts, clients, ledger, "kit-b").map((r) => r.account.id)).toEqual(["b"]);
  });
});
