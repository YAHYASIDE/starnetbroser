"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDailyPlan, type PlanTask } from "@/lib/dailyPlan";
import { checkDataHealth } from "@/lib/dataHealth";
import { computeDebtAging } from "@/lib/debtAging";
import { listClients } from "@/lib/clientStore";
import { homeSearchHref } from "@/lib/homeActions";
import { loadPromises } from "@/lib/paymentPromises";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { currencyLabelFor, todayIso, type ToolsData } from "./useToolsData";

const DONE_KEY = "starnet.dailyPlanDone";

function loadDone(today: string): Set<string> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "{}") as { day?: string; ids?: string[] };
    return new Set(saved.day === today ? saved.ids ?? [] : []);
  } catch {
    return new Set();
  }
}

const KIND_LABEL: Record<PlanTask["kind"], string> = {
  renewal: "تجديد",
  promise: "وعد دفع",
  debt: "دين قديم",
  winback: "استرجاع",
  data: "بيانات",
};

/** ✅ Today's checklist - ticks are remembered for the day on this phone only. */
export function TodayPlanTool({ data }: { data: ToolsData }) {
  const today = todayIso();
  const [done, setDone] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : loadDone(today)));
  const [showDone, setShowDone] = useState(false);
  const plan = useMemo(() => {
    const debtors = computeDebtAging({
      clients: listClients(data.clients),
      accounts: data.accounts,
      invoices: data.invoices,
      adjustments: data.adjustments,
      ledgerStore: data.ledger,
      today,
    });
    return buildDailyPlan({
      accounts: data.accounts,
      clients: data.clients,
      promises: loadPromises(),
      debtors,
      issues: checkDataHealth(data.accounts, data.clients, { ledger: data.ledger }),
      today,
      currencyLabel: currencyLabelFor(data.currencies),
    });
  }, [data, today]);

  function toggle(id: string) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    try {
      window.localStorage.setItem(DONE_KEY, JSON.stringify({ day: today, ids: [...next] }));
    } catch {
      // storage full
    }
  }

  const open = plan.filter((t) => !done.has(t.id));
  const finished = plan.length - open.length;
  const visible = showDone ? plan : open;
  return (
    <div className="tool-body">
      <div className="tool-goal">
        <div className="tool-goal-head">
          <strong>{open.length === 0 ? (plan.length ? "🎉 أنجزت كل مهام اليوم" : "✓ لا مهام اليوم") : `${open.length} مهمة متبقية`}</strong>
          <span>
            <bdi dir="ltr">
              {finished}/{plan.length}
            </bdi>
          </span>
        </div>
        <span className="tool-bar-track">
          <span className="tool-bar-fill" style={{ width: `${plan.length ? (finished / plan.length) * 100 : 100}%` }} />
        </span>
      </div>
      <ul className="tool-list">
        {visible.map((task) => {
          const link = task.message ? buildWhatsAppLink(task.phone, task.message) : null;
          const isDone = done.has(task.id);
          return (
            <li key={task.id} className={`plan-task${isDone ? " plan-task-done" : ""}`}>
              <button type="button" className="plan-check" aria-pressed={isDone} aria-label={isDone ? "إلغاء الإنجاز" : "تم"} onClick={() => toggle(task.id)}>
                {isDone ? "✓" : ""}
              </button>
              <div className="plan-task-body">
                {task.search ? (
                  <Link href={homeSearchHref(task.search)} className="tool-link">
                    {task.title}
                  </Link>
                ) : task.kind === "data" ? (
                  <Link href="/tools#health" className="tool-link">
                    {task.title}
                  </Link>
                ) : (
                  <strong>{task.title}</strong>
                )}
                <small>
                  <span className={`plan-kind plan-kind-${task.kind}`}>{KIND_LABEL[task.kind]}</span> {task.detail}
                </small>
              </div>
              {link && (
                <a className="tool-wa" href={link} target="_blank" rel="noreferrer" onClick={() => !isDone && toggle(task.id)}>
                  واتساب
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {finished > 0 && (
        <button type="button" className="text-action" onClick={() => setShowDone((v) => !v)}>
          {showDone ? "إخفاء المنجزة" : `عرض المنجزة (${finished})`}
        </button>
      )}
    </div>
  );
}
