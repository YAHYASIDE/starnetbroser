import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { checkDataHealth, healthScore } from "./dataHealth";

const base: StarlinkAccountSummary = {
  id: "",
  customerId: "x",
  name: "",
  deviceName: "",
  kitNumber: "",
  serialNumber: "",
  standbyDate: "",
  rechargeDate: "",
  balanceDue: "0",
  currency: "$",
  dishStatus: DeviceStatus.GREEN,
  wifiStatus: DeviceStatus.GREEN,
  alertReason: "",
  lastUpdated: "",
  lastSuccessfulScanAt: "2026-09-27T10:00:00Z",
  planName: "",
};
const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary => ({ ...base, ...o });
const now = "2026-01-01T00:00:00Z";
const clients: ClientStore = {
  c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: "2026-09-02T10:00:00Z", updatedAt: now },
  c2: { id: "c2", name: "سالم", createdAt: now, updatedAt: now },
};
const plan = { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" };

describe("data health", () => {
  const accounts = [
    acc({ id: "a", name: "A", clientId: "c1", rechargeDate: "2026/10/01", expectedEmail: "x@gmail.com", kitNumber: "KIT1", renewalPlan: plan }),
    acc({ id: "b", name: "B", clientId: "c2", rechargeDate: "2026/10/02", starlinkAccountEmail: "X@gmail.com", kitNumber: "kit1", renewalPlan: plan }),
    acc({ id: "c", name: "C", rechargeDate: "", lastSuccessfulScanAt: null, expectedEmail: "e@x.com", starlinkAccountEmail: "other@x.com" }),
    acc({ id: "d", name: "D", clientId: "c1", rechargeDate: "2026/10/03", lastSuccessfulScanAt: "2026-08-01T00:00:00Z", renewalPlan: plan, limitedAccess: true }),
    acc({ id: "z", name: "archived", archivedAt: now }),
  ];
  const issues = checkDataHealth(accounts, clients, { now: new Date("2026-09-28T12:00:00Z") });
  const kinds = (k: string) => issues.find((i) => i.kind === k)?.items.map((i) => i.accountId ?? i.clientId);

  it("finds duplicates (case-insensitive), missing fields and stale syncs; ignores archived", () => {
    expect(kinds("duplicate-email")).toEqual(["a", "b"]);
    expect(kinds("duplicate-kit")).toEqual(["a", "b"]);
    expect(kinds("email-mismatch")).toEqual(["c"]);
    expect(kinds("no-renewal-date")).toEqual(["c"]);
    expect(kinds("no-client")).toEqual(["c"]);
    expect(kinds("no-phone")).toEqual(["b", "c"]);
    expect(kinds("no-monthly-price")).toEqual(["c"]);
    expect(kinds("never-synced")).toEqual(["c"]);
    expect(kinds("stale-sync")).toEqual(["d"]);
    expect(kinds("limited-access")).toEqual(["d"]);
    expect(kinds("client-no-phone")).toEqual(["c2"]);
    expect(issues[0]!.severity).toBe("high");
    expect(issues.at(-1)!.severity).toBe("low");
  });

  it("scores the share of devices without a serious issue", () => {
    expect(healthScore(accounts, issues)).toBe(25); // only D is clean of high/medium
    expect(healthScore([], [])).toBe(100);
  });

  it("flags recent loss-making shipments and two clients sharing a phone", () => {
    const now2 = new Date("2026-09-28T12:00:00Z");
    const ledger = {
      a: [
        { id: "l1", kind: "debit", amount: 40, currency: "USD", note: "", email: "", date: "2026-09-10", createdAt: "x", starlinkCost: { status: "settled", currencyCode: "USD", amount: 50 } },
        { id: "l2", kind: "debit", amount: 40, currency: "USD", note: "", email: "", date: "2026-01-10", createdAt: "x", starlinkCost: { status: "settled", currencyCode: "USD", amount: 50 } },
        { id: "l3", kind: "debit", amount: 60, currency: "USD", note: "", email: "", date: "2026-09-12", createdAt: "x", starlinkCost: { status: "settled", currencyCode: "USD", amount: 50 } },
      ],
    } as never;
    const twins = { ...clients, c3: { id: "c3", name: "محمد 2", phone: "+222 1234 5678", createdAt: now, updatedAt: now } };
    const found = checkDataHealth([acc({ id: "a", name: "A", clientId: "c1", rechargeDate: "2026/10/01" })], twins, { now: now2, ledger });
    expect(found.find((i) => i.kind === "loss-shipment")!.items).toEqual([{ accountId: "a", clientId: "c1", label: "A", detail: "2026-09-10 · خسارة 10$" }]);
    expect(found.find((i) => i.kind === "duplicate-client-phone")!.items.map((i) => i.clientId)).toEqual(["c1", "c3"]);
  });

  it("flags a renewal done at Starlink but never recorded", () => {
    const e = (date: string) => ({ id: date, kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date, createdAt: "x" });
    const ledger = { a: [e("2026-07-20")], b: [e("2026-09-20")], c: [] } as never;
    const found = checkDataHealth(
      [
        acc({ id: "a", name: "A", clientId: "c1", rechargeDate: "2026/10/25" }),
        acc({ id: "b", name: "B", clientId: "c1", rechargeDate: "2026/10/20" }),
        acc({ id: "c", name: "C", clientId: "c1", rechargeDate: "2026/10/25" }),
        acc({ id: "d", name: "D", clientId: "c1", rechargeDate: "2026/10/01" }),
      ],
      clients,
      { now: new Date(2026, 8, 28, 12), ledger },
    );
    expect(found.find((i) => i.kind === "renewed-unrecorded")!.items).toEqual([
      { accountId: "a", clientId: "c1", label: "A", detail: "آخر شحنة 2026-07-20 · القادم 2026/10/25" },
    ]);
  });
});
