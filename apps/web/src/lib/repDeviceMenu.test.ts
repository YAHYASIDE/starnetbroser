import { describe, expect, it } from "vitest";
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import {
  appendRepNote,
  deviceHeader,
  deviceSections,
  editMarkup,
  isRepEditField,
  menuFits,
  menuMarkup,
  pickDeviceMarkup,
  repEditPatch,
  repEditValues,
} from "./repDeviceMenu";
import { balanceWords, repSearchIndex, repSearchReply } from "./telegramRepMessages";

// Fake data only.
function account(id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name: id, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "2026/10/27",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.RED, wifiStatus: DeviceStatus.RED, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", representativeId: "r1", ...extra,
  };
}

const TODAY = "2026-09-29";
const client = { id: "c1", name: "محمد", phone: "22212345", createdAt: "", updatedAt: "" };
const clients = { c1: client };
const debit = (id: string, amount: number, currency = "MRU") => ({ id, kind: "debit", amount, currency, date: TODAY, note: "", email: "", createdAt: "" }) as LedgerEntry;
const credit = (id: string, amount: number, currency = "MRU") => ({ id, kind: "credit", amount, currency, date: TODAY, note: "", email: "", createdAt: "" }) as LedgerEntry;
const tappable = (p: string) => `+222${p}`;

describe("menu buttons", () => {
  it("has the nine small buttons plus WhatsApp and ⚡, every callback under 64 bytes", () => {
    const markup = JSON.parse(menuMarkup("acc-1", "https://wa.me/1"));
    const texts = markup.inline_keyboard.flat().map((b: { text: string }) => b.text);
    expect(texts).toEqual(["📶 الشبكة", "📅 التجديد", "🛰️ الاشتراك", "💰 الدين", "🔢 KIT/SN", "👤 المعلومات", "✏️ تعديل", "📊 كشف", "📝 ملاحظة", "💬 واتساب", "⚡ تفعيل"]);
    expect(markup.inline_keyboard[0][0].callback_data).toBe("v:n:acc-1");
    expect(markup.inline_keyboard[2][0].callback_data).toBe("e:acc-1");
    expect(markup.inline_keyboard[2][2].callback_data).toBe("nt:acc-1");
  });

  it("edit menu: one button per field, then back", () => {
    const rows = JSON.parse(editMarkup("acc-1")).inline_keyboard;
    expect(rows.flat().map((b: { callback_data: string }) => b.callback_data)).toEqual([
      "ef:n:acc-1", "ef:c:acc-1", "ef:t:acc-1", "ef:e:acc-1", "ef:p:acc-1", "ef:w:acc-1", "ef:k:acc-1", "v:h:acc-1",
    ]);
    expect(isRepEditField("w")).toBe(true);
    expect(isRepEditField("z")).toBe(false);
  });

  it("an id too long for a callback gets no menu", () => {
    expect(menuFits("x".repeat(60))).toBe(false);
    expect(pickDeviceMarkup([{ id: "x".repeat(60), name: "a" }])).toBeUndefined();
  });
});

