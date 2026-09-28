"use client";

import Link from "next/link";
import { useMemo } from "react";
import { checkDataHealth, healthScore } from "@/lib/dataHealth";
import { homeSearchHref } from "@/lib/homeActions";
import type { ToolsData } from "./useToolsData";

/** 🩺 What's missing or inconsistent - each device links to its card on the home screen. */
export function DataHealthTool({ data }: { data: ToolsData }) {
  const issues = useMemo(() => checkDataHealth(data.accounts, data.clients), [data.accounts, data.clients]);
  const score = useMemo(() => healthScore(data.accounts, issues), [data.accounts, issues]);
  const tone = score >= 90 ? "good" : score >= 70 ? "warn" : "bad";
  return (
    <div className="tool-body">
      <div className={`tool-score tool-score-${tone}`}>
        <strong>
          <bdi dir="ltr">{score}%</bdi>
        </strong>
        <span>من أجهزتك بياناتها سليمة</span>
      </div>
      {issues.length === 0 && <p className="settings-hint">✓ لا توجد مشاكل - كل شيء مرتب.</p>}
      {issues.map((issue) => (
        <details key={issue.kind} className={`tool-issue tool-issue-${issue.severity}`}>
          <summary>
            <span className="tool-issue-title">{issue.title}</span>
            <span className="tool-count">{issue.items.length}</span>
          </summary>
          <p className="settings-hint">{issue.hint}</p>
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
