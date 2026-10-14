import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { oceanAlertsToSend, oceanModeAccounts, oceanTelegramText } from "./oceanMode";

const acc = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...extra }) as StarlinkAccountSummary;

describe("oceanMode", () => {
  it("lists live devices with the switch ON", () => {
    const list = [acc("a", { oceanMode: true }), acc("b", { oceanMode: false }), acc("c", { oceanMode: true, deletedAt: "x" })];
    expect(oceanModeAccounts(list).map((a) => a.id)).toEqual(["a"]);
  });

  it("alerts once per device, again after it was turned off and on", () => {
    const first = oceanAlertsToSend([acc("a", { oceanMode: true })], []);
    expect(first.send.map((a) => a.id)).toEqual(["a"]);
    expect(oceanAlertsToSend([acc("a", { oceanMode: true })], first.keep).send).toEqual([]);
    const off = oceanAlertsToSend([acc("a", { oceanMode: false })], first.keep);
    expect(off.keep).toEqual([]);
    expect(oceanAlertsToSend([acc("a", { oceanMode: true })], off.keep).send).toHaveLength(1);
  });

  it("builds the Telegram warning", () => {
    expect(oceanTelegramText([acc("a")])).toContain("🌊 جهاز a");
  });
});
