// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadWipeUndo, undoWipe, wipeAllTransactions } from "./wipeTransactions";

describe("«حذف كل المعاملات»", () => {
  beforeEach(() => localStorage.clear());

  it("removes the money records, keeps devices / customers / reps, zeroes the banks and restarts monthly rules", () => {
    localStorage.setItem("starnet_customer_ledger_v1", JSON.stringify({ a1: [{ id: "e1" }] }));
    localStorage.setItem("starnet_cash_entries_v1", JSON.stringify([{ id: "c1" }]));
    localStorage.setItem("starnet_personal_debts_v1", JSON.stringify({ debts: [{ id: "d1" }], payments: [] }));
    localStorage.setItem("starnet_demo_accounts_v1", JSON.stringify([{ id: "a1" }]));
    localStorage.setItem("starnet_clients_v1", JSON.stringify({ c1: { id: "c1" } }));
    localStorage.setItem("starnet_representatives_v1", JSON.stringify({ r1: { id: "r1" } }));
    localStorage.setItem(
      "starnet_money_accounts_v1",
      JSON.stringify({ accounts: [{ id: "b1", name: "بنكيلي", openingBalance: 5000, openingDate: "2026-01-01" }], adjustments: [{ id: "x" }], transfers: [{ id: "t" }], seeded: true }),
    );
    localStorage.setItem("starnet_recurring_v1", JSON.stringify([{ id: "r", kind: "income", day: 5, startMonth: "2026-01", skipped: ["2026-02"] }]));

    expect(wipeAllTransactions(localStorage, "2026-10-04")).toEqual({ ok: true });

    expect(localStorage.getItem("starnet_customer_ledger_v1")).toBeNull();
    expect(localStorage.getItem("starnet_cash_entries_v1")).toBeNull();
    expect(localStorage.getItem("starnet_personal_debts_v1")).toBeNull();
    expect(localStorage.getItem("starnet_demo_accounts_v1")).not.toBeNull();
    expect(localStorage.getItem("starnet_clients_v1")).not.toBeNull();
    expect(localStorage.getItem("starnet_representatives_v1")).not.toBeNull();
    const book = JSON.parse(localStorage.getItem("starnet_money_accounts_v1")!);
    expect(book).toEqual({ accounts: [{ id: "b1", name: "بنكيلي", openingBalance: 0, openingDate: "2026-10-04" }], adjustments: [], transfers: [], seeded: true });
    expect(JSON.parse(localStorage.getItem("starnet_recurring_v1")!)[0]).toMatchObject({ startMonth: "2026-10", skipped: [] });
  });

  it("everything comes back with «↩️ استرجاع»", () => {
    localStorage.setItem("starnet_customer_ledger_v1", JSON.stringify({ a1: [{ id: "e1" }] }));
    localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [{ id: "b1", openingBalance: 5000, openingDate: "2026-01-01" }], adjustments: [] }));
    wipeAllTransactions(localStorage, "2026-10-04");
    expect(loadWipeUndo(localStorage)).not.toBeNull();
    expect(undoWipe(localStorage)).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem("starnet_customer_ledger_v1")!)).toEqual({ a1: [{ id: "e1" }] });
    expect(JSON.parse(localStorage.getItem("starnet_money_accounts_v1")!).accounts[0].openingBalance).toBe(5000);
    expect(loadWipeUndo(localStorage)).toBeNull();
    expect(localStorage.getItem("starnet_cash_entries_v1")).toBeNull();
  });
});
