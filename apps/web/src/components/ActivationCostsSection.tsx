"use client";

import { useEffect, useState } from "react";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { loadActivationCosts, saveActivationCosts, type ActivationCosts } from "@/lib/repActivation";
import { REP_ACTIVATION_PLANS } from "@/lib/telegramRepMessages";

/** ⚡ Each package's Starlink cost - used when a rep's activation is approved (recorded as D). */
export function ActivationCostsSection() {
  const [drafts, setDrafts] = useState<Record<string, { amount: string; currency: string }>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const costs = loadActivationCosts();
    setDrafts(Object.fromEntries(REP_ACTIVATION_PLANS.map((p) => [p, { amount: costs[p] ? String(costs[p]!.amount) : "", currency: costs[p]?.currency ?? "USD" }])));
  }, []);

  function update(plan: string, patch: Partial<{ amount: string; currency: string }>) {
    const current = drafts[plan] ?? { amount: "", currency: "USD" };
    const next = { ...drafts, [plan]: { ...current, ...patch } };
    setDrafts(next);
    const costs: ActivationCosts = {};
    for (const [p, d] of Object.entries(next)) {
      const value = Number(d.amount);
      if (value > 0) costs[p] = { amount: value, currency: d.currency };
    }
    saveActivationCosts(costs);
    setSaved(true);
  }

  return (
    <section className="section">
      <h2 className="section-title">⚡ تكلفة باقات التفعيل</h2>
      <p className="settings-hint">
        ما تدفعه لـ Starlink عن كل باقة. عند موافقتك على تفعيل من مندوب يُسجَّل تجديداً على الجهاز: الزبون عليه السعر، والتكلفة D حتى تدفعها، وحصة المندوب.
      </p>
      {REP_ACTIVATION_PLANS.map((plan) => {
        const draft = drafts[plan] ?? { amount: "", currency: "USD" };
        return (
          <div key={plan} className="rep-request-row activation-cost-row">
            <strong className="activation-cost-plan">{plan}</strong>
            <input
              className="search-input"
              dir="ltr"
              inputMode="decimal"
              placeholder="التكلفة"
              value={draft.amount}
              onChange={(e) => update(plan, { amount: e.target.value })}
              aria-label={`تكلفة ${plan}`}
            />
            <select className="search-input" value={draft.currency} onChange={(e) => update(plan, { currency: e.target.value })} aria-label={`عملة تكلفة ${plan}`}>
              {LEDGER_CURRENCIES.map((c) => (
                <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
              ))}
            </select>
          </div>
        );
      })}
      {saved && <p className="settings-hint">✓ حُفظت</p>}
    </section>
  );
}
