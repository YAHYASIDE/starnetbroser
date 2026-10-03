// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";

const sent: string[] = [];
const resolved: string[] = [];
vi.mock("./telegram", () => ({ sendRepText: async (_rep: string, text: string) => { sent.push(text); return true; } }));
vi.mock("@starnet/local-browser-plugin", () => ({ LocalBrowser: { telegramResolveEdit: async ({ id }: { id: string }) => { resolved.push(id); } } }));

import { decideRepEdit, handleRepMenuRecord, repLoanRequest, repPaymentRequest } from "./repMenuRecords";
import { loadRepRequests, pendingRepRequests } from "./repRequests";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { loadClientStore, saveClientStore } from "./clientStore";
import { loadRepBook } from "./repClients";

// Fake data only.
function device(extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id: "acc-1", customerId: "x", name: "مقهى", deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", clientId: "c1", representativeId: "r1", wifiPassword: "old-wifi", ...extra,
  };
}

const edit = (field: string, value: string, id = "e1") => ({
  bot: "reps" as const, chatId: "9", name: "", username: "", text: "", replied: true,
  kind: "repEdit" as const,
  data: JSON.stringify({ id, repId: "r1", accountId: "acc-1", field, value, old: "old", device: "مقهى", repChat: "9" }),
});

beforeEach(() => {
  window.localStorage.clear();
  sent.length = 0;
  resolved.length = 0;
  saveDemoAccounts([device()]);
  saveClientStore({ c1: { id: "c1", name: "محمد", phone: "222", createdAt: "", updatedAt: "" } });
});

describe("rep menu records", () => {
  it("an edit waits as a request - nothing changes before approval", async () => {
    expect(await handleRepMenuRecord(edit("w", "new-wifi"))).toBe(true);
    await handleRepMenuRecord(edit("w", "new-wifi")); // the same edit twice is one request
    const pending = pendingRepRequests(loadRepRequests());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "edit", editId: "e1", field: "w", value: "new-wifi", accountId: "acc-1" });
    expect(loadDemoAccounts([])[0]!.wifiPassword).toBe("old-wifi");
  });

  it("✅ in the owner's bot applies it, even when the edit record itself was lost", async () => {
    let changed = 0;
    window.addEventListener("starnet:accounts-changed", () => changed++);
    const decision = { ...edit("w", "new-wifi"), kind: "repEditDecision" as const };
    decision.data = JSON.stringify({ ...JSON.parse(decision.data), approve: true });
    await handleRepMenuRecord(decision);
    expect(loadDemoAccounts([])[0]!.wifiPassword).toBe("new-wifi");
    expect(loadRepRequests()[0]!.status).toBe("approved");
    expect(sent).toEqual([]); // he was told by the bot already
    expect(changed).toBe(1);
  });

  it("approving in the app changes the customer, tells the rep and closes the bot's buttons", async () => {
    await handleRepMenuRecord(edit("t", "22233344"));
    const request = pendingRepRequests(loadRepRequests())[0]!;
    expect((await decideRepEdit(request, true, "app")).ok).toBe(true);
    expect(loadClientStore().c1!.phone).toBe("22233344");
    expect(resolved).toEqual(["e1"]);
    expect(sent[0]).toContain("✅ وافق المسؤول على تعديل هاتف الزبون");
  });

  it("rejecting leaves the device as it was", async () => {
    await handleRepMenuRecord(edit("n", "بيت"));
    await decideRepEdit(pendingRepRequests(loadRepRequests())[0]!, false, "app");
    expect(loadDemoAccounts([])[0]!.name).toBe("مقهى");
    expect(loadRepRequests()[0]!.status).toBe("rejected");
    expect(sent[0]).toContain("❌");
  });

  it("a note is saved on the device straight away", async () => {
    await handleRepMenuRecord({
      bot: "reps", chatId: "9", name: "", username: "", text: "", replied: true, kind: "repNote",
      data: JSON.stringify({ repId: "r1", accountId: "acc-1", text: "الطبق يحتاج تنظيف", at: new Date(2026, 8, 29).getTime() }),
    });
    expect(loadDemoAccounts([])[0]!.alertReason).toBe("📝 المندوب 29/09: الطبق يحتاج تنظيف");
  });

  it("ordinary messages are left for the bot answers", async () => {
    expect(await handleRepMenuRecord({ bot: "reps", chatId: "9", name: "", username: "", text: "محمد", replied: false })).toBe(false);
  });

  it("💵 a payment entered step by step waits for approval on the customer's device", async () => {
    const payment = (data: Record<string, unknown>) => ({
      bot: "money" as const, chatId: "9", name: "", username: "", text: "", replied: true, kind: "repPayment" as const, data: JSON.stringify(data),
    });
    expect(await handleRepMenuRecord(payment({ repId: "r1", amount: 5000, currency: "SIFA", personal: false, accountId: "acc-1", target: "مقهى - محمد", label: "5,000 سيفا" }))).toBe(true);
    const pending = pendingRepRequests(loadRepRequests());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "payment", repId: "r1", amount: 5000, currency: "SIFA", accountId: "acc-1", text: "💵 دفعة 5,000 سيفا عن مقهى - محمد" });
    expect(sent).toEqual([]); // the bot told him already
  });

  it("💼 his own account becomes a handover request; broken records are dropped", () => {
    expect(repPaymentRequest({ repId: "r1", amount: 50, currency: "USD", personal: true, label: "50 دولار" })).toEqual({
      repId: "r1", kind: "handover", text: "💼 دفعة في حسابي الشخصي: 50 دولار", amount: 50, currency: "USD",
    });
    expect(repPaymentRequest({ repId: "r1", amount: 0, currency: "USD", personal: true })).toBeNull();
    expect(repPaymentRequest({ repId: "r1", amount: 10, currency: "EUR", personal: true })).toBeNull();
    expect(repPaymentRequest({ repId: "r1", amount: 10, currency: "MRU", personal: false, accountId: "" })).toBeNull();
    expect(repPaymentRequest({ amount: 10, currency: "MRU", personal: true })).toBeNull();
  });

  it("🏦 a loan request waits for approval with its app and recipient's number", async () => {
    await handleRepMenuRecord({
      bot: "money", chatId: "9", name: "", username: "", text: "", replied: true, kind: "repLoan",
      data: JSON.stringify({ repId: "r1", amount: 20000, currency: "MRU", app: "بنكيلي", number: "22123456", label: "20,000 أوقية" }),
    });
    const pending = pendingRepRequests(loadRepRequests());
    expect(pending[0]).toMatchObject({ kind: "loan", amount: 20000, currency: "MRU", loanApp: "بنكيلي", loanNumber: "22123456", text: "🏦 سلفة 20,000 أوقية عبر بنكيلي إلى 22123456" });
    expect(repLoanRequest({ repId: "r1", amount: 5, currency: "SIFA", app: "نيتا" })).toBeNull(); // no number
    expect(repLoanRequest({ repId: "r1", amount: 0, currency: "SIFA", app: "نيتا", number: "1" })).toBeNull();
  });

  it("💳 the payment's method and 📸 photo come with it", () => {
    expect(repPaymentRequest({ repId: "r1", amount: 5000, currency: "SIFA", accountId: "acc-1", target: "مقهى", label: "5,000 سيفا", method: "nita", photo: "FILE1", bot: "money" })).toMatchObject({
      kind: "payment", paymentMethod: "nita", proofFileId: "FILE1", proofBot: "money", text: "💵 دفعة 5,000 سيفا (نيتا) عن مقهى",
    });
    const cash = repPaymentRequest({ repId: "r1", amount: 50, currency: "USD", personal: true, label: "50 دولار", method: "cash" });
    expect(cash).toMatchObject({ kind: "handover", paymentMethod: "cash", text: "💼 دفعة في حسابي الشخصي: 50 دولار (نقدًا)" });
    expect(cash).not.toHaveProperty("proofFileId");
    expect(repPaymentRequest({ repId: "r1", amount: 5, currency: "MRU", accountId: "acc-1", method: "paypal" })).not.toHaveProperty("paymentMethod");
  });
});

