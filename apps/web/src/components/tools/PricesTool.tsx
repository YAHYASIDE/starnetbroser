"use client";

import { useMemo, useState } from "react";
import { applyPlanChange, groupPlans, type PlanGroup, validatePlanChange } from "@/lib/planPrices";
import { currencyLabelFor, type ToolsData } from "./useToolsData";

/** 💲 Every monthly price in use, and a bulk change for one of them. */
export function PricesTool({ data }: { data: ToolsData }) {
  const groups = useMemo(() => groupPlans(data.accounts), [data.accounts]);
  const label = currencyLabelFor(data.currencies);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const withoutPrice = data.accounts.filter((a) => !a.deletedAt && !a.archivedAt && !a.renewalPlan).length;
  return (
    <div className="tool-body">
      <p className="settings-hint">غيّر سعراً مرة واحدة لكل الأجهزة التي تحمله - يطبَّق على التجديدات القادمة فقط، ولا يغيّر أي عملية مسجلة.</p>
      {message && <p className="settings-hint telegram-running">{message}</p>}
      {groups.length === 0 && <p className="settings-hint">لا توجد أسعار شهرية بعد.</p>}
      <ul className="tool-list">
        {groups.map((group) =>
          editing === group.key ? (
            <PriceEditor
              key={group.key}
              group={group}
              label={label}
              onCancel={() => setEditing(null)}
              onSave={(change) => {
                const problem = validatePlanChange(change);
                if (problem) return problem;
                const { accounts, changed } = applyPlanChange(data.accounts, group.key, change);
                if (!data.saveAccounts(accounts)) return "غير متاح في وضع الخادم";
                setEditing(null);
                setMessage(`✓ تغيّر السعر في ${changed} جهاز`);
                return null;
              }}
            />
          ) : (
            <li key={group.key} className="tool-row">
              <div>
                <strong>
                  <bdi dir="ltr">{group.plan.saleAmount.toLocaleString("en-US")}</bdi> {label(group.plan.saleCurrency)}
                </strong>
                <small>
                  تكلفة Starlink <bdi dir="ltr">{group.plan.costAmount.toLocaleString("en-US")}</bdi> {label(group.plan.costCurrency)} · 📡 {group.accountIds.length} جهاز
                </small>
              </div>
              <button type="button" className="text-action" onClick={() => setEditing(group.key)}>
                ✎ تغيير
              </button>
            </li>
          ),
        )}
      </ul>
      {withoutPrice > 0 && <p className="settings-hint">⚠️ {withoutPrice} جهاز بدون سعر شهري - «فحص البيانات» يستطيع تعبئتها من آخر تجديد.</p>}
    </div>
  );
}

function PriceEditor({
  group,
  label,
  onCancel,
  onSave,
}: {
  group: PlanGroup;
  label: (code: string) => string;
  onCancel: () => void;
  onSave: (change: { saleAmount?: number; costAmount?: number }) => string | null;
}) {
  const [sale, setSale] = useState(String(group.plan.saleAmount));
  const [cost, setCost] = useState(String(group.plan.costAmount));
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="tool-form tool-quote-line">
      <label className="tool-field">
        <span>سعر البيع ({label(group.plan.saleCurrency)})</span>
        <input className="search-input" inputMode="decimal" dir="ltr" value={sale} onChange={(e) => setSale(e.target.value)} />
      </label>
      <label className="tool-field">
        <span>تكلفة Starlink ({label(group.plan.costCurrency)})</span>
        <input className="search-input" inputMode="decimal" dir="ltr" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button
          type="button"
          className="dialog-primary"
          onClick={() => {
            if (!window.confirm(`تطبيق السعر الجديد على ${group.accountIds.length} جهاز؟`)) return;
            setError(onSave({ saleAmount: Number(sale), costAmount: Number(cost) }));
          }}
        >
          تطبيق على {group.accountIds.length} جهاز
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </li>
  );
}
