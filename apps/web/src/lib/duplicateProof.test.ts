import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { checkDataHealth } from "./dataHealth";
import { deviceSearchKey, duplicateGroups, isDuplicateKind } from "./duplicateProof";
import type { LedgerByAccount } from "./ledgerStore";
import { isRepClient, isRepDevice, ownerOnly } from "./repSeparation";

const device = (id: string, extra: Partial<StarlinkAccountSummary>) =>
  ({ id, name: `جهاز ${id}`, kitNumber: "", serialNumber: "", addedAt: `2026-0${id}-01T00:00:00.000Z`, lastSuccessfulScanAt: null, ...extra }) as StarlinkAccountSummary;

describe("duplicateGroups", () => {
  it("shows both devices that share an email, the oldest first, with what tells them apart", () => {
    const accounts = [
      device("2", { expectedEmail: "same@example.com", clientId: "c1", lastSuccessfulScanAt: "2026-10-01T09:00:00.000Z" }),
      device("1", { expectedEmail: "Same@example.com" }),
      device("3", { expectedEmail: "other@example.com" }),
    ];
    const clients = { c1: { id: "c1", name: "زبون أ", createdAt: "", updatedAt: "" } } as unknown as ClientStore;
    const ledger = { "2": [{}, {}] } as unknown as LedgerByAccount;
    const issue = checkDataHealth(accounts, clients).find((i) => i.kind === "duplicate-email")!;
    expect(isDuplicateKind(issue.kind)).toBe(true);
    expect(duplicateGroups(issue, accounts, clients, ledger)).toEqual([
      {
        shared: "نفس الإيميل",
        value: "same@example.com",
        members: [
          { accountId: "1", name: "جهاز 1", addedAt: "2026-01-01", lastSync: undefined, count: 0, countLabel: "عملية" },
          { accountId: "2", name: "جهاز 2", clientName: "زبون أ", addedAt: "2026-02-01", lastSync: "2026-10-01", count: 2, countLabel: "عملية" },
        ],
      },
    ]);
  });

  it("finds a device alone on the home screen by KIT, then email, then name", () => {
    expect(deviceSearchKey(device("1", { kitNumber: "KIT-9", expectedEmail: "a@example.com" }))).toBe("KIT-9");
    expect(deviceSearchKey(device("1", { expectedEmail: "a@example.com" }))).toBe("a@example.com");
    expect(deviceSearchKey(device("1", {}))).toBe("جهاز 1");
  });
});

describe("ownerOnly", () => {
  it("leaves the reps' devices and customers out", () => {
    const accounts = [device("1", {}), device("2", { representativeId: "r1" })];
    const clients = {
      c1: { id: "c1", name: "لي" },
      c2: { id: "c2", name: "للمندوب", repSegments: [{ repId: "r1", from: "2026-01-01T00:00:00.000Z" }] },
    } as unknown as ClientStore;
    const own = ownerOnly(accounts, clients);
    expect(own.accounts.map((a) => a.id)).toEqual(["1"]);
    expect(Object.keys(own.clients)).toEqual(["c1"]);
    expect(isRepDevice(accounts[1]!)).toBe(true);
    expect(isRepClient(clients.c2)).toBe(true);
  });
});
