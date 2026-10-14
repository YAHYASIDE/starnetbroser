import { describe, expect, it } from "vitest";
import type { BankSuggestion } from "./bankNotices";
import { canLearn, deleteRule, learnRule, readySuggestions, ruleFor } from "./bankRules";
import type { MoneyAccount } from "./moneyAccounts";

// Fake names and numbers only.
const bankily = { id: "acc-bankily", name: "بنكيلي", icon: "🟢", currencyCode: "MRU", method: "bankily", openingBalance: 0 } as unknown as MoneyAccount;
const sug = (id: string, o: Partial<BankSuggestion> = {}): BankSuggestion => ({
  id,
  kind: "in",
  app: "bankily",
  at: new Date(2026, 9, 10, 9).getTime(),
  amount: 5000,
  currencyCode: "MRU",
  party: { name: "DEMO PERSON", number: "40000001" },
  notices: [],
  status: "pending",
  ...o,
});
const device = { id: "dev1", name: "جهاز تجريبي" };

describe("🧠 rules learned on confirm", () => {
  const rules = learnRule([], sug("a"), { account: bankily, choice: { type: "customer", device } }, "👤 دفعة زبون: جهاز تجريبي", new Date("2026-10-10T10:00:00Z"));

  it("one rule per number + direction; a later one replaces it", () => {
    expect(rules).toEqual([{ number: "40000001", direction: "in", accountId: "acc-bankily", choice: { type: "customer", device }, label: "👤 دفعة زبون: جهاز تجريبي", name: "DEMO PERSON", createdAt: "2026-10-10T10:00:00.000Z" }]);
    const again = learnRule(rules, sug("b", { party: { number: "+22240000001" } }), { account: bankily, choice: { type: "income", categoryId: "other" } }, "💵 دخل");
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ number: "40000001", choice: { type: "income" } });
    // the same number sending money out is another rule
    expect(learnRule(rules, sug("c", { kind: "out" }), { account: bankily, choice: { type: "expense", categoryId: "food" } }, "🧾")).toHaveLength(2);
  });

  it("not learned: no number, a transfer between my apps, a debt repayment", () => {
    expect(canLearn(sug("x", { party: { name: "بلا رقم" } }), { type: "income", categoryId: "o" })).toBe(false);
    expect(canLearn(sug("x", { kind: "transfer" }), { type: "income", categoryId: "o" })).toBe(false);
    expect(canLearn(sug("x"), { type: "debt-payment", debtId: "d" })).toBe(false);
  });

  it("the next waiting ones from that number come out ready - never a possible duplicate, never a deleted account", () => {
    const pending = [sug("n1", { amount: 7000 }), sug("n2", { maybeDuplicate: true }), sug("n3", { party: { number: "40000009" } }), sug("n4", { kind: "out" })];
    const ready = readySuggestions(pending, rules, [bankily]);
    expect(ready.map((r) => r.suggestion.id)).toEqual(["n1"]);
    expect(ready[0]!.input).toMatchObject({ account: bankily, direction: "in", amount: 7000, currencyCode: "MRU", date: "2026-10-10", choice: { type: "customer", device } });
    expect(readySuggestions(pending, rules, [])).toEqual([]);
    expect(ruleFor(deleteRule(rules, "40000001", "in"), sug("n1"))).toBeUndefined();
  });
});
