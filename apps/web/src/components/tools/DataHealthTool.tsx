"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { checkDataHealth, healthScore } from "@/lib/dataHealth";
import { homeSearchHref } from "@/lib/homeActions";
import { applyPlanSuggestions, suggestRenewalPlans } from "@/lib/renewalPlanSuggest";
import type { ToolsData } from "./useToolsData";

/** 🩺 What's missing or inconsistent - each device links to its card on the home screen. */
export function DataHealthTool({ data }: { data: ToolsData }) {
  const issues = useMemo(
    () => checkDataHealth(data.accounts, data.clients, { ledger: data.ledger, currency: { accounts: data.accounts, clients: data.clients, reps: data.reps, ledger: data.ledger } }),
    [data.accounts, data.clients, data.reps, data.ledger],
  );
  const score = useMemo(() => healthScore(data.accounts, issues), [data.accounts, issues]);
  const tone = score >= 90 ? "good" : score >= 70 ? "warn" : "bad";
  const suggestions = useMemo(() => suggestRenewalPlans(data.accounts, data.ledger), [data.accounts, data.ledger]);
  const [filled, setFilled] = useState<string | null>(null);

  function fillPrices() {
    if (!window.confirm(`تحديد السعر الشهري لـ ${suggestions.length} جهاز من آخر تجديد لكل منها؟ (يمكن تعديله لاحقاً من البطاقة)`)) return;
    setFilled(data.saveAccounts(applyPlanSuggestions(data.accounts, suggestions)) ? `✓ حُدد السعر الشهري لـ ${suggestions.length} جهاز` : "غير متاح في وضع الخادم");
  }
  return (
    <div className="tool-body">
      <div className={`tool-score tool-score-${tone}`}>
        <strong>
          <bdi dir="ltr">{score}%</bdi>
        </strong>
        <span>من أجهزتك بياناتها سليمة</span>
      </div>
      {filled && <p className="settings-hint telegram-running">{filled}</p>}
      {issues.length === 0 && <p className="settings-hint">✓ لا توجد مشاكل - كل شيء مرتب.</p>}
      {issues.map((issue) => (
        <details key={issue.kind} className={`tool-issue tool-issue-${issue.severity}`}>
          <summary>
            <span className="tool-issue-title">{issue.title}</span>
            <span className="tool-count">{issue.items.length}</span>
          </summary>
          <p className="settings-hint">{issue.hint}</p>
          {issue.kind === "no-monthly-price" && suggestions.length > 0 && (
            <button type="button" className="dialog-primary" onClick={fillPrices}>
              🪄 تعبئة من آخر تجديد ({suggestions.length})
            </button>
          )}
          <ul className="tool-list">
            {issue.items.slice(0, 50).map((item, index) => (
              <li key={`${item.accountId ?? item.clientId}-${index}`}>
                <Link href={homeSearchHref(item.label)} className="tool-link">
                  {item.accountId ? "📡" : "👤"} {item.label}
                </Link>
                {item.detail && (
                  <small>
                    <bdi dir="ltr">{item.detail}</bdi>
                  </small>
                )}
              </li>
            ))}
          </ul>
          {issue.items.length > 50 && <p className="settings-hint">و{issue.items.length - 50} غيرها…</p>}
        </details>
      ))}
    </div>
  );
}
