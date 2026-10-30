import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client } from "./clientStore";
import type { LedgerEntry } from "./ledgerStore";
import { clientMatches, clientPickerInfo, detectPhone, isPhoneQuery, newClientInput } from "./clientPicker";

// Fake data only.
describe("👤 the device's customer field (his Oct 30 2026 asks)", () => {
  it("picks the country from a full number, keeps a short local one", () => {
    expect(detectPhone("212600000001", "+222")).toEqual({ dialCode: "+212", localNumber: "600000001" });
    expect(detectPhone("+213 500 000 001", "+222")).toEqual({ dialCode: "+213", localNumber: "500000001" });
    expect(detectPhone("0022320000001", "+222")).toEqual({ dialCode: "+223", localNumber: "20000001" });
    expect(detectPhone("22345678", "+222")).toEqual({ dialCode: "+222", localNumber: "22345678" });
    expect(detectPhone("4400 0000", "+223")).toEqual({ dialCode: "+223", localNumber: "44000000" });
  });

  it("a customer with only his number shows it as his name, marked «بلا اسم»", () => {
    expect(newClientInput("  DEMO  ", "22200000000")).toEqual({ name: "DEMO", phone: "22200000000", noName: false });
    expect(newClientInput("", "22200000000")).toEqual({ name: "22200000000", phone: "22200000000", noName: true });
    expect(newClientInput(" ", "")).toBeNull();
  });

  it("a searched number can be added; phone search ignores + and spaces", () => {
    expect(isPhoneQuery("+212 600 000")).toBe(true);
    expect(isPhoneQuery("12345")).toBe(false);
    expect(isPhoneQuery("DEMO 123456")).toBe(false);
    const client = { id: "c", name: "DEMO", phone: "212600000001" } as Client;
    expect(clientMatches(client, "+212 600")).toBe(true);
    expect(clientMatches(client, "demo")).toBe(true);
    expect(clientMatches(client, "999")).toBe(false);
  });

  it("sums his live devices' balances per currency", () => {
    const acc = (id: string, o: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, clientId: "c", ...o }) as StarlinkAccountSummary;
    const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "e", kind: "debit", amount: 0, currency: "MRU", note: "", email: "", date: "2026-10-01", createdAt: "", ...o });
    const info = clientPickerInfo("c", [acc("a"), acc("b"), acc("gone", { deletedAt: "2026-10-02" }), acc("x", { clientId: "other" })], {
      a: [e({ id: "1", amount: 5000 })],
      b: [e({ id: "2", amount: 1000 }), e({ id: "3", kind: "credit", amount: 1000 }), e({ id: "4", amount: 300, currency: "SIFA" })],
      gone: [e({ id: "5", amount: 999 })],
    });
    expect(info.devices).toBe(2);
    expect(info.owed).toEqual([["MRU", 5000], ["SIFA", 300]]);
  });
});