describe("device sections", () => {
  const device = account("مقهى", {
    clientId: "c1",
    planName: "التجوال - 100 غيغابايت",
    serviceStatus: "active",
    dataUsageGb: "121",
    kitNumber: "KIT-1",
    serialNumber: "SN-1",
    subscriptionId: "SL-1",
    expectedEmail: "a@example.com",
    expectedEmailPassword: "pass-1",
    wifiPassword: "wifi-1",
  });

  it("builds every section from the device", () => {
    const x = deviceSections({ account: device, client, entries: [debit("1", 3000)], siblings: [], today: TODAY, tappable });
    expect(x.r).toContain("2026/10/27");
    expect(x.r).toContain("بعد 27 يوم");
    expect(x.p).toContain("100G - التجوال - 100 غيغابايت");
    expect(x.p).toContain("121 GB من 100");
    expect(x.p).toContain("نفدت باقة الأولوية");
    expect(x.d).toContain("عليه");
    expect(x.i).toContain("KIT: KIT-1");
    expect(x.i).toContain("SN: SN-1");
    expect(x.i).toContain("SL-1");
    expect(x.f).toContain("🔑 كود الإيميل: pass-1");
    expect(x.f).toContain("📶 كود الواي فاي: wifi-1");
    expect(x.f).toContain("+22222212345");
    expect(x.s).toContain("كشف حساب - مقهى");
    expect(x.s).not.toContain("STAR NET");
  });

  it("shows credit, and the customer's total over his other devices", () => {
    const x = deviceSections({
      account: device, client, entries: [credit("1", 500)], siblings: [{ account: account("منزل"), entries: [debit("2", 2000)] }], today: TODAY, tappable,
    });
    expect(x.d).toContain("🟢 له");
    expect(x.d).toContain("كل أجهزة محمد (2)");
    expect(x.d).toContain("🔴 عليه: 1,500");
  });

  it("never shows the stored dots - 📶 is always read fresh", () => {
    const x = deviceSections({ account: device, client, entries: [], siblings: [], today: TODAY, tappable });
    expect(Object.values(x).join("\n")).not.toContain("غير متصل");
    expect(deviceHeader(device, client, tappable)).toBe("📡 مقهى\n👤 محمد (+22222212345)");
  });
});

describe("rep search with menus", () => {
  const accounts = [account("مقهى", { clientId: "c1" }), account("منزل", { clientId: "c1" })];
  const index = repSearchIndex(accounts, clients, {}, TODAY, true);

  it("one device: header + its menu, no stale network line", () => {
    const reply = repSearchReply("مقهى", index, TODAY);
    expect(reply.text).toContain("📡 مقهى");
    expect(reply.text).not.toContain("الطبق");
    expect(JSON.parse(reply.markup!).inline_keyboard[0][0].callback_data).toBe("v:n:مقهى");
  });

  it("several: one button each that opens the menu", () => {
    const reply = repSearchReply("محمد", index, TODAY);
    const rows = JSON.parse(reply.markup!).inline_keyboard;
    expect(rows.map((r: { callback_data: string }[]) => r[0]!.callback_data)).toEqual(["m:مقهى", "m:منزل"]);
  });

  it("the owner's index keeps the full card", () => {
    const owner = repSearchIndex(accounts, clients, {}, TODAY);
    expect(owner[0]!.h).toBeUndefined();
    expect(repSearchReply("مقهى", owner, TODAY, true).text).toContain("الطبق");
  });

  it("💵 دفعة: what each device and its customer owes or has as credit", () => {
    const ledger = { مقهى: [debit("1", 5000)], منزل: [debit("2", 20, "USD"), credit("3", 50, "USD")] };
    const [cafe, home] = repSearchIndex(accounts, clients, ledger, TODAY, true);
    expect(cafe).toMatchObject({ c: "c1", b: "عليه 5,000 أوقية", cb: "عليه 5,000 أوقية · له 30 دولار" });
    expect(home!.b).toBe("له 30 دولار");
    expect(repSearchIndex(accounts, clients, {}, TODAY, true)[0]!.b).toBe("لا شيء عليه ولا له");
    expect(repSearchIndex(accounts, clients, ledger, TODAY)[0]!.b).toBeUndefined(); // the owner's index
    expect(balanceWords({})).toBe("لا شيء عليه ولا له");
  });
});

describe("applying edits and notes", () => {
  it("maps each field to the device or its customer", () => {
    expect(repEditPatch("w", " new-wifi ")).toEqual({ account: { wifiPassword: "new-wifi" } });
    expect(repEditPatch("t", "22233344")).toEqual({ client: { phone: "22233344" } });
    expect(repEditPatch("n", "بيت")).toEqual({ account: { name: "بيت" } });
    expect(repEditValues(account("a", { wifiPassword: "w1" }), client).w).toBe("w1");
  });

  it("adds the note on its own line with the rep and the day", () => {
    const now = new Date(2026, 8, 29, 10, 0);
    expect(appendRepNote("", "سالم", " الجهاز في المخزن ", now)).toBe("📝 سالم 29/09: الجهاز في المخزن");
    expect(appendRepNote("قديمة", "سالم", "ثانية", now)).toBe("قديمة\n📝 سالم 29/09: ثانية");
  });
});
