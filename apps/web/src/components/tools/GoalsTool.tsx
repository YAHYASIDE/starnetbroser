"use client";

import { useMemo, useState } from "react";
import { computeGoalProgress, loadGoals, type MonthlyGoals, saveGoals } from "@/lib/goals";
import { currencyLabelFor, currencyOptions, todayIso, type ToolsData } from "./useToolsData";

/** 🎯 This month's targets and how far along they are. */
export function GoalsTool({ data }: { data: ToolsData }) {
  const [goals, setGoals] = useState<MonthlyGoals>(() => (typeof window === "undefined" ? {} : loadGoals()));
  const [editing, setEditing] = useState(false);
  const currencies = currencyOptions(data.currencies);
  const [renewals, setRenewals] = useState(String(goals.renewals ?? ""));
  const [newClients, setNewClients] = useState(String(goals.newClients ?? ""));
  const [collection, setCollection] = useState(String(goals.collection?.amount ?? ""));
  const [collectionCurrency, setCollectionCurrency] = useState(goals.collection?.currency ?? currencies.find((c) => c.code === "MRU")?.code ?? currencies[0]!.code);
  const today = todayIso();
  const month = today.slice(0, 7);
  const label = currencyLabelFor(data.currencies);
  const progress = useMemo(() => computeGoalProgress(goals, month, today, data.ledger, data.clients), [goals, month, today, data.ledger, data.clients]);

  function save() {
    const next: MonthlyGoals = {
      ...(Number(renewals) > 0 ? { renewals: Number(renewals) } : {}),
      ...(Number(newClients) > 0 ? { newClients: Number(newClients) } : {}),
      ...(Number(collection) > 0 ? { collection: { amount: Number(collection), currency: collectionCurrency } } : {}),
    };
    saveGoals(next);
    setGoals(next);
    setEditing(false);
  }

  return (
    <div className="tool-body">
      {progress.length === 0 && !editing && <p className="settings-hint">لم تحدد أهدافاً بعد - حدد ما تريد تحقيقه كل شهر وتابع تقدمك يومياً.</p>}
      {!editing &&
        progress.map((g) => (
          <div key={g.key} className="tool-goal">
            <div className="tool-goal-head">
              <strong>{g.label}</strong>
              <span>
                <bdi dir="ltr">
                  {Math.round(g.done).toLocaleString("en-US")} / {g.target.toLocaleString("en-US")}
                </bdi>
                {g.currency ? ` ${label(g.currency)}` : ""}
              </span>
            </div>
            <span className="tool-bar-track">
              <span className={`tool-bar-fill${g.onPace ? "" : " tool-bar-behind"}`} style={{ width: `${g.ratio * 100}%` }} />
            </span>
            <small className={g.onPace ? "telegram-running" : "telegram-stopped"}>
              {g.ratio >= 1 ? "🎉 تحقق الهدف" : g.onPace ? "✓ على المسار" : `متأخر - المفروض ${Math.ceil(g.expected).toLocaleString("en-US")} حتى اليوم`}
            </small>
          </div>
        ))}
      {editing ? (
        <div className="tool-form">
          <label className="tool-field">
            <span>تجديدات وأجهزة هذا الشهر</span>
            <input className="search-input" inputMode="numeric" dir="ltr" value={renewals} onChange={(e) => setRenewals(e.target.value)} />
          </label>
          <label className="tool-field">
            <span>زبائن جدد</span>
            <input className="search-input" inputMode="numeric" dir="ltr" value={newClients} onChange={(e) => setNewClients(e.target.value)} />
          </label>
          <label className="tool-field">
            <span>التحصيل</span>
            <div className="tool-form-row">
              <input className="search-input" inputMode="decimal" dir="ltr" value={collection} onChange={(e) => setCollection(e.target.value)} />
              <select value={collectionCurrency} onChange={(e) => setCollectionCurrency(e.target.value)} aria-label="العملة">
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" onClick={save}>
              حفظ الأهداف
            </button>
            <button type="button" className="text-action" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-action" onClick={() => setEditing(true)}>
          ✎ {progress.length ? "تعديل الأهداف" : "تحديد الأهداف"}
        </button>
      )}
    </div>
  );
}
