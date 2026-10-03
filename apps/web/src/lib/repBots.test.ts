import { describe, expect, it } from "vitest";
import { botForRequest, devicesHelp, devicesKeyboard, isMoneyKind, moneyDeepLink, moneyRedirectText, otherBotsLines, REP_DEVICES_KEYBOARD, REP_MONEY_KEYBOARD } from "./repBots";
import { menuMarkup } from "./repDeviceMenu";
import { parseRepCommand, REP_HELP, REP_KEYBOARD } from "./telegramRepMessages";

const texts = (markup: string) => (JSON.parse(markup).keyboard ?? JSON.parse(markup).inline_keyboard).flat().map((b: { text: string }) => b.text);

describe("the reps' three bots", () => {
  it("without the money bot the devices bot keeps everything", () => {
    expect(devicesKeyboard({})).toBe(REP_KEYBOARD);
    expect(devicesHelp({})).toBe(REP_HELP);
    expect(otherBotsLines({})).toEqual([]);
  });

  it("with it, money leaves the devices bot's buttons", () => {
    expect(devicesKeyboard({ money: "m_bot" })).toBe(REP_DEVICES_KEYBOARD);
    const devices = texts(REP_DEVICES_KEYBOARD);
    expect(devices).not.toContain("💵 دفعة");
    expect(devices).toContain("⚡ تفعيل");
    expect(devices).not.toContain("➕ زبون جديد"); // customers are added from the app now
    expect(devices).toContain("❓ مساعدة");
    expect(texts(REP_MONEY_KEYBOARD)).toEqual(["💵 دفعة", "💰 ديون زبائني", "📊 كشفي", "🔎 بحث", "📒 دفتري (له/عليه)", "🏦 دين (سلفة)"]);
    expect(moneyRedirectText("m_bot")).toContain("@m_bot");
    expect(otherBotsLines({ money: "m_bot", alerts: "a_bot" }).join("\n")).toContain("@a_bot");
  });

  it("money commands, and where confirmations go", () => {
    for (const kind of ["payment", "promise", "mypromises", "debts", "statement", "handover", "loan"]) expect(isMoneyKind(kind)).toBe(true);
    expect(isMoneyKind("devices")).toBe(false);
    expect(isMoneyKind("activate")).toBe(false); // ⚡ works in both bots
    expect(botForRequest("payment")).toBe("money");
    expect(botForRequest("client")).toBe("reps");
  });

  it("🏦 دين (سلفة) parses as a loan request", () => {
    expect(parseRepCommand("🏦 دين (سلفة)")).toEqual({ kind: "loan" });
    expect(parseRepCommand("سلفة")).toEqual({ kind: "loan" });
  });

  it("🤲 سلّمت المسؤول parses as a handover", () => {
    expect(parseRepCommand("🤲 سلّمت المسؤول 50000")).toEqual({ kind: "handover", text: "50000" });
    expect(parseRepCommand("سلمت 100 دولار")).toEqual({ kind: "handover", text: "100 دولار" });
  });

  it("the device menu gets one 💰 المال link to the money bot", () => {
    expect(moneyDeepLink("m_bot", "acc-1")).toBe("https://t.me/m_bot?start=d_acc-1");
    expect(moneyDeepLink("m_bot", "bad id")).toBeUndefined();
    const menu = menuMarkup("acc-1", undefined, "m_bot");
    const all = texts(menu);
    expect(all).toContain("💰 المال");
    expect(all).not.toContain("💰 الدين");
    expect(all).not.toContain("📊 كشف");
    expect(menu).toBe(
      JSON.stringify({
        inline_keyboard: [
          [{ text: "📶 الشبكة", callback_data: "v:n:acc-1" }, { text: "📅 التجديد", callback_data: "v:r:acc-1" }, { text: "🛰️ الاشتراك", callback_data: "v:p:acc-1" }],
          [{ text: "🔢 KIT/SN", callback_data: "v:i:acc-1" }, { text: "👤 المعلومات", callback_data: "v:f:acc-1" }, { text: "📝 ملاحظة", callback_data: "nt:acc-1" }],
          [{ text: "✏️ تعديل", callback_data: "e:acc-1" }, { text: "💰 المال", url: "https://t.me/m_bot?start=d_acc-1" }],
          [{ text: "⚡ تفعيل", callback_data: "a:acc-1" }],
        ],
      }),
    );
  });
});
