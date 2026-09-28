import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import type { Representative } from "./repStore";
import {
  deviceActionsMarkup,
  matchRepDevices,
  normalizeSearch,
  parseDayQuery,
  REP_KEYBOARD,
  repDaysReply,
  repExpiringReply,
  repSearchIndex,
  repSearchReply,
  repStoppedReply,
  tappablePhone,
  parseRepCommand,
  repAccounts,
  repDebtsText,
  repDevicesText,
  repExpiringText,
  repMoney,
  repMorningText,
  repStatementText,
} from "./telegramRepMessages";

function account(id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name: id, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate,
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", representativeId: "r1", ...extra,
  };
}

const TODAY = "2026-09-27";
const clients = { c1: { id: "c1", name: "محمد", phone: "22212345", createdAt: "", updatedAt: "" } };
const rep: Representative = { id: "r1", name: "سالم", commissionPercent: 50, createdAt: "", updatedAt: "" } as Representative;

describe("rep bot texts", () => {
  const accounts = [
    account("مقهى", "2026/09/28", { clientId: "c1" }),
    account("منزل", "2026/10/20", { serviceStatus: "suspended" }),
    account("ليس له", "2026/09/28", { representativeId: "r2" }),
    account("محذوف", "2026/09/28", { deletedAt: "x" }),
  ];

  it("only ever uses the rep's own live devices", () => {
    expect(repAccounts(accounts, "r1").map((a) => a.id)).toEqual(["مقهى", "منزل"]);
  });

  it("morning lists his renewals with the client's phone, or nothing when he has none", () => {
    const text = repMorningText("سالم", repAccounts(accounts, "r1"), clients, TODAY)!;
    expect(text).toContain("🟠 تنتهي غداً (1):\n• مقهى - محمد (22212345)");
    expect(text).not.toContain("ليس له");
    expect(repMorningText("سالم", [account("x", "2026/12/01")], clients, TODAY)).toBeNull();
  });

  it("devices and expiring answers", () => {
    const mine = repAccounts(accounts, "r1");
    const devices = repDevicesText(mine, clients, TODAY);
    expect(devices).toContain("📡 أجهزتك (2)");
    expect(devices).toContain("⛔ موقوفة (1):\n• منزل");
    expect(devices.indexOf("مقهى - محمد")).toBeLessThan(devices.lastIndexOf("منزل"));
    expect(repExpiringText(mine, clients, TODAY)).toContain("🟠 تنتهي غداً (1)");
    expect(repDevicesText([], clients, TODAY)).toContain("لا توجد أجهزة");
  });

  it("debts show only what his customers owe", () => {
    const ledger = {
      "مقهى": [{ id: "1", kind: "debit", amount: 3000, currency: "MRU", date: TODAY, note: "", email: "", createdAt: "" } as LedgerEntry],
      "ليس له": [{ id: "2", kind: "debit", amount: 999, currency: "MRU", date: TODAY, note: "", email: "", createdAt: "" } as LedgerEntry],
    };
    const text = repDebtsText("r1", accounts, ledger, clients);
    expect(text).toContain("3,000 أوقية");
    expect(text).not.toContain("999");
    expect(repDebtsText("r1", accounts, {}, clients)).toContain("لا ديون");
  });
});

describe("rep money", () => {
  it("gives his month share and balance in أوقية, like his card", () => {
    const ledgerStore = {
      "مقهى": [
        {
          id: "s1", kind: "debit", amount: 100, currency: "USD", date: "2026-09-20", note: "", email: "", createdAt: "2026-09-20T10:00:00Z",
          starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-20" },
          representativeId: "r1", representativeCommissionPercent: 50,
        } as unknown as LedgerEntry,
      ],
    };
    const figures = repMoney({ rep, month: "2026-09", ledgerStore, invoices: [], settlements: [], rates: { MRU: 40 } });
    expect(figures.monthShare.MRU).toBeCloseTo(800);
    expect(figures.balance.MRU).toBeCloseTo(800);
    expect(repStatementText("سالم", "2026-09", figures)).toContain("مستحق لك 800 أوقية");
    expect(repStatementText("سالم", "2026-09", { monthShare: {}, balance: { MRU: -50 } })).toContain("عليك 50 أوقية");
  });
});

