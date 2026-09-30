// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";

const sent: string[] = [];
const resolved: string[] = [];
vi.mock("./telegram", () => ({ sendRepText: async (_rep: string, text: string) => { sent.push(text); return true; } }));
vi.mock("@starnet/local-browser-plugin", () => ({
  LocalBrowser: {
    telegramResolveEdit: async () => {},
    telegramResolveActivation: async ({ id }: { id: string }) => { resolved.push(id); },
  },
}));

import { computeBalanceByCurrency, getAccountEntries, loadLedgerStore } from "./ledgerStore";
import { loadActivationCosts, parseActivationCosts, saveActivationCosts } from "./repActivation";
import { decideRepActivation, handleRepMenuRecord } from "./repMenuRecords";
import { loadRepRequests, pendingRepRequests } from "./repRequests";
import { saveDemoAccounts } from "./demoAccountStore";
import { saveRepresentativeStore } from "./repStore";
import { loadCurrencyStore, saveCurrencyStore, upsertCurrency } from "./currencyStore";

// Fake data only.
function device(): StarlinkAccountSummary {
  return {
    id: "acc-1", customerId: "x", name: "abdlkrim", deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", clientId: "c1", representativeId: "r1",
  };
}

const activation = (paid: string) => ({
  bot: "money" as const, chatId: "9", name: "", username: "", text: "", replied: true, kind: "repActivation" as const,
  data: JSON.stringify({ id: "act1", repId: "r1", accountId: "acc-1", device: "abdlkrim", plan: "100G", amount: 8000, currency: "MRU", price: "8,000 أوقية", paid }),
});

beforeEach(() => {
  window.localStorage.clear();
  sent.length = 0;
  resolved.length = 0;
  saveDemoAccounts([device()]);
  saveCurrencyStore(upsertCurrency(upsertCurrency(loadCurrencyStore(), { code: "MRU", name: "أوقية", symbol: "UM", rateFromUsd: 40 }), { code: "SIFA", name: "سيفا", symbol: "CFA", rateFromUsd: 600 }));
  saveRepresentativeStore({ r1: { id: "r1", name: "الحسين", commissionPercent: 50, createdAt: "", updatedAt: "" } } as never);
});

describe("⚡ activations from the reps' bot", () => {
  it("package costs are kept per plan, junk dropped", () => {
    saveActivationCosts({ "100G": { amount: 50, currency: "USD" } });
    expect(loadActivationCosts()).toEqual({ "100G": { amount: 50, currency: "USD" } });
    expect(parseActivationCosts('{"ROM":{"amount":0,"currency":"USD"},"Sis":"x"}')).toEqual({});
    expect(parseActivationCosts("not json")).toEqual({});
  });

  it("the request waits on the representatives page; nothing is owed before approval", async () => {
    await handleRepMenuRecord(activation(""));
    await handleRepMenuRecord(activation("")); // once per activation id
    const pending = pendingRepRequests(loadRepRequests());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "activation", plan: "100G", amount: 8000, currency: "MRU", accountId: "acc-1", activationId: "act1" });
    expect(pending[0]!.text).toContain("لم يدفع بعد");
    expect(getAccountEntries(loadLedgerStore(), "acc-1")).toEqual([]);
  });

  it("✅ in the owner's bot records a renewal: the customer owes the price, Starlink's cost is D", async () => {
    saveActivationCosts({ "100G": { amount: 50, currency: "USD" } });
    const decision = { ...activation(""), kind: "repActivationDecision" as const };
    decision.data = JSON.stringify({ ...JSON.parse(decision.data), approve: true });
    await handleRepMenuRecord(decision);
    const [entry] = getAccountEntries(loadLedgerStore(), "acc-1");
    expect(entry).toMatchObject({ kind: "debit", amount: 8000, currency: "MRU" });
    expect(entry!.starlinkCost).toMatchObject({ status: "pending", amount: 50, currencyCode: "USD" });
    expect(entry).toMatchObject({ representativeId: "r1", representativeCommissionPercent: 50 });
    expect(computeBalanceByCurrency(getAccountEntries(loadLedgerStore(), "acc-1"))).toEqual({ MRU: 8000 });
    expect(loadRepRequests()[0]!.status).toBe("approved");
    expect(sent).toEqual([]); // the bot told him already
  });

  it("paid to the rep: the payment is recorded too, nothing left owed", async () => {
    await handleRepMenuRecord(activation("cash"));
    const request = pendingRepRequests(loadRepRequests())[0]!;
    expect(request.paymentMethod).toBe("cash");
    const result = await decideRepActivation(request, true, "app", { amount: 8000, currency: "MRU", cost: { amount: 50, currency: "USD" }, paid: "cash" });
    expect(result).toEqual({ ok: true });
    expect(computeBalanceByCurrency(getAccountEntries(loadLedgerStore(), "acc-1")).MRU ?? 0).toBeCloseTo(0);
    expect(resolved).toEqual(["act1"]);
    expect(sent[0]).toContain("✅ وافق المسؤول على تفعيل 100G");
  });

  it("✅ in the bot without the package's cost stays here, marked, for the operator to finish", async () => {
    const decision = { ...activation(""), kind: "repActivationDecision" as const };
    decision.data = JSON.stringify({ ...JSON.parse(decision.data), approve: true });
    await handleRepMenuRecord(decision);
    const [request] = pendingRepRequests(loadRepRequests());
    expect(request).toMatchObject({ approvedInBot: true, status: "pending" });
    expect(getAccountEntries(loadLedgerStore(), "acc-1")).toEqual([]);
  });

  it("❌ drops it and tells the rep (from the app)", async () => {
    await handleRepMenuRecord(activation(""));
    await decideRepActivation(pendingRepRequests(loadRepRequests())[0]!, false, "app");
    expect(loadRepRequests()[0]!.status).toBe("rejected");
    expect(sent[0]).toContain("❌ لم يوافق المسؤول على تفعيل 100G");
    expect(getAccountEntries(loadLedgerStore(), "acc-1")).toEqual([]);
  });
});
