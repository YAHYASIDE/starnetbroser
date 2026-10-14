import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { buildWinBackMessage, listLapsedDevices } from "./winBack";

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

describe("win-back", () => {
  it("lists lapsed devices freshest first with the client's phone", () => {
    const list = listLapsedDevices(
      [
        acc({ id: "a", name: "A", clientId: "c1", rechargeDate: "2026/09/20" }),
        acc({ id: "b", name: "B", rechargeDate: "2026/09/10", phone: "22233334444" }),
        acc({ id: "c", name: "C", rechargeDate: "2026/09/27" }),
        acc({ id: "d", name: "D", rechargeDate: "2025/01/01" }),
      ],
      clients,
      new Date(2026, 8, 28),
    );
    expect(list.map((d) => [d.id, d.daysLapsed, d.phone])).toEqual([
      ["a", 8, "22212345678"],
      ["b", 18, "22233334444"],
    ]);
    expect(buildWinBackMessage({ name: "A", clientName: "محمد", daysLapsed: 8 })).toContain("متوقف منذ 8 يوماً");
  });
});
