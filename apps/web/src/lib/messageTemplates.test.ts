import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { LedgerByAccount } from "./ledgerStore";
import { buildAudience, fillTemplate } from "./messageTemplates";

const acc = (o: Partial<StarlinkAccountSummary>) => ({ id: "", name: "", rechargeDate: "", standbyDate: "", ...o }) as StarlinkAccountSummary;
const now = "2026-01-01T00:00:00Z";
const clients: ClientStore = {
  c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: now, updatedAt: now },
  c2: { id: "c2", name: "سالم", phone: "22233334444", createdAt: now, updatedAt: now },
};
const accounts = [
  acc({ id: "a", name: "منزل", clientId: "c1", rechargeDate: "2026/09/30", representativeId: "r1" }),
  acc({ id: "b", name: "مقهى", clientId: "c1", rechargeDate: "2026/09/20" }),
  acc({ id: "c", name: "دكان", clientId: "c2", rechargeDate: "2026/11/01" }),
  acc({ id: "z", name: "مؤرشف", clientId: "c2", rechargeDate: "2026/09/29", archivedAt: now }),
];
const e = (o: object) => ({ id: "x", kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date: "2026-09-10", createdAt: "x", ...o });
const ledger = { a: [e({ amount: 5000 }), e({ kind: "credit", amount: 2000 })], c: [e({ amount: 100 }), e({ kind: "credit", amount: 100 })] } as unknown as LedgerByAccount;
const input = { accounts, clients, ledger, today: new Date(2026, 8, 28), currencyLabel: (c: string) => (c === "MRU" ? "أوقية" : c) };

describe("bulk message templates", () => {
  it("fills every placeholder", () => {
    expect(fillTemplate("{الاسم} - {الجهاز} - {التاريخ} - {الأيام} - {المبلغ} - {الاسم}", { name: "م", device: "د", date: "01/10/2026", days: 3, amount: "5 أوقية" })).toBe(
      "م - د - 01/10/2026 - 3 - 5 أوقية - م",
    );
  });

  it("builds each audience", () => {
    expect(buildAudience("expiring", { ...input, days: 7 }).map((t) => [t.id, t.vars.days, t.vars.date])).toEqual([["a", 2, "30/09/2026"]]);
    expect(buildAudience("lapsed", input).map((t) => t.id)).toEqual(["b"]);
    expect(buildAudience("rep", { ...input, repId: "r1" }).map((t) => t.label)).toEqual(["منزل - محمد"]);
    expect(buildAudience("all", input).map((t) => t.id)).toEqual(["c1", "c2"]);
    expect(buildAudience("debtors", input)).toEqual([{ id: "c1", label: "محمد", phone: "22212345678", vars: { name: "محمد", amount: "3,000 أوقية" } }]);
  });
});