describe("rep commands", () => {
  it("parses", () => {
    expect(parseRepCommand("/start")).toEqual({ kind: "help" });
    expect(parseRepCommand("أجهزتي")).toEqual({ kind: "devices" });
    expect(parseRepCommand("تنتهي")).toEqual({ kind: "expiring" });
    expect(parseRepCommand("كشفي")).toEqual({ kind: "statement" });
    expect(parseRepCommand("ديون زبائني")).toEqual({ kind: "debts" });
    expect(parseRepCommand("الصندوق")).toEqual({ kind: "unknown", text: "الصندوق" });
    // Keyboard buttons send the emoji too.
    expect(parseRepCommand("📡 أجهزتي")).toEqual({ kind: "devices" });
    expect(parseRepCommand("⛔️ الموقوفة")).toEqual({ kind: "stopped" });
    expect(parseRepCommand("💰 ديون زبائني")).toEqual({ kind: "debts" });
    expect(parseRepCommand("🔎 بحث محمد")).toEqual({ kind: "search", query: "محمد" });
    expect(parseRepCommand("🔎 بحث")).toEqual({ kind: "search", query: "" });
    // Spelling variants and everyday words.
    expect(parseRepCommand("الاجهزة")).toEqual({ kind: "devices" });
    expect(parseRepCommand("اجهزتي")).toEqual({ kind: "devices" });
    expect(parseRepCommand("توقف")).toEqual({ kind: "stopped" });
    expect(parseRepCommand("رصيدي")).toEqual({ kind: "statement" });
    // Requests: the rest of the text is the request.
    expect(parseRepCommand("💵 دفعة")).toEqual({ kind: "payment", text: "" });
    expect(parseRepCommand("دفعة 5000 محمد")).toEqual({ kind: "payment", text: "5000 محمد" });
    expect(parseRepCommand("استلمت 50 دولار من مقهى")).toEqual({ kind: "payment", text: "50 دولار من مقهى" });
    expect(parseRepCommand("➕ زبون جديد")).toEqual({ kind: "client", text: "" });
    expect(parseRepCommand("زبون جديد محمد 22212345")).toEqual({ kind: "client", text: "محمد 22212345" });
    expect(parseRepCommand("⚡ تفعيل")).toEqual({ kind: "activate", text: "" });
    expect(parseRepCommand("تفعيل محمد")).toEqual({ kind: "activate", text: "محمد" });
    // An email is searched whole - only a "/command@bot" loses its @name.
    expect(parseRepCommand("abdlkrim9113@gmail.com")).toEqual({ kind: "unknown", text: "abdlkrim9113@gmail.com" });
    expect(parseRepCommand("/start@starnet_reps_bot")).toEqual({ kind: "help" });
  });
});

