// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";

const sent: string[] = [];
const resolved: string[] = [];
vi.mock("./telegram", () => ({ sendRepText: async (_rep: string, text: string) => { sent.push(text); return true; } }));
vi.mock("@starnet/local-browser-plugin", () => ({ LocalBrowser: { telegramResolveEdit: async ({ id }: { id: string }) => { resolved.push(id); } } }));

import { decideRepEdit, handleRepMenuRecord } from "./repMenuRecords";
import { loadRepRequests, pendingRepRequests } from "./repRequests";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { loadClientStore, saveClientStore } from "./clientStore";

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
});
