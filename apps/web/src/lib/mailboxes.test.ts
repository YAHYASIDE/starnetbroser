import { describe, expect, it } from "vitest";
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import { buildMailboxRows, deviceEmail, isGmail, signedInCount } from "./mailboxes";

// Fake data only.
function device(id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: "x", name: `جهاز ${id}`, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...extra,
  };
}

const accounts = [
  device("a", { expectedEmail: "zed@outlook.com", clientId: "c1" }),
  device("b", { expectedEmail: "amin@outlook.com", kitNumber: "KIT123" }),
  device("c", { starlinkAccountEmail: "sync@hotmail.com" }),
  device("d"),
  device("e", { expectedEmail: "gone@outlook.com", deletedAt: "2026-09-01" }),
];
const clients = { c1: { id: "c1", name: "محمد", createdAt: "", updatedAt: "" } };
const sessions = [
  { accountId: "a", email: "zed@outlook.com", signedInAt: 5 },
  { accountId: "e", email: "gone@outlook.com", signedInAt: 6 },
];

describe("registered mailboxes", () => {
  it("shows only signed-in mailboxes by default, never deleted devices", () => {
    const rows = buildMailboxRows(accounts, clients, sessions);
    expect(rows.map((r) => r.email)).toEqual(["zed@outlook.com"]);
    expect(rows[0]).toMatchObject({ signedIn: true, clientName: "محمد", signedInAt: 5 });
  });

  it("'all' lists every device email, signed-in first, then alphabetical", () => {
    const rows = buildMailboxRows(accounts, clients, sessions, "", "all");
    expect(rows.map((r) => [r.email, r.signedIn])).toEqual([
      ["zed@outlook.com", true],
      ["amin@outlook.com", false],
      ["sync@hotmail.com", false],
    ]);
  });

  it("searches email, device, client and KIT", () => {
    expect(buildMailboxRows(accounts, clients, sessions, "AMIN", "all").map((r) => r.accountId)).toEqual(["b"]);
    expect(buildMailboxRows(accounts, clients, sessions, "kit123", "all").map((r) => r.accountId)).toEqual(["b"]);
    expect(buildMailboxRows(accounts, clients, sessions, "محمد", "all").map((r) => r.accountId)).toEqual(["a"]);
  });

  it("counts signed-in mailboxes of devices still in the app", () => {
    expect(signedInCount(accounts, sessions)).toBe(1);
    expect(deviceEmail({ expectedEmail: " x@y.com " })).toBe("x@y.com");
    expect(isGmail(" Talaa@GMAIL.com ")).toBe(true);
    expect(isGmail("a@outlook.com")).toBe(false);
    expect(isGmail("a@gmail.com.evil.io")).toBe(false);
  });
});