describe("rep shortcuts", () => {
  const mine = [
    account("مقهى", "2026/09/28", { clientId: "c1" }),
    account("منزل", "2026/10/20", { serviceStatus: "suspended", clientId: "c1" }),
    account("بلا زبون", "2026/09/29"),
  ];

  it("keyboard has the eleven buttons", () => {
    const keyboard = JSON.parse(REP_KEYBOARD);
    expect(keyboard.keyboard.flat().map((b: { text: string }) => b.text)).toEqual([
      "📡 أجهزتي", "📅 تنتهي", "⛔ الموقوفة", "💰 ديون زبائني", "📊 كشفي", "📆 الأيام", "💵 دفعة", "➕ زبون جديد", "⚡ تفعيل", "🔎 بحث", "🤝 وعد دفع",
    ]);
    expect(parseRepCommand("🤝 وعد دفع")).toEqual({ kind: "promise", text: "" });
    expect(parseRepCommand("وعد 5000 محمد الخميس")).toEqual({ kind: "promise", text: "5000 محمد الخميس" });
    expect(keyboard.is_persistent).toBe(true);
    // Every button parses back to its command.
    for (const b of keyboard.keyboard.flat()) expect(parseRepCommand(b.text).kind).not.toBe("unknown");
  });

  it("expiring and stopped come with WhatsApp buttons carrying a ready message", () => {
    const expiring = repExpiringReply(mine, clients, TODAY);
    const buttons = JSON.parse(expiring.markup!).inline_keyboard.flat();
    expect(buttons).toHaveLength(1); // "بلا زبون" has no phone
    expect(buttons[0].text).toBe("💬 محمد - مقهى");
    expect(buttons[0].url).toMatch(/^https:\/\/wa\.me\/22212345\?text=/);
    expect(decodeURIComponent(buttons[0].url)).toContain("ينتهي يوم 2026/09/28");
    const stopped = repStoppedReply(mine, clients);
    expect(stopped.text).toContain("• منزل - محمد");
    expect(decodeURIComponent(JSON.parse(stopped.markup!).inline_keyboard[0][0].url)).toContain("متوقف");
    expect(repStoppedReply([mine[0]!], clients)).toEqual({ text: "✓ لا أجهزة موقوفة لك حسب آخر مزامنة" });
  });

  it("search finds by client, device or phone, only among the given devices", () => {
    const index = repSearchIndex(mine, clients, {}, TODAY);
    const byClient = repSearchReply("مُحمّد", index);
    expect(byClient.text).toContain("نتائج «مُحمّد» (2)");
    expect(byClient.text).toContain("📅 التجديد: 2026/09/28 (بعد 1 يوم)");
    expect(byClient.text).toContain("الحالة: ⛔ موقوف");
    expect(repSearchReply("٢٢٢١٢", index).text).toContain("(2)");
    // No phone -> no WhatsApp button, only ⚡ تفعيل.
    expect(repSearchReply("بلا زبون", index).markup).not.toContain("wa.me");
    expect(repSearchReply("علي", index).text).toBe("🔎 لم أجد «علي» بين أجهزتك");
    // The owner bot: same cards, WhatsApp buttons only (no ⚡ callbacks there).
    const owner = repSearchReply("مُحمّد", index, undefined, true);
    expect(owner.text).toBe(byClient.text);
    expect(owner.markup).toContain("wa.me");
    expect(owner.markup).not.toContain("callback_data");
    expect(repSearchReply("علي", index, undefined, true).text).toBe("🔎 لم أجد «علي» بين الأجهزة");
    const byEmail = repSearchIndex([account("abdlkrim9113@gmail.com", "2026/10/24")], clients, {}, TODAY);
    expect(repSearchReply("abdlkrim9113@gmail.com", byEmail).text).toContain("(1)");
    expect(repSearchReply("abdlkrim", byEmail).text).toContain("(1)");
    // Kit / serial / account numbers, with or without dashes and spaces; part of a name.
    const kit = repSearchIndex(
      [account("منزل الشيخ", "2026/10/24", { kitNumber: "KIT-4521 88", serialNumber: "SN77", accountNumber: "ACC-DF-1562", clientId: "c1" })],
      clients, {}, TODAY,
    );
    for (const q of ["4521", "kit452188", "KIT-4521 88", "4521-88", "sn77", "acc-df", "1562", "الشي", "محم"]) {
      expect(repSearchReply(q, kit).text, q).toContain("(1)");
    }
    expect(repSearchReply("4521", kit).text).toContain("🔢 KIT: KIT-4521 88 · SN: SN77");
    expect(repSearchReply("4521", kit).text).toContain("🧾 ACC-DF-1562");
    expect(repSearchReply("9999", kit).text).toContain("لم أجد");
    expect(repSearchReply("  ", index).text).toContain("اكتب جزءاً من اسم الزبون");
  });

  it("search by day: today/tomorrow, day of month, d/m, full date", () => {
    const index = repSearchIndex(mine, clients, {}, TODAY); // مقهى 09/28, منزل 10/20, بلا زبون 09/29
    expect(parseDayQuery("غداً", TODAY)).toEqual({ kind: "date", date: "2026-09-28", label: "غداً 28/09" });
    expect(parseDayQuery("بعد غد", TODAY)).toMatchObject({ date: "2026-09-29" });
    expect(parseDayQuery("يوم ٢٠", TODAY)).toEqual({ kind: "dayOfMonth", day: 20, label: "يوم 20" });
    expect(parseDayQuery("20/10", TODAY)).toMatchObject({ kind: "monthDay", day: 20, month: 10 });
    expect(parseDayQuery("4521", TODAY)).toBeNull();
    expect(parseDayQuery("محمد", TODAY)).toBeNull();
    const tomorrow = repSearchReply("غدا", index, TODAY);
    expect(tomorrow.text).toBe("📆 تجديدات غداً 28/09 (1):\n• مقهى - محمد (22212345)");
    expect(decodeURIComponent(JSON.parse(tomorrow.markup!).inline_keyboard[0][0].url)).toContain("ينتهي يوم 2026/09/28");
    expect(repSearchReply("يوم 20", index, TODAY).text).toContain("• منزل - محمد (22212345) ⛔ - 2026-10-20");
    expect(repSearchReply("2026/09/29", index, TODAY).text).toContain("بلا زبون");
    expect(repSearchReply("5/05", index, TODAY).text).toBe("📆 لا تجديدات لأجهزتك 5/05");
  });

  it("📆 الأيام groups the coming days", () => {
    const days = repDaysReply(mine, clients, TODAY);
    expect(days.text).toContain("📆 الاثنين 28/09 - غداً (1):\n• مقهى - محمد (22212345)");
    expect(days.text).toContain("📆 الثلاثاء 29/09 - بعد 2 يوم (1):\n• بلا زبون");
    expect(days.text).not.toContain("منزل"); // 23 days away
    expect(JSON.parse(days.markup!).inline_keyboard).toHaveLength(1);
    expect(parseRepCommand("📆 الأيام")).toEqual({ kind: "days" });
  });

  it("⚡ تفعيل buttons next to WhatsApp, on the stopped list and search results", () => {
    const stopped = JSON.parse(repStoppedReply(mine, clients).markup!).inline_keyboard;
    expect(stopped[0]).toEqual([
      expect.objectContaining({ text: "💬 محمد - منزل" }),
      { text: "⚡ تفعيل", callback_data: "a:منزل" },
    ]);
    const found = JSON.parse(repSearchReply("بلا زبون", repSearchIndex(mine, clients, {}, TODAY)).markup!).inline_keyboard;
    expect(found).toEqual([[{ text: "⚡ تفعيل بلا زبون", callback_data: "a:بلا زبون" }]]);
    // An id too long for Telegram's 64-byte callback just gets no ⚡.
    expect(deviceActionsMarkup([{ accountId: "x".repeat(70), name: "x" }])).toBeUndefined();
  });

  it("matchRepDevices finds the device a payment is about", () => {
    expect(matchRepDevices("محمد", mine, clients).map((a) => a.id)).toEqual(["مقهى", "منزل"]);
    expect(matchRepDevices("مقهى", mine, clients).map((a) => a.id)).toEqual(["مقهى"]);
    expect(matchRepDevices("", mine, clients)).toEqual([]);
  });

  it("folding matches the Java service", () => {
    expect(normalizeSearch("  أحمَد   مكة ١٢٣ ")).toBe("احمد مكه 123");
    expect(tappablePhone("222 12 34 56 78")).toBe("+22212345678");
    expect(tappablePhone("22212345")).toBe("22212345");
  });
});
