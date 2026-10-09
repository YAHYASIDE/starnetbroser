"use client";

/**
 * 📊 The dashboard's phase-2 sections (his Oct 9 2026 brief): «🔔 مركز التنبيهات», «🎯 الأهداف المالية»,
 * «💳 مصادر الأموال والتحصيلات», «📡 تحليل اشتراكات Starlink», «🧾 ديون العملاء», «🏭 ديون الموردين».
 * Every figure comes from lib/ (alertCenter, financeGoals, moneyMovements, financeStarlink,
 * financeDebts); a tap on a figure opens the records that made it (DrillSheet).
 */

import { ReactNode, useMemo, useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { homeSearchHref } from "@/lib/homeActions";
import { LEDGER_CURRENCY_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/ledgerStore";
import {
  ALERT_TYPES,
  GROUP_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type AlertRules,
  type AlertSeverity,
  type AlertStates,
  type AlertType,
  type CenterAlert,
} from "@/lib/alertCenter";
import { GOAL_DEFS, type Forecast, type GoalProgressItem, type GoalValues } from "@/lib/financeGoals";
import { COLLECTION_KINDS, movementKindLabel, type KindSummary, type Movement, type PlaceStatement, type SeriesBucket } from "@/lib/moneyMovements";
import type { GroupRow, RenewalRow, StarlinkBook } from "@/lib/financeStarlink";
import { FINE_BUCKET_LABELS, type CustomerDebts, type DebtorRow, type FineBuckets, type SupplierDebts } from "@/lib/financeDebts";
import type { DashAlert } from "@/lib/financeAnalysis";
import { PartySheet } from "./AccountsSection";
import { Bars } from "./FinanceCharts";

export const NO_DATA = "لا توجد بيانات كافية";

export function mru(value: number, approx = false): string {
  return `${approx ? "≈ " : ""}${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

/** For plain text: the number isolated left-to-right (U+2066 … U+2069), its currency after it. */
function money(value: number, currency: string): string {
  const label = currency === "" ? "" : (LEDGER_CURRENCY_LABELS as Record<string, string>)[currency] ?? currency;
  return `\u2066${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value * 100) / 100))}\u2069${label ? ` ${label}` : ""}`;
}

/** An amount with its currency: the number LTR-isolated, the currency's name after it in the
 * Arabic text (so «+1,000 أوقية» never reads «أوقية +1,000»). */
export function MoneyText({ value, currency, signed }: { value: number; currency: string; signed?: boolean }) {
  const label = currency === "" ? "" : (LEDGER_CURRENCY_LABELS as Record<string, string>)[currency] ?? currency;
  return (
    <span className="money-text">
      <bdi dir="ltr">{`${value < 0 ? "-" : signed && value > 0 ? "+" : ""}${formatAmount(Math.abs(Math.round(value * 100) / 100))}`}</bdi>
      {label ? ` ${label}` : ""}
    </span>
  );
}

// ---- Drill-down: the records behind a figure ----

export interface DrillRow {
  key: string;
  date: string;
  label: string;
  sub?: string;
  /** Signed amount in its own currency. */
  amount?: number;
  currency?: string;
  tone?: "good" | "bad";
  href?: string;
}

export interface Drill {
  title: string;
  rows: DrillRow[];
  note?: string;
}

export function DrillSheet({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of drill.rows) if (r.amount !== undefined && r.currency !== undefined) t[r.currency] = (t[r.currency] ?? 0) + r.amount;
    return t;
  }, [drill]);
  const shown = drill.rows.slice(0, 300);
  return (
    <PartySheet title={drill.title} onClose={onClose}>
      <div className="dash-drill">
        <p className="dash-period-note">
          {drill.rows.length} سجل
          {Object.entries(totals).map(([code, v]) => (
            <span key={code}>
              {" "}
              · <MoneyText value={v} currency={code} />
            </span>
          ))}
        </p>
        {drill.note && <p className="settings-hint">{drill.note}</p>}
        {shown.length === 0 ? (
          <p className="party-empty">لا توجد سجلات.</p>
        ) : (
          <ul className="dash-drill-list">
            {shown.map((r) => {
              const body = (
                <>
                  <span className="dash-drill-main">
                    <strong>{r.label}</strong>
                    <small>
                      <bdi dir="ltr">{r.date}</bdi>
                      {r.sub ? ` · ${r.sub}` : ""}
                    </small>
                  </span>
                  {r.amount !== undefined && (
                    <span className={`dash-drill-amount${r.tone === "bad" || (r.tone === undefined && r.amount < 0) ? " dash-change-bad" : r.tone === "good" ? " dash-change-good" : ""}`}>
                      <MoneyText value={r.amount} currency={r.currency ?? ""} signed={r.tone !== undefined} />
                    </span>
                  )}
                </>
              );
              return <li key={r.key}>{r.href ? <a href={r.href}>{body}</a> : <div>{body}</div>}</li>;
            })}
          </ul>
        )}
        {drill.rows.length > shown.length && <p className="settings-hint">أول {shown.length} فقط.</p>}
      </div>
    </PartySheet>
  );
}

function movementRow(m: Movement): DrillRow {
  return {
    key: m.id,
    date: m.date,
    label: m.label,
    sub: `${movementKindLabel(m.kind)}${m.party?.name ? ` · ${m.party.name}` : ""}`,
    amount: m.direction === "in" ? m.amount : -m.amount,
    currency: m.currency,
    tone: m.direction === "in" ? "good" : "bad",
  };
}

function renewalRow(r: RenewalRow): DrillRow {
  const cost = r.costState === "settled" ? "مسددة لستارلينك" : r.costState === "pending" ? "تكلفة غير مسددة (D)" : "بلا تكلفة";
  return {
    key: r.entryId,
    date: r.date,
    label: `${r.device}${r.client ? ` · ${r.client}` : ""}`,
    sub: `بيع ${money(r.sale, r.currency)} · دفع ${money(r.paid, r.currency)} · ${cost}${r.complete ? ` · هامش ${mru(r.marginMru!)}${r.marginPct !== undefined ? ` (${Math.round(r.marginPct)}%)` : ""}` : " · بيانات غير مكتملة"}`,
    amount: r.marginMru,
    currency: "MRU",
    href: homeSearchHref(r.device),
  };
}

function MiniBtn({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone: "good" | "bad" | "warn" | "rev" | "neutral"; onClick?: () => void }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>
        <bdi dir="ltr">{value}</bdi>
      </strong>
      {sub && <small>{sub}</small>}
    </>
  );
  return onClick ? (
    <button type="button" className={`dash-mini dash-mini-btn dash-mini-${tone}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`dash-mini dash-mini-${tone}`}>{body}</div>
  );
}