describe("the rep's own book from his bot (repClients.ts)", () => {
  const ownCustomer = () =>
    saveClientStore({
      c1: { id: "c1", name: "محمد", phone: "222", createdAt: "", updatedAt: "", repSegments: [{ repId: "r1", from: "2026-01-01T00:00:00.000Z", carry: true }] },
    });
  const record = (kind: "repPayment" | "repBookEntry" | "repBookUndo", data: Record<string, unknown>) => ({
    bot: "money" as const, chatId: "9", name: "", username: "", text: "", replied: true, kind, data: JSON.stringify(data),
  });

  it("💵 for his own customer goes straight into his book - no request, recorded once", async () => {
    ownCustomer();
    const pay = record("repPayment", { id: "p1", repId: "r1", amount: 1500, currency: "MRU", accountId: "acc-1", method: "cash", at: Date.parse("2026-05-01T10:00:00Z") });
    await handleRepMenuRecord(pay);
    await handleRepMenuRecord(pay);
    expect(loadRepRequests()).toEqual([]);
    expect(loadRepBook()).toMatchObject([{ id: "p1", repId: "r1", clientId: "c1", kind: "payment", amount: 1500, currency: "MRU" }]);
  });

  it("💵 for a customer still in the old model waits for approval, as before", async () => {
    await handleRepMenuRecord(record("repPayment", { id: "p2", repId: "r1", amount: 1500, currency: "MRU", accountId: "acc-1" }));
    expect(loadRepBook()).toEqual([]);
    expect(pendingRepRequests(loadRepRequests())).toHaveLength(1);
  });

  it("➕➖ له/عليه is written on his own customer only, and ↩️ تراجع removes it within 24 hours", async () => {
    ownCustomer();
    const now = Date.now();
    await handleRepMenuRecord(record("repBookEntry", { id: "b1", repId: "r1", clientId: "c1", kind: "charge", amount: 300, currency: "MRU", note: "دين قديم", at: now }));
    await handleRepMenuRecord(record("repBookEntry", { id: "b2", repId: "r2", clientId: "c1", kind: "charge", amount: 300, currency: "MRU", at: now }));
    expect(loadRepBook().map((e) => e.id)).toEqual(["b1"]);
    await handleRepMenuRecord(record("repBookUndo", { id: "b1", repId: "r1", at: now + 1000 }));
    expect(loadRepBook()).toEqual([]);
  });

  it("↩️ after 24 hours is refused, and the rep is told", async () => {
    ownCustomer();
    const then = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await handleRepMenuRecord(record("repBookEntry", { id: "b3", repId: "r1", clientId: "c1", kind: "credit", amount: 50, currency: "USD", at: then }));
    await handleRepMenuRecord(record("repBookUndo", { id: "b3", repId: "r1", at: Date.now() }));
    expect(loadRepBook()).toHaveLength(1);
    expect(sent.at(-1)).toContain("24 ساعة");
  });
});
