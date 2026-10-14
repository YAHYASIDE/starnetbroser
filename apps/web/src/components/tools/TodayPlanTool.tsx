"use client";

import { isRepWorkspace } from "@/lib/repMode";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "@/components/AccountsSection";
import { buildDailyPlan, type PlanTask } from "@/lib/dailyPlan";
import { duePins, loadDeviceNotes } from "@/lib/deviceNotes";
import { checkDataHealth, type HealthIssue, type HealthIssueKind } from "@/lib/dataHealth";
import { deviceSearchKey, duplicateGroups, isDuplicateKind } from "@/lib/duplicateProof";
import { computeBalanceByCurrency } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { ownerOnly } from "@/lib/repSeparation";
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
  pin: "مثبت",
};

/** ✅ Today's checklist - ticks are remembered for the day on this phone only. */
export function TodayPlanTool({ data }: { data: ToolsData }) {
  const today = todayIso();
  const [done, setDone] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : loadDone(today)));
  const [showDone, setShowDone] = useState(false);
  // 📡 a device opened from a task / 🩺 a data problem opened with its devices and proof.
  const [sheet, setSheet] = useState<{ kind: "device"; accountId: string } | { kind: "issue"; issueKind: HealthIssueKind } | null>(null);
  // 🤝 The reps follow their own devices and customers - only his own here (his Oct 2026 ask).
  // (On the rep's own phone every device is his - nothing is left out there.)
  const own = useMemo(() => (isRepWorkspace() ? { accounts: data.accounts, clients: data.clients } : ownerOnly(data.accounts, data.clients)), [data.accounts, data.clients]);
  const issues = useMemo(
    () =>
      checkDataHealth(own.accounts, own.clients, {
        ledger: data.ledger,
        // 💱 currency problems on every device, the reps' included (his Oct 2026 ask).
        currency: { accounts: data.accounts, clients: data.clients, reps: data.reps, ledger: data.ledger, repWorkspace: isRepWorkspace() },
      }),
    [own, data.accounts, data.clients, data.reps, data.ledger],
  );
  const plan = useMemo(() => {
    const debtors = computeDebtAging({
      clients: listClients(own.clients),
      accounts: own.accounts,
      invoices: data.invoices,
      adjustments: data.adjustments,
      ledgerStore: data.ledger,
      today,
    });
    return buildDailyPlan({
      accounts: own.accounts,
      clients: own.clients,
      promises: loadPromises(),
      debtors,
      issues,
      today,
      currencyLabel: currencyLabelFor(data.currencies),
      pins: duePins(loadDeviceNotes(), data.accounts, today),
    });
  }, [data, own, issues, today]);

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
                {task.accountId ? (
                  <button type="button" className="tool-link plan-open" onClick={() => setSheet({ kind: "device", accountId: task.accountId! })}>
                    {task.title}
                  </button>
                ) : task.issueKind ? (
                  <button type="button" className="tool-link plan-open" onClick={() => setSheet({ kind: "issue", issueKind: task.issueKind! })}>
                    {task.title}
                  </button>
                ) : task.search ? (
                  <Link href={homeSearchHref(task.search)} className="tool-link">
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
      {sheet?.kind === "device" && (
        <DeviceSheet
          account={data.accounts.find((a) => a.id === sheet.accountId)}
          data={data}
          task={plan.find((t) => t.accountId === sheet.accountId)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "issue" && (
        <IssueSheet issue={issues.find((i) => i.kind === sheet.issueKind)} data={data} onOpenDevice={(id) => setSheet({ kind: "device", accountId: id })} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/** 📡 The device behind a task, right here: who, where, when it renews, what it owes - and the way
 * to its own card on the home screen. */
function DeviceSheet({ account, data, task, onClose }: { account?: StarlinkAccountSummary; data: ToolsData; task?: PlanTask; onClose: () => void }) {
  if (!account) {
    return (
      <PartySheet title="الجهاز" onClose={onClose}>
        <p className="party-empty">لم يعد هذا الجهاز موجودًا.</p>
      </PartySheet>
    );
  }
  const client = account.clientId ? data.clients[account.clientId] : undefined;
  const owed = Object.entries(computeBalanceByCurrency(data.ledger[account.id] ?? [])).filter(([, v]) => (v ?? 0) > 0.005);
  const phone = account.phone || client?.phone;
  const link = task?.message ? buildWhatsAppLink(task.phone ?? phone, task.message) : null;
  const rows: [string, string | undefined][] = [
    ["👤 الزبون", client?.name],
    ["📞 الهاتف", phone],
    ["✉️ الإيميل", account.starlinkAccountEmail || account.expectedEmail],
    ["🔢 KIT", account.kitNumber],
    ["📅 التجديد", account.rechargeDate || account.standbyDate],
    ["💰 عليه", owed.map(([code, v]) => `${formatAmount(Math.round(v! * 100) / 100)} ${currencyLabelFor(data.currencies)(code)}`).join(" + ") || undefined],
  ];
  return (
    <PartySheet title={`📡 ${account.name}`} onClose={onClose}>
      <ul className="plan-device-facts">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <bdi dir="ltr">{value}</bdi>
            </li>
          ))}
      </ul>
      <div className="settings-actions">
        <Link href={homeSearchHref(deviceSearchKey(account))} className="dialog-primary">
          📡 افتح الجهاز
        </Link>
        {link && (
          <a className="tool-wa" href={link} target="_blank" rel="noreferrer">
            واتساب
          </a>
        )}
      </div>
    </PartySheet>
  );
}

/** 🩺 A data problem with its devices - for a duplicate, each group side by side with the proof
 * (the shared email / KIT / phone) and what tells them apart, and the way to merge them. */
/** 💱 «✓ صحيحة»: the operation (or the monthly price) really is in that currency - never flagged again. */
function confirmCurrency(data: ToolsData, accountId: string, entryId: string | undefined) {
  if (entryId) {
    const entries = data.ledger[accountId] ?? [];
    data.saveLedger({ ...data.ledger, [accountId]: entries.map((e) => (e.id === entryId ? { ...e, currencyConfirmed: true } : e)) });
    return;
  }
  data.saveAccounts(
    data.accounts.map((a) => (a.id === accountId && a.renewalPlan ? { ...a, renewalPlan: { ...a.renewalPlan, currencyConfirmed: true } } : a)),
  );
}

function IssueSheet({ issue, data, onOpenDevice, onClose }: { issue?: HealthIssue; data: ToolsData; onOpenDevice: (id: string) => void; onClose: () => void }) {
  if (!issue) {
    return (
      <PartySheet title="🩺 البيانات" onClose={onClose}>
        <p className="party-empty">✓ لم تعد هذه المشكلة موجودة.</p>
      </PartySheet>
    );
  }
  const groups = isDuplicateKind(issue.kind) ? duplicateGroups(issue, data.accounts, data.clients, data.ledger) : [];
  return (
    <PartySheet title={`🩺 ${issue.title}`} onClose={onClose}>
      <p className="settings-hint">{issue.hint}</p>
      {groups.length > 0 ? (
        groups.map((group) => (
          <div key={group.value} className="dup-group">
            <div className="dup-proof">
              <span>🔗 {group.shared}</span>
              <bdi dir="ltr">{group.value}</bdi>
            </div>
            <ul className="dup-members">
              {group.members.map((m, i) => (
                <li key={m.accountId ?? m.clientId ?? i}>
                  <strong>
                    {i === 0 ? "🅰️" : "🅱️"} {m.name}
                  </strong>
                  <small>
                    {m.clientName ? `👤 ${m.clientName} · ` : ""}
                    أُضيف <bdi dir="ltr">{m.addedAt ?? "؟"}</bdi>
                    {m.accountId ? (
                      <>
                        {" "}· آخر مزامنة <bdi dir="ltr">{m.lastSync ?? "لم يُزامن"}</bdi>
                      </>
                    ) : null}{" "}
                    · {m.count} {m.countLabel}
                  </small>
                  {m.accountId && (
                    <button type="button" className="text-action" onClick={() => onOpenDevice(m.accountId!)}>
                      افتح
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Link href={homeSearchHref(group.value)} className="dialog-primary dup-merge">
              🔗 اعرضهما للدمج
            </Link>
          </div>
        ))
      ) : (
        <ul className="dup-members">
          {issue.items.map((item, i) => (
            <li key={item.accountId ?? item.clientId ?? i}>
              <strong>{item.label}</strong>
              {item.detail && <small dir="auto">{item.detail}</small>}
              {item.accountId && (
                <button type="button" className="text-action" onClick={() => onOpenDevice(item.accountId!)}>
                  افتح
                </button>
              )}
              {issue.kind === "currency-mismatch" && item.accountId && (
                <button type="button" className="text-action" onClick={() => confirmCurrency(data, item.accountId!, item.entryId)}>
                  ✓ صحيحة
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </PartySheet>
  );
}