function Pct({ value }: { value: number | null }) {
  if (value === null) return <small className="dash-change dash-change-none">لا قاعدة مقارنة</small>;
  return (
    <small className={`dash-change ${value >= 0 ? "dash-change-good" : "dash-change-bad"}`}>
      <bdi dir="ltr">{`${value > 0 ? "+" : ""}${Math.round(value)}%`}</bdi>
    </small>
  );
}

const pctChange = (now: number, before: number): number | null => (before > 0.5 ? ((now - before) / before) * 100 : null);

// ---- 🔔 Alert center ----

type AlertFilter = "active" | "new" | "acknowledged" | "resolved";

export function AlertCenterBody({
  alerts,
  states,
  periodAlerts,
  onReview,
  onAck,
  onOpen,
}: {
  alerts: CenterAlert[];
  states: AlertStates;
  periodAlerts: DashAlert[];
  onReview: (key: string) => void;
  onAck: (alert: CenterAlert) => void;
  onOpen: (alert: CenterAlert) => void;
}) {
  const [filter, setFilter] = useState<AlertFilter>("active");
  const [open, setOpen] = useState<string | null>(null);
  const statusOf = (key: string) => states[key]?.status ?? "new";
  const active = alerts.filter((a) => ["new", "reviewed"].includes(statusOf(a.key)));
  const counts: Record<AlertFilter, number> = {
    active: active.length,
    new: alerts.filter((a) => statusOf(a.key) === "new").length,
    acknowledged: alerts.filter((a) => statusOf(a.key) === "acknowledged").length,
    resolved: Object.values(states).filter((s) => s.status === "resolved").length,
  };
  const shown = filter === "active" ? active : filter === "resolved" ? [] : alerts.filter((a) => statusOf(a.key) === filter);
  const resolved = Object.entries(states)
    .filter(([, s]) => s.status === "resolved")
    .sort((a, b) => ((a[1].resolvedAt ?? "") < (b[1].resolvedAt ?? "") ? 1 : -1));
  const chips: { id: AlertFilter; label: string }[] = [
    { id: "active", label: "النشطة" },
    { id: "new", label: "الجديدة" },
    { id: "acknowledged", label: "تمت المعالجة" },
    { id: "resolved", label: "تم حلّها" },
  ];
  return (
    <>
      <div className="dash-chips" role="radiogroup" aria-label="حالة التنبيه">
        {chips.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={filter === c.id} className={`dash-chip${filter === c.id ? " dash-chip-on" : ""}`} onClick={() => setFilter(c.id)}>
            {c.label} ({counts[c.id]})
          </button>
        ))}
      </div>
      {filter === "resolved" ? (
        resolved.length === 0 ? (
          <p className="party-empty">لا تنبيهات محلولة في آخر 60 يومًا.</p>
        ) : (
          <ul className="dash-center">
            {resolved.map(([key, s]) => (
              <li key={key} className={`dash-center-item dash-sev-${s.severity} dash-center-resolved`}>
                <div className="dash-center-head">
                  <span className="dash-sev-badge">✓</span>
                  <span className="dash-center-title">{s.title}</span>
                </div>
                <small className="dash-center-meta">
                  ظهر <bdi dir="ltr">{s.firstSeen.slice(0, 16).replace("T", " ")}</bdi> · زال سببه <bdi dir="ltr">{(s.resolvedAt ?? "").slice(0, 16).replace("T", " ")}</bdi>
                </small>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <p className="party-empty">✅ لا تنبيهات هنا.</p>
      ) : (
        <ul className="dash-center">
          {shown.map((a) => {
            const s = states[a.key];
            const isOpen = open === a.key;
            return (
              <li key={a.key} className={`dash-center-item dash-sev-${a.severity}`}>
                <button type="button" className="dash-center-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.key)}>
                  <span className="dash-sev-badge">{SEVERITY_LABELS[a.severity]}</span>
                  <span className="dash-center-title">{a.title}</span>
                  {statusOf(a.key) === "new" && <span className="dash-center-new">جديد</span>}
                </button>
                <small className="dash-center-meta">
                  {GROUP_LABELS[a.group]} · {STATUS_LABELS[statusOf(a.key)]}
                  {s ? (
                    <>
                      {" "}
                      · منذ <bdi dir="ltr">{s.firstSeen.slice(0, 16).replace("T", " ")}</bdi>
                    </>
                  ) : null}
                </small>
                {isOpen && (
                  <div className="dash-center-body">
                    <p>{a.reason}</p>
                    {a.amount && (
                      <p className="dash-center-amount">
                        المبلغ: <MoneyText value={a.amount.value} currency={a.amount.currency} />
                      </p>
                    )}
                    <div className="dash-center-actions">
                      {a.ref && (
                        <button type="button" className="text-action" onClick={() => onOpen(a)}>
                          التفاصيل{a.ref.label ? `: ${a.ref.label}` : ""} ←
                        </button>
                      )}
                      {statusOf(a.key) === "new" && (
                        <button type="button" className="text-action" onClick={() => onReview(a.key)}>
                          ✓ راجعتُه
                        </button>
                      )}
                      {a.ackable && statusOf(a.key) !== "acknowledged" && (
                        <button type="button" className="text-action" onClick={() => onAck(a)}>
                          ✔️ تمت المعالجة
                        </button>
                      )}
                    </div>
                    {!a.ackable && <small className="settings-hint">يُحلّ وحده حين يزول سببه.</small>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {periodAlerts.length > 0 && (
        <>
          <h3 className="dash-sub">تنبيهات الفترة المختارة (تتغير مع الفترة)</h3>
          <ul className="dash-alerts">
            {periodAlerts.map((a) => (
              <li key={a.key} className={`dash-alert dash-alert-${a.tone}`}>
                {a.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const SEVERITIES: AlertSeverity[] = ["info", "warn", "critical"];

export function AlertRulesSheet({ rules, onSave, onClose }: { rules: AlertRules; onSave: (next: AlertRules) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<AlertRules>(rules);
  const num = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,\s]/g, ""));
  const field = (key: "minMarginPct" | "clientDebtLimitMru" | "totalDebtsMaxMru" | "expenseSpikePct" | "noCollectionDays" | "starlinkOwedCount", label: string, optional = false) => (
    <label className="renewal-lock-day">
      <span>{label}</span>
      <input
        className="search-input"
        inputMode="decimal"
        dir="ltr"
        value={draft[key] === undefined ? "" : String(draft[key])}
        placeholder={optional ? "—" : undefined}
        onChange={(e) => {
          const n = num(e.target.value);
          setDraft({ ...draft, [key]: e.target.value.trim() === "" && optional ? undefined : Number.isFinite(n) ? n : draft[key] });
        }}
      />
    </label>
  );
  const toggle = (type: AlertType) => setDraft({ ...draft, disabled: draft.disabled.includes(type) ? draft.disabled.filter((t) => t !== type) : [...draft.disabled, type] });
  return (
    <PartySheet title="⚙️ قواعد التنبيهات" onClose={onClose}>
      <div className="dash-goals-form">
        {field("minMarginPct", "الحد الأدنى لهامش التجديد %")}
        {field("clientDebtLimitMru", "حد الدين لكل زبون (أوقية)")}
        {field("totalDebtsMaxMru", "الحد الأعلى لإجمالي الديون (أوقية)", true)}
        {field("expenseSpikePct", "ارتفاع المصروفات المعتبر %")}
        {field("noCollectionDays", "أيام بلا تحصيل قبل التنبيه")}
        {field("starlinkOwedCount", "عدد تكاليف ستارلينك غير المسددة قبل التنبيه")}
        <h3 className="dash-sub">الأنواع (تشغيل / إيقاف ومستوى الأهمية)</h3>
        <ul className="dash-rules">
          {ALERT_TYPES.map((t) => (
            <li key={t.type}>
              <label className="dash-rule-on">
                <input type="checkbox" checked={!draft.disabled.includes(t.type)} onChange={() => toggle(t.type)} />
                <span>{t.label}</span>
              </label>
              <select
                className="search-input dash-rule-sev"
                value={draft.severity[t.type] ?? t.severity}
                aria-label={`أهمية: ${t.label}`}
                onChange={(e) => setDraft({ ...draft, severity: { ...draft.severity, [t.type]: e.target.value as AlertSeverity } })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <p className="settings-hint">على هذا الهاتف فقط. لا يُرسل أي تنبيه لأحد ولا تُنفّذ أي دفعة تلقائيًا.</p>
        <button type="button" className="dialog-primary" onClick={() => onSave(draft)}>
          💾 حفظ
        </button>
      </div>
    </PartySheet>
  );
}

// ---- 🎯 Goals ----

const PACE_LABELS = { ahead: "متقدم على الوتيرة", on: "على الوتيرة", behind: "متأخر عن الوتيرة" } as const;
/** A ceiling: under an even pace is the good side. */
const CEILING_PACE_LABELS = { ahead: "أقل من الوتيرة ✓", on: "عند الوتيرة", behind: "أعلى من الوتيرة" } as const;

export function GoalList({ items }: { items: GoalProgressItem[] }) {
  return (
    <ul className="dash-goals">
      {items.map((g) => {
        const pct = Math.round(g.ratio * 100);
        const tone = g.status === "done" ? "good" : g.status === "over" ? "bad" : g.status === "near" ? (g.ceiling ? "warn" : "good") : "rev";
        const cur = g.count ? "" : g.currency;
        const paceGood = g.pace !== "behind";
        return (
          <li key={g.key} className={`dash-goal dash-goal-${tone}`}>
            <span className="dash-goal-label">
              {g.label}
              {g.ceiling ? " (حد أعلى - الأقل أفضل)" : ""}
            </span>
            <span className="dash-goal-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </span>
            <small>
              <MoneyText value={g.done} currency={cur} /> من <MoneyText value={g.target} currency={cur} /> · <bdi dir="ltr">{`${pct}%`}</bdi>
              {g.status === "done" && " 🎉"}
              {g.status === "over" && " ⛔"}
            </small>
            <small>
              {g.ceiling
                ? g.remaining >= 0
                  ? <>بقي قبل الحد <MoneyText value={g.remaining} currency={cur} /></>
                  : <>تجاوزت الحد بـ <MoneyText value={-g.remaining} currency={cur} /></>
                : g.remaining > 0
                  ? <>المتبقي <MoneyText value={g.remaining} currency={cur} />{g.perDay !== undefined && <> · المطلوب يوميًا <MoneyText value={g.perDay} currency={cur} /></>}</>
                  : <>تجاوزت الهدف بـ <MoneyText value={-g.remaining} currency={cur} /></>}
              {g.period !== "day" && ` · ${g.daysLeft} يوم متبقٍ`}
              {g.period !== "day" && !g.count && (
                <span className={paceGood ? "dash-change-good" : "dash-change-bad"}> · {(g.ceiling ? CEILING_PACE_LABELS : PACE_LABELS)[g.pace]}</span>
              )}
            </small>
            {g.rateNote && <small className="dash-goal-rate">💱 {g.rateNote}</small>}
          </li>
        );
      })}
    </ul>
  );
}

export function ForecastCard({ forecast }: { forecast: Forecast }) {
  if (!forecast.ok) return <p className="settings-hint">🔮 توقع نهاية الشهر: {forecast.reason}</p>;
  return (
    <div className="dash-forecast">
      <strong>🔮 توقع نهاية الشهر (تقديري - ليس ربحًا محققًا)</strong>
      <div className="dash-mini-grid">
        <MiniBtn label="الربح حتى اليوم" value={mru(forecast.soFar)} sub={`${forecast.elapsed} من ${forecast.days} يومًا`} tone="good" />
        <MiniBtn label="متوسط الربح اليومي" value={mru(forecast.dailyAvg)} tone="neutral" />
        <MiniBtn label="التوقع لنهاية الشهر" value={mru(forecast.projected, true)} tone="rev" />
        {forecast.goal !== undefined && (
          <MiniBtn label="الفرق عن الهدف" value={mru(forecast.gap ?? 0, true)} sub={forecast.neededPerDay !== undefined ? `المطلوب يوميًا ${mru(forecast.neededPerDay)}` : undefined} tone={(forecast.gap ?? 0) >= 0 ? "good" : "bad"} />
        )}
      </div>
      <small className="settings-hint">الطريقة: {forecast.method}</small>
    </div>
  );
}

export function GoalsEditSheet({ goals, currencies, onSave, onClose }: { goals: GoalValues & { goalCurrencies?: Partial<Record<string, string>> }; currencies: string[]; onSave: (next: GoalValues & { goalCurrencies: Partial<Record<string, string>> }) => void; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(GOAL_DEFS.map((d) => [d.key, goals[d.key] ? String(goals[d.key]) : ""])));
  const [cur, setCur] = useState<Record<string, string>>(() => ({ ...(goals.goalCurrencies ?? {}) }) as Record<string, string>);
  const parse = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,\s]/g, ""));
  return (
    <PartySheet title="🎯 الأهداف المالية" onClose={onClose}>
      <div className="dash-goals-form">
        {GOAL_DEFS.map((d) => (
          <div key={d.key} className="dash-goal-field">
            <label className="renewal-lock-day">
              <span>
                {d.label}
                {d.ceiling ? " (حد أعلى)" : ""}
              </span>
              <input className="search-input" inputMode="decimal" dir="ltr" value={values[d.key] ?? ""} placeholder="—" onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} />
            </label>
            {!d.count && (
              <select className="search-input dash-goal-cur" aria-label={`عملة ${d.label}`} value={cur[d.key] ?? "MRU"} onChange={(e) => setCur({ ...cur, [d.key]: e.target.value })}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {(LEDGER_CURRENCY_LABELS as Record<string, string>)[c] ?? c}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        <p className="settings-hint">اترك الخانة فارغة لإلغاء الهدف. الهدف بعملة غير الأوقية يُقارن بسعر اليوم المسجل ويُكتب السعر بجانبه.</p>
        <button
          type="button"
          className="dialog-primary"
          onClick={() => {
            const next: GoalValues & { goalCurrencies: Partial<Record<string, string>> } = { goalCurrencies: {} };
            for (const d of GOAL_DEFS) {
              const n = parse(values[d.key] ?? "");
              (next as unknown as Record<string, unknown>)[d.key] = Number.isFinite(n) && n > 0 ? n : undefined;
              if (!d.count && cur[d.key] && cur[d.key] !== "MRU") next.goalCurrencies[d.key] = cur[d.key];
            }
            onSave(next);
          }}
        >
          💾 حفظ
        </button>
      </div>
    </PartySheet>
  );
}

// ---- 💳 Money sources and collections ----

export function SourcesBody({
  places,
  kinds,
  previousKinds,
  series,
  movements,
  method,
  onMethod,
  creditSalesMru,
  approx,
  ownerView,
  onDrill,
  children,
}: {
  places: PlaceStatement[];
  kinds: KindSummary;
  previousKinds: KindSummary;
  series: { unit: "day" | "week" | "month"; buckets: SeriesBucket[] };
  movements: Movement[];
  method: PaymentMethod | "all";
  onMethod: (m: PaymentMethod | "all") => void;
  creditSalesMru: number;
  approx: boolean;
  ownerView: boolean;
  onDrill: (d: Drill) => void;
  children?: ReactNode;
}) {
  const unitLabel = series.unit === "day" ? "يوميًا" : series.unit === "week" ? "أسبوعيًا" : "شهريًا";
  return (
    <>
      <div className="dash-mini-grid">
        <MiniBtn
          label="التحصيلات (مال الزبائن الداخل)"
          value={mru(kinds.collectedMru, kinds.approx)}
          sub="بيع مقبوض + تحصيل ديون + دفعات مقدمة"
          tone="rev"
          onClick={() => onDrill({ title: "💵 التحصيلات", rows: movements.filter((m) => COLLECTION_KINDS.includes(m.kind) && m.direction === "in").map(movementRow), note: "التحويلات بين حساباتك لا تدخل هنا." })}
        />
        <MiniBtn label="الفترة السابقة" value={mru(previousKinds.collectedMru, previousKinds.approx)} tone="neutral" />
        <MiniBtn label="مبيعات بالدين (ليست مالًا داخلًا)" value={mru(creditSalesMru, approx)} tone="warn" />
        <MiniBtn label="التغيّر" value={(() => { const p = pctChange(kinds.collectedMru, previousKinds.collectedMru); return p === null ? "—" : `${p > 0 ? "+" : ""}${Math.round(p)}%`; })()} tone={kinds.collectedMru >= previousKinds.collectedMru ? "good" : "bad"} />
      </div>
      <div className="dash-chips" role="radiogroup" aria-label="طريقة الدفع">
        <button type="button" role="radio" aria-checked={method === "all"} className={`dash-chip${method === "all" ? " dash-chip-on" : ""}`} onClick={() => onMethod("all")}>
          كل الوسائل
        </button>
        {PAYMENT_METHODS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={`dash-chip${method === m ? " dash-chip-on" : ""}`} onClick={() => onMethod(m)}>
            {PAYMENT_METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      <h3 className="dash-sub">التحصيلات {unitLabel}{method !== "all" ? ` · ${PAYMENT_METHOD_LABELS[method]}` : ""}</h3>
      <Bars points={series.buckets.map((b) => ({ key: b.key, label: b.label, value: b.mru, count: b.count }))} />

      <h3 className="dash-sub">كل حركة حسب نوعها</h3>
      {kinds.rows.length === 0 ? (
        <p className="party-empty">لا حركة في هذه الفترة.</p>
      ) : (
        <ul className="dash-kinds">
          {kinds.rows.map((k) => (
            <li key={k.kind}>
              <button type="button" onClick={() => onDrill({ title: `${k.icon} ${k.label}`, rows: movements.filter((m) => m.kind === k.kind).map(movementRow), note: k.kind === "transfer" ? "تظهر في الحسابين (خروج من واحد ودخول للآخر) - تُعدّ مرة واحدة." : undefined })}>
                <span>
                  {k.icon} {k.label} <small>({k.count})</small>
                </span>
                <span className="dash-kinds-values">
                  {k.inMru > 0.5 && <bdi dir="ltr" className="dash-change-good">+{mru(k.inMru)}</bdi>}
                  {k.outMru > 0.5 && <bdi dir="ltr" className={k.kind === "transfer" ? undefined : "dash-change-bad"}>{k.kind === "transfer" ? "⇄ " : "-"}{mru(k.outMru)}</bdi>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {kinds.missing.length > 0 && <p className="settings-hint">لم تُحتسب عملات بلا سعر: {kinds.missing.join("، ")}.</p>}

      {ownerView && (
        <>
          <h3 className="dash-sub">كل وسيلة دفع وحساب (رصيد البداية ← الحركة ← الرصيد النهائي)</h3>
          <div className="dash-places">
            {places
              .filter((p) => p.movements.length > 0 || Object.values(p.byCurrency).some((f) => Math.abs(f.opening ?? 0) > 0.5))
              .map((p) => (
                <button key={p.place.id} type="button" className="dash-place" onClick={() => onDrill({ title: `${p.place.icon} ${p.place.name}`, rows: p.movements.map(movementRow), note: p.note })}>
                  <strong>
                    {p.place.icon} {p.place.name} <small>({p.movements.length} عملية)</small>
                  </strong>
                  {Object.entries(p.byCurrency).map(([code, f]) => {
                    const prev = p.previous[code]?.received ?? 0;
                    return (
                      <span key={code} className="dash-place-lines">
                        {f.opening !== undefined && <span>البداية <MoneyText value={f.opening} currency={code} /></span>}
                        <span className="dash-change-good">+ مقبوضات <MoneyText value={f.received} currency={code} /> <Pct value={pctChange(f.received, prev)} /></span>
                        {f.paid > 0.005 && <span className="dash-change-bad">− مدفوعات <MoneyText value={f.paid} currency={code} /></span>}
                        {(f.transfersIn > 0.005 || f.transfersOut > 0.005) && (
                          <span>
                            ⇄ تحويلات داخلة <MoneyText value={f.transfersIn} currency={code} /> · خارجة <MoneyText value={f.transfersOut} currency={code} />
                          </span>
                        )}
                        {Math.abs(f.corrections) > 0.005 && <span>✏️ تصحيحات <MoneyText value={f.corrections} currency={code} /></span>}
                        <span className="dash-place-total">
                          {f.closing !== undefined ? (
                            <>= الرصيد النهائي <MoneyText value={f.closing} currency={code} /></>
                          ) : (
                            <>صافي حركة الفترة <MoneyText value={f.net} currency={code} /></>
                          )}
                        </span>
                      </span>
                    );
                  })}
                  {p.note && <small className="settings-hint">{p.note}</small>}
                </button>
              ))}
          </div>
          <p className="settings-hint">الرصيد النهائي = البداية + المقبوضات + التحويلات الداخلة − المدفوعات − التحويلات الخارجة (± تصحيحات الرصيد). نفس حساب «💰 حسابي». الدين غير المدفوع ليس مالًا في أي حساب.</p>
        </>
      )}
      {children}
    </>
  );
}

// ---- 📡 Starlink ----

function GroupTable({ rows, first }: { rows: GroupRow[]; first: string }) {
  if (rows.length === 0) return <p className="party-empty">{NO_DATA}.</p>;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>{first}</th>
            <th>تجديد</th>
            <th>المبيعات</th>
            <th>الهامش</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{g.label}</td>
              <td>{g.renewals}</td>
              <td>
                <bdi dir="ltr">{mru(g.salesMru)}</bdi>
              </td>
              <td className={g.marginMru < 0 ? "dash-change-bad" : undefined}>
                <bdi dir="ltr">{mru(g.marginMru)}</bdi>
                {g.incomplete > 0 && <small> ({g.incomplete} ناقص)</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenewalList({ title, rows, empty, onDrill }: { title: string; rows: RenewalRow[]; empty: string; onDrill: (d: Drill) => void }) {
  return (
    <button type="button" className="dash-list-btn" disabled={rows.length === 0} onClick={() => onDrill({ title, rows: rows.map(renewalRow) })}>
      <span>{title}</span>
      <strong>{rows.length === 0 ? empty : `${rows.length} ←`}</strong>
    </button>
  );
}

export function StarlinkBody({
  book,
  realizedProfitMru,
  realizedCount,
  pendingProfitMru,
  pendingCount,
  activeDevices,
  activeClients,
  latePayers,
  minMarginPct,
  onDrill,
  children,
}: {
  book: StarlinkBook;
  realizedProfitMru: number;
  realizedCount: number;
  pendingProfitMru: number;
  pendingCount: number;
  activeDevices: number;
  activeClients: number;
  latePayers: DebtorRow[];
  minMarginPct: number;
  onDrill: (d: Drill) => void;
  children?: ReactNode;
}) {
  const all = (title: string, rows: RenewalRow[]) => () => onDrill({ title, rows: rows.map(renewalRow) });
  const best = book.devices.filter((d) => d.incomplete < d.renewals).slice(0, 5);
  const worst = [...book.devices].filter((d) => d.incomplete < d.renewals).sort((a, b) => a.marginMru - b.marginMru).slice(0, 5);
  const groupDrill = (title: string, g: GroupRow, pick: (r: RenewalRow) => string) => onDrill({ title: `${title}: ${g.label}`, rows: book.rows.filter((r) => pick(r) === g.key).map(renewalRow) });
  return (
    <>
      <p className="dash-period-note">تجديدات الفترة حسب تاريخ تسجيلها · {book.approx ? "≈ بعض المبالغ بسعر اليوم" : "بأسعارها المثبتة"}</p>
      <div className="dash-mini-grid">
        <MiniBtn label="الأجهزة المسجلة / العملاء النشطون" value={`${activeDevices} / ${activeClients}`} tone="neutral" />
        <MiniBtn label="تجديدات الفترة" value={String(book.count)} sub="كل تجديد بتاريخه" tone="neutral" onClick={all("📡 تجديدات الفترة", book.rows)} />
        <MiniBtn label="قيمة التجديدات (البيع)" value={mru(book.salesMru, book.approx)} tone="rev" onClick={all("قيمة التجديدات", book.rows)} />
        <MiniBtn label="دفعه العملاء منها" value={mru(book.paidByClientsMru, book.approx)} tone="good" onClick={all("ما دفعه العملاء", book.rows.filter((r) => r.paid > 0))} />
        <MiniBtn label="ما زال على العملاء منها" value={mru(book.owedByClientsMru, book.approx)} tone="warn" onClick={all("ما زال على العملاء", book.rows.filter((r) => r.unpaid > 0.005))} />
        <MiniBtn label="تكلفة الاشتراكات" value={mru(book.costMru, book.approx)} tone="bad" onClick={all("تكلفة الاشتراكات", book.rows)} />
        <MiniBtn label="مسددة لستارلينك" value={mru(book.costSettledMru)} sub={`${book.costSettledCount} تجديد`} tone="good" onClick={all("تكلفة مسددة لستارلينك", book.rows.filter((r) => r.costState === "settled"))} />
        <MiniBtn label="ما زالت دينًا لستارلينك (D)" value={mru(book.costPendingMru, true)} sub={`${book.costPendingCount} تجديد`} tone="warn" onClick={all("تكلفة غير مسددة (D)", book.unsettled)} />
        <MiniBtn label="هامش الربح المتوقع" value={mru(book.expectedMarginMru, book.approx)} sub={book.incompleteCount ? `${book.incompleteCount} تجديد ناقص البيانات لم يُحسب` : "البيع − التكلفة"} tone="rev" onClick={all("هامش التجديدات", book.rows)} />
        <MiniBtn label="الربح المحقق (حسب «الصافي»)" value={mru(realizedProfitMru)} sub={`${realizedCount} تجديد سُددت تكلفته في الفترة`} tone="good" />
        <MiniBtn label="ربح معلّق (D) - ليس للسحب" value={mru(pendingProfitMru, true)} sub={`${pendingCount} تجديد`} tone="warn" />
        <MiniBtn label="محقق ومحصّل بالكامل" value={mru(book.cashedMarginMru)} sub="دفعه الزبون ودُفعت ستارلينك" tone="good" onClick={all("محقق ومحصّل", book.rows.filter((r) => r.complete && r.costState === "settled" && r.unpaid <= 0.005))} />
        <MiniBtn label="متوسط الهامش لكل تجديد" value={book.avgMarginMru !== undefined ? mru(book.avgMarginMru) : NO_DATA} sub={book.avgMarginPct !== undefined ? `${Math.round(book.avgMarginPct)}%` : undefined} tone="neutral" />
      </div>
      <p className="settings-hint">قاعدة النظام: الربح يُحتسب يوم تسديد ستارلينك. ما دامت التكلفة دينًا عليك فالهامش «معلّق» ولا يُعتبر متاحًا للسحب. ما يدفعه الزبون تحصيل، وما تدفعه لستارلينك سداد مورد - شيئان منفصلان.</p>

      <h3 className="dash-sub">تحليل الربحية</h3>
      <div className="dash-lists">
        <RenewalList title="📉 تجديدات بخسارة" rows={book.losses} empty="لا يوجد ✓" onDrill={onDrill} />
        <RenewalList title={`⚠️ هامش أقل من ${minMarginPct}%`} rows={book.lowMargin} empty="لا يوجد ✓" onDrill={onDrill} />
        <RenewalList title="⏳ لم تُسوَّ تكلفتها للمورد" rows={book.unsettled} empty="لا يوجد ✓" onDrill={onDrill} />
        <RenewalList title="❓ بيانات غير مكتملة" rows={book.incomplete} empty="لا يوجد ✓" onDrill={onDrill} />
      </div>
      <GroupRanks title="🏆 أكثر الأجهزة هامشًا" rows={best} onPick={(g) => groupDrill("جهاز", g, (r) => r.accountId)} />
      <GroupRanks title="🔻 أقل الأجهزة ربحية" rows={worst} onPick={(g) => groupDrill("جهاز", g, (r) => r.accountId)} />
      <GroupRanks title="🔁 أكثر العملاء تجديدًا" rows={book.mostRenewing} count onPick={(g) => groupDrill("زبون", g, (r) => r.clientId ?? "")} />
      <div className="dash-ranks">
        <h3 className="dash-sub">⏰ العملاء الأكثر تأخرًا في السداد (عمر الدين)</h3>
        {latePayers.length === 0 ? (
          <p className="party-empty">لا ديون قديمة.</p>
        ) : (
          <ul className="dash-rank">
            {latePayers.map((d) => (
              <li key={d.key}>
                <a href={homeSearchHref(d.name)}>{d.name}</a>
                <small>{d.oldestDays} يومًا</small>
                <MoneyText value={d.total} currency={d.currency} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <h3 className="dash-sub">الربح حسب نوع الاشتراك</h3>
      <GroupTable rows={book.byPlan} first="الباقة" />
      <h3 className="dash-sub">حسب الشهر</h3>
      <GroupTable rows={book.byMonth} first="الشهر" />
      <h3 className="dash-sub">حسب عملة البيع</h3>
      <GroupTable rows={book.byCurrency.map((g) => ({ ...g, label: (LEDGER_CURRENCY_LABELS as Record<string, string>)[g.label] ?? g.label }))} first="العملة" />
      {children}
    </>
  );
}

function GroupRanks({ title, rows, count, onPick }: { title: string; rows: GroupRow[]; count?: boolean; onPick: (g: GroupRow) => void }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(count ? r.renewals : r.marginMru)));
  return (
    <div className="dash-ranks">
      <h3 className="dash-sub">{title}</h3>
      {rows.length === 0 ? (
        <p className="party-empty">{NO_DATA} في هذه الفترة.</p>
      ) : (
        <ul className="dash-rank">
          {rows.map((r) => (
            <li key={r.key}>
              <button type="button" className="dash-rank-name" onClick={() => onPick(r)}>
                {r.label} <small>({r.renewals} تجديد)</small>
              </button>
              <span className="dash-rank-bar" aria-hidden="true">
                <i style={{ width: `${(Math.abs(count ? r.renewals : r.marginMru) / max) * 100}%`, ...(!count && r.marginMru < 0 ? { background: "var(--red)" } : {}) }} />
              </span>
              <bdi dir="ltr" className={!count && r.marginMru < 0 ? "dash-change-bad" : undefined}>
                {count ? mru(r.salesMru) : mru(r.marginMru)}
              </bdi>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- 🧾 Customers' debts ----

type AgeFilter = "all" | keyof FineBuckets;
type StatusFilter = "all" | "overdue" | "quiet" | "limit";

export function CustomerDebtsBody({
  debts,
  newDebtMru,
  collectedMru,
  approx,
  rules,
  onDrill,
  children,
}: {
  debts: CustomerDebts;
  newDebtMru: number;
  collectedMru: number;
  approx: boolean;
  rules: AlertRules;
  onDrill: (d: Drill) => void;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [minMru, setMinMru] = useState(0);
  const [age, setAge] = useState<AgeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = debts.rows.filter((r) => {
    if (query.trim() && !r.name.includes(query.trim())) return false;
    if ((r.mru ?? 0) < minMru) return false;
    if (age !== "all" && r.buckets[age] <= 0.005) return false;
    if (status === "overdue" && r.overdue <= 0.005) return false;
    if (status === "quiet" && (r.daysSincePayment ?? r.oldestDays) < rules.noCollectionDays) return false;
    if (status === "limit" && (r.mru ?? 0) <= rules.clientDebtLimitMru) return false;
    return true;
  });
  const maxBucket = Math.max(1, ...Object.values(debts.bucketsMru));
  return (
    <>
      <div className="dash-mini-grid">
        <MiniBtn label="إجمالي الديون المفتوحة" value={mru(debts.totalMru, true)} sub={`${debts.debtorCount} مدين`} tone="warn" />
        <MiniBtn label="متوسط الدين لكل مدين" value={debts.avgMru !== undefined ? mru(debts.avgMru, true) : NO_DATA} tone="neutral" />
        <MiniBtn label="ديون جديدة في الفترة" value={mru(newDebtMru, approx)} tone="warn" />
        <MiniBtn label="تحصيلات في الفترة" value={mru(collectedMru, approx)} tone="rev" />
        {debts.noDueDates ? (
          <MiniBtn label="المتأخرة عن موعدها" value="—" sub="لا مواعيد استحقاق مسجلة (وعود دفع)" tone="neutral" />
        ) : (
          <>
            <MiniBtn label="متأخرة عن موعد وعد" value={mru(debts.overdueMru, true)} tone="bad" />
            <MiniBtn label="لم يحن موعدها بعد" value={mru(debts.upcomingMru, true)} tone="neutral" />
          </>
        )}
        <MiniBtn
          label="رصيد زائد للزبائن (غير موزع)"
          value={mru(debts.creditsMru, true)}
          sub={`${debts.credits.length} زبون`}
          tone="neutral"
          onClick={() => onDrill({ title: "رصيد زائد للزبائن", rows: debts.credits.map((c) => ({ key: c.key, date: "", label: c.name, amount: c.amount, currency: c.currency, href: homeSearchHref(c.name) })), note: "دفعوا أكثر مما عليهم: يبقى رصيدًا لهم حتى تقرر خصمه من تجديد قادم أو ردّه." })}
        />
      </div>
      <h3 className="dash-sub">أعمار الديون (من تاريخ كل دين لم يُسدَّد)</h3>
      <ul className="dash-aging">
        {FINE_BUCKET_LABELS.map((b) => (
          <li key={b.key}>
            <button type="button" className={age === b.key ? "dash-aging-on" : undefined} onClick={() => setAge(age === b.key ? "all" : b.key)}>
              <span>{b.label}</span>
              <span className="dash-sources-bar" aria-hidden="true">
                <i style={{ width: `${(debts.bucketsMru[b.key] / maxBucket) * 100}%` }} />
              </span>
              <bdi dir="ltr">{mru(debts.bucketsMru[b.key], true)}</bdi>
            </button>
          </li>
        ))}
      </ul>
      {debts.noDueDates && <p className="settings-hint">لا يوجد تاريخ استحقاق على الديون: هذا عمر الدين، وليس تأخرًا تعاقديًا. سجّل «وعد دفع» ليُحسب التأخر من موعده.</p>}
      <div className="dash-filters">
        <input className="search-input" dir="rtl" placeholder="ابحث باسم الزبون" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="search-input" aria-label="المبلغ" value={minMru} onChange={(e) => setMinMru(Number(e.target.value))}>
          <option value={0}>كل المبالغ</option>
          <option value={5000}>≥ 5,000</option>
          <option value={20000}>≥ 20,000</option>
          <option value={50000}>≥ 50,000</option>
        </select>
        <select className="search-input" aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">كل الحالات</option>
          <option value="overdue">متأخر عن وعده</option>
          <option value="quiet">بلا تحصيل {rules.noCollectionDays}+ يومًا</option>
          <option value="limit">فوق حد الدين</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="party-empty">لا مدينين بهذه الشروط.</p>
      ) : (
        <ul className="dash-debtors">
          {rows.slice(0, 60).map((r) => (
            <li key={r.key}>
              <button type="button" className="dash-debtor-head" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>
                <span>
                  {r.name}
                  {r.overdue > 0.005 && <span className="dash-center-new"> متأخر</span>}
                </span>
                <MoneyText value={r.total} currency={r.currency} />
                <small>
                  أقدم دين {r.oldestDays} يومًا · {r.lastPaymentDate ? `آخر دفعة منذ ${r.daysSincePayment} يومًا` : "لم يدفع بعد"}
                </small>
              </button>
              {open === r.key && (
                <div className="dash-debtor-body">
                  {FINE_BUCKET_LABELS.filter((b) => r.buckets[b.key] > 0.005).map((b) => (
                    <small key={b.key}>
                      {b.label}: <MoneyText value={r.buckets[b.key]} currency={r.currency} />
                    </small>
                  ))}
                  {r.overdue > 0.005 && <small className="dash-change-bad">متأخر عن وعده: <MoneyText value={r.overdue} currency={r.currency} /></small>}
                  {r.upcoming > 0.005 && <small>موعود في <bdi dir="ltr">{r.nextDue}</bdi>: <MoneyText value={r.upcoming} currency={r.currency} /></small>}
                  <div className="dash-center-actions">
                    <a className="text-action" href={homeSearchHref(r.name)}>📄 كشف الحساب وتسجيل دفعة</a>
                    <a className="text-action" href="/reminders/">🔔 التذكيرات</a>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 60 && <p className="settings-hint">أول 60 - ضيّق البحث.</p>}
      {debts.missing.length > 0 && <p className="settings-hint">عملات بلا سعر لم تدخل المجموع: {debts.missing.join("، ")}.</p>}
      {children}
    </>
  );
}

// ---- 🏭 Suppliers' debts ----

export function SupplierDebtsBody({ debts, onDrill }: { debts: SupplierDebts; onDrill: (d: Drill) => void }) {
  const totalNow = debts.storeOwedMru + (debts.starlinkMru ?? 0);
  return (
    <>
      <div className="dash-mini-grid">
        <MiniBtn label="إجمالي المستحق للموردين" value={mru(totalNow, true)} sub="المتجر + ستارلينك" tone="bad" />
        <MiniBtn label="موردو المتجر الآن" value={mru(debts.storeOwedMru, true)} sub={`كان ${mru(debts.storeOwedBeforeMru)} نهاية الفترة السابقة`} tone="warn" />
        <MiniBtn label="سددتُه للموردين في الفترة" value={mru(debts.storePaidMru, true)} tone="good" />
        <MiniBtn label="ديون جديدة للموردين في الفترة" value={mru(debts.storeNewMru, true)} tone="warn" />
        <MiniBtn
          label="تكاليف ستارلينك غير المسددة"
          value={`${formatAmount(Math.round(debts.starlinkUsd))} $`}
          sub={`${debts.starlink.length} تكلفة · كانت ${formatAmount(Math.round(debts.starlinkBeforeUsd))} $`}
          tone="bad"
          onClick={() => onDrill({ title: "📡 عليك لستارلينك", rows: debts.starlink.map((r) => ({ key: r.entryId, date: r.date, label: r.device, sub: `${r.previous ? "دين مالك سابق · " : ""}عمره ${r.ageDays} يومًا`, amount: -r.usd, currency: "USD", href: homeSearchHref(r.device) })) })}
        />
        <MiniBtn label="سُدد لستارلينك في الفترة" value={`${formatAmount(Math.round(debts.starlinkPaidUsd))} $`} sub={`${debts.starlinkPaidCount} تجديد`} tone="good" />
        <MiniBtn
          label="تستحق خلال 7 أيام (تقديري)"
          value={`${formatAmount(Math.round(debts.upcomingUsd))} $`}
          sub={`${debts.upcoming.length} جهاز حسب سعره الشهري`}
          tone="neutral"
          onClick={() => onDrill({ title: "⏰ تجديدات قريبة", rows: debts.upcoming.map((u) => ({ key: u.accountId, date: `بعد ${u.days} يوم`, label: u.device, amount: -u.amount, currency: u.currency, href: homeSearchHref(u.device) })) })}
        />
      </div>
      {debts.suppliers.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>المورد</th>
                <th>المستحق الآن</th>
                <th>سُدد</th>
                <th>جديد</th>
              </tr>
            </thead>
            <tbody>
              {debts.suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href="/clients/">{s.name}</a>
                  </td>
                  <td>
                    <bdi dir="ltr">{mru(s.owedMru)}</bdi>
                  </td>
                  <td>
                    <bdi dir="ltr">{mru(s.paidMru)}</bdi>
                  </td>
                  <td>
                    <bdi dir="ltr">{mru(s.newMru)}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="settings-hint">سداد المورد يخفض ما عليك له فقط - لا يُسجَّل تكلفة جديدة (التكلفة احتُسبت مع البضاعة أو التجديد). لا توجد تواريخ استحقاق مسجلة للموردين: الترتيب حسب عمر الدين.</p>
      {debts.missing.length > 0 && <p className="settings-hint">عملات بلا سعر لم تدخل المجموع: {debts.missing.join("، ")}.</p>}
    </>
  );
}

