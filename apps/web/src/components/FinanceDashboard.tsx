"use client";

import type { RemittanceList } from "@/lib/remittances";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { DateInput } from "./DateInput";
import { formatAmount } from "@/lib/formatAmount";
import {
  buildComparison,
  buildPeriodMetrics,
  buildYearAnalysis,
  addMonths,
  compareRange,
  COMPARE_MODES,
  DASH_PERIODS,
  defaultCompareMode,
  metricValue,
  MONTH_METRICS,
  periodRange,
  type CompareMode,
  type CompareRow,
  type DashInput,
  type DashPeriod,
  type DateRange,
  type MonthMetricKey,
  type PeriodMetrics,
} from "@/lib/financeDashboard";
import { monthLabel } from "@/lib/monthClosing";
import { Donut, Gauge, Ring } from "./FinanceCharts";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildAlerts, buildDebtFlow, buildMoneySources, buildStarlinkAnalysis, type MoneyInput } from "@/lib/financeAnalysis";
import { loadGoals, saveGoals, type MonthlyGoals } from "@/lib/goals";
import {
  acknowledgeAlert,
  buildCenterAlerts,
  loadAlertRules,
  loadAlertStates,
  markAlertReviewed,
  reconcileAlertStates,
  saveAlertRules,
  saveAlertStates,
  sameStates,
  type AlertRules,
  type AlertStates,
  type CenterAlert,
  DEFAULT_ALERT_RULES,
} from "@/lib/alertCenter";
import { buildGoalProgress, forecastMonth, monthDaysSoFar, periodBounds, type GoalActuals } from "@/lib/financeGoals";
import { buildMovements, buildPlaceStatement, collectionSeries, moneyPlaces, summarizeByKind } from "@/lib/moneyMovements";
import { buildRenewalRows, summarizeStarlink } from "@/lib/financeStarlink";
import { buildCustomerDebts, buildSupplierDebts } from "@/lib/financeDebts";
import type { DebtorAging } from "@/lib/debtAging";
import type { AccountsBook } from "@/lib/moneyAccounts";
import type { DebtBook, IncomeList } from "@/lib/myMoney";
import type { PersonalExpense } from "@/lib/personalExpenses";
import type { PaymentAllocation } from "@/lib/paymentAllocationStore";
import type { PaymentPromise } from "@/lib/paymentPromises";
import type { PreviousDebtList } from "@/lib/previousDebt";
import type { CardTopUpList } from "@/lib/starlinkDebt";
import { homeSearchHref } from "@/lib/homeActions";
import type { PaymentMethod } from "@/lib/ledgerStore";
import { toMru } from "@/lib/reportsView";
import {
  AlertCenterBody,
  AlertRulesSheet,
  CustomerDebtsBody,
  DrillSheet,
  ForecastCard,
  GoalList,
  GoalsEditSheet,
  SourcesBody,
  StarlinkBody,
  SupplierDebtsBody,
  type Drill,
} from "./FinanceSections";

/** The other books the phase-2 sections read (all already loaded by the reports page). */
export interface DashBooks {
  book: AccountsBook;
  cardTopUps: CardTopUpList;
  incomes: IncomeList;
  expenses: PersonalExpense[];
  debts: DebtBook;
  allocations: PaymentAllocation[];
  promises: PaymentPromise[];
  /** 💸 «تحويل الأموال» (remittances.ts). */
  remittances?: RemittanceList;
  suppliers: { id: string; name: string }[];
  previousDebts: PreviousDebtList;
  /** Customers / devices owing (and with a credit) - computeDebtAging({ includeCredit: true }). */
  debtors: DebtorAging[];
  newClientsThisMonth: number;
  cardBalanceUsd?: number;
  /** Every currency a record uses (a missing rate is an alert). */
  usedCurrencies: string[];
  partyName: (kind: "client" | "supplier" | "rep", id: string) => string | undefined;
  /** «حسابي»'s places are the owner's: hidden in a rep's app. */
  ownerView: boolean;
}

/** What the dashboard shows that isn't a period total: balances as they are today. */
export interface DashSnapshot {
  /** What customers owe me now (أوقية, ≈). */
  debtorsMru?: number;
  debtorsCount: number;
  /** What I owe Starlink now: open D + earlier owners' debts (أوقية, ≈). */
  owedStarlinkMru?: number;
  activeDevices: number;
  activeClients: number;
  /** What I owe suppliers now (store purchases unpaid + their balance entries), أوقية ≈. */
  suppliersMru?: number;
  suppliersCount: number;
}

export type DashSectionId = "alerts" | "kpis" | "goals" | "compare" | "monthly" | "rings" | "waterfall" | "sources" | "starlink" | "customers" | "suppliers";

export const DASH_SECTIONS: { id: DashSectionId; icon: string; title: string; keywords: string }[] = [
  { id: "alerts", icon: "🔔", title: "مركز التنبيهات", keywords: "تنبيه تنبيهات انخفاض ارتفاع تحذير حرج مكرر سعر صرف" },
  { id: "kpis", icon: "💎", title: "المؤشرات الرئيسية", keywords: "ملخص ايرادات ربح مصروفات هامش متوسط" },
  { id: "goals", icon: "🎯", title: "الأهداف المالية", keywords: "هدف اهداف حد سقف توقع نهاية الشهر" },
  { id: "compare", icon: "⚖️", title: "مقارنة الأداء", keywords: "مقارنة الشهر الماضي امس اسبوع" },
  { id: "monthly", icon: "📈", title: "تحليل الأداء الشهري", keywords: "شهري سنوي مخطط افضل شهر نمو" },
  { id: "rings", icon: "⭕", title: "النسب والتوزيع", keywords: "نسبة دائرة هامش توزيع" },
  { id: "waterfall", icon: "🧮", title: "من أين جاء صافي الربح؟", keywords: "صافي ربح تكلفة معلق محقق" },
  { id: "sources", icon: "💳", title: "مصادر الأموال والتحصيلات", keywords: "بنكيلي اورانج سداد نقدا كاش تحصيل وسيلة دفع مصدر تحويل رصيد حساب" },
  { id: "starlink", icon: "📡", title: "تحليل اشتراكات Starlink", keywords: "ستارلينك تجديد اشتراك تكلفة d هامش خسارة باقة" },
  { id: "customers", icon: "🧾", title: "ديون العملاء", keywords: "ديون دين تحصيل مدين اعمار متأخر وعد" },
  { id: "suppliers", icon: "🏭", title: "ديون الموردين", keywords: "مورد موردين مستحق ستارلينك سداد" },
];

/** Sections added after a phone saved its folded list - folded the first time (a long page otherwise). */
const NEW_IN_V2: DashSectionId[] = ["sources", "starlink", "customers", "suppliers"];

const PREFS_KEY = "starnet.dashboard";

interface DashPrefs {
  v?: number;
  period: DashPeriod;
  custom?: DateRange;
  compare?: CompareMode;
  collapsed: DashSectionId[];
  metrics: MonthMetricKey[];
}

function loadPrefs(): DashPrefs {
  const fallback: DashPrefs = { v: 2, period: "month", collapsed: [...NEW_IN_V2, "monthly", "rings"], metrics: ["net"] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<DashPrefs> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      period: DASH_PERIODS.some((p) => p.kind === parsed.period) ? parsed.period! : fallback.period,
      custom: parsed.custom,
      compare: COMPARE_MODES.some((m) => m.mode === parsed.compare) ? parsed.compare : undefined,
      v: 2,
      collapsed: Array.isArray(parsed.collapsed) ? (parsed.v === 2 ? parsed.collapsed : [...new Set([...parsed.collapsed, ...NEW_IN_V2])]) : fallback.collapsed,
      metrics: Array.isArray(parsed.metrics) && parsed.metrics.length ? parsed.metrics : fallback.metrics,
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: DashPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // A per-phone convenience only.
  }
}

const NO_DATA = "لا توجد بيانات كافية";

function mru(value: number, approx = false): string {
  return `${approx ? "≈ " : ""}${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

function rangeText(range: DateRange): string {
  return range.from === range.to ? range.from : `${range.from} ← ${range.to}`;
}

/** ▲ 12% / ▼ 8% / «لا توجد قاعدة مقارنة», colored by whether it's good news. */
function Change({ row }: { row: Pick<CompareRow, "diff" | "pct" | "upIsGood" | "count"> }) {
  if (row.pct === null) return <span className="dash-change dash-change-none">لا توجد قاعدة مقارنة</span>;
  const up = row.diff > 0;
  const flat = Math.abs(row.diff) < 0.5;
  const good = flat ? undefined : up === row.upIsGood;
  return (
    <span className={`dash-change${good === true ? " dash-change-good" : good === false ? " dash-change-bad" : ""}`}>
      <span aria-hidden="true">{flat ? "●" : up ? "▲" : "▼"}</span> <bdi dir="ltr">{`${up ? "+" : ""}${Math.round(row.pct)}%`}</bdi>
    </span>
  );
}

/** A section with a title row that folds it (the state is kept on the phone). */
function DashSection({ id, open, onToggle, children, extra, badge }: { id: DashSectionId; open: boolean; onToggle: () => void; children: ReactNode; extra?: ReactNode; badge?: string }) {
  const meta = DASH_SECTIONS.find((s) => s.id === id)!;
  return (
    <section className={`dash-section dash-section-${id}`} id={`dash-${id}`} aria-labelledby={`dash-${id}-title`}>
      <div className="dash-section-head">
        <button type="button" className="dash-section-toggle" aria-expanded={open} aria-controls={`dash-${id}-body`} onClick={onToggle}>
          <span className="dash-section-icon" aria-hidden="true">{meta.icon}</span>
          <h2 id={`dash-${id}-title`}>{meta.title}</h2>
          {badge && <span className="dash-section-badge">{badge}</span>}
          <span className={`dash-chevron${open ? " dash-chevron-open" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {open && extra}
      </div>
      <div id={`dash-${id}-body`} className="dash-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

type KpiTone = "rev" | "profit" | "loss" | "warn" | "neutral";

interface KpiCardData {
  id: string;
  icon: string;
  label: string;
  /** null = nothing to compute from («لا توجد بيانات كافية»). */
  value: string | null;
  unit?: string;
  tone: KpiTone;
  change?: CompareRow;
  /** How it is computed, in his words - shown when the card is tapped. */
  how: string;
  tab?: string;
}

function KpiCard({ card, open, onToggle, onOpenTab }: { card: KpiCardData; open: boolean; onToggle: () => void; onOpenTab: (tab: string) => void }) {
  return (
    <div className={`dash-kpi dash-kpi-${card.tone}${open ? " dash-kpi-open" : ""}`}>
      <button type="button" className="dash-kpi-main" aria-expanded={open} onClick={onToggle}>
        <span className="dash-kpi-label">
          <span aria-hidden="true">{card.icon}</span> {card.label}
        </span>
        {card.value === null ? (
          <span className="dash-kpi-empty">{NO_DATA}</span>
        ) : (
          <strong className="dash-kpi-value">
            <bdi dir="ltr">{card.value}</bdi>
            {card.unit && <small> {card.unit}</small>}
          </strong>
        )}
        {card.change && card.value !== null && <Change row={card.change} />}
      </button>
      {open && (
        <div className="dash-kpi-how">
          <p>{card.how}</p>
          {card.tab && (
            <button type="button" className="text-action" onClick={() => onOpenTab(card.tab!)}>
              التفاصيل ←
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SHORT_MONTHS = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];

/** 📈 Months of a year as bars - one metric in its own color, or two money metrics side by side
 * (blue / red, legend + values on tap). One axis only: a count is never mixed with money. */
function MonthChart({ points, metrics }: { points: { month: string; values: number[]; future: boolean }[]; metrics: { key: MonthMetricKey | string; label: string; count?: boolean }[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const W = 340;
  const H = 170;
  const top = 12;
  const bottom = 20;
  const all = points.flatMap((p) => p.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const y = (v: number) => top + ((max - v) / span) * (H - top - bottom);
  const groupW = W / points.length;
  const series = metrics.length;
  const barW = Math.max(4, (groupW * 0.62) / series - (series > 1 ? 2 : 0));
  const colorOf = (i: number, value: number) => {
    if (series > 1) return i === 0 ? "var(--chart-1)" : "var(--chart-2)";
    const key = metrics[0]!.key;
    if (key === "net") return value < 0 ? "var(--red)" : "var(--green)";
    if (key === "expenses") return "var(--chart-2)";
    if (key === "starlinkCost") return "var(--orange)";
    if (key === "renewals") return "var(--violet)";
    return "var(--chart-1)";
  };
  const sel = selected !== null ? points[selected] : undefined;
  const hasData = all.some((v) => Math.abs(v) > 0.5);
  if (!hasData) return <p className="party-empty">لا توجد أرقام في هذه السنة.</p>;
  return (
    <div className="dash-chart">
      {series > 1 && (
        <div className="dash-legend">
          {metrics.map((m, i) => (
            <span key={m.key}>
              <i style={{ background: i === 0 ? "var(--chart-1)" : "var(--chart-2)" }} aria-hidden="true" /> {m.label}
            </span>
          ))}
        </div>
      )}
      <div className="dash-chart-tip" aria-live="polite">
        {sel ? (
          <>
            <strong>{monthLabel(sel.month)}</strong>
            {metrics.map((m, i) => (
              <span key={m.key}>
                {m.label}: <bdi dir="ltr">{m.count ? sel.values[i] : mru(sel.values[i] ?? 0)}</bdi>
              </span>
            ))}
          </>
        ) : (
          <span className="dash-chart-hint">اضغط شهرًا لترى أرقامه</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart-svg" role="img" aria-label={metrics.map((m) => m.label).join(" و ")} preserveAspectRatio="none">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="dash-chart-base" />
        {points.map((p, gi) => {
          // RTL: January on the right.
          const gx = W - (gi + 1) * groupW;
          return (
            <g key={p.month} onClick={() => setSelected(selected === gi ? null : gi)} className="dash-chart-group">
              <rect x={gx} y={0} width={groupW} height={H} className={`dash-chart-hit${selected === gi ? " dash-chart-hit-on" : ""}`} />
              {p.values.map((v, si) => {
                const x = gx + (groupW - (barW + 2) * series) / 2 + si * (barW + 2);
                const y0 = y(0);
                const y1 = y(v);
                const h = Math.max(Math.abs(y1 - y0), v === 0 ? 0 : 2);
                return <rect key={si} x={x} y={v >= 0 ? y0 - h : y0} width={barW} height={h} rx={2} fill={colorOf(si, v)} opacity={p.future ? 0.25 : 1} />;
              })}
              <text x={gx + groupW / 2} y={H - 6} textAnchor="middle" className="dash-chart-axis">
                {SHORT_MONTHS[Number(p.month.slice(5, 7)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FinanceDashboard({
  input,
  money,
  accounts,
  clientName,
  snapshot,
  books,
  today,
  onOpenTab,
}: {
  input: DashInput;
  /** Every money record (phase 2: sources, debts). */
  money: MoneyInput;
  books: DashBooks;
  accounts: StarlinkAccountSummary[];
  clientName: (clientId: string) => string | undefined;
  snapshot: DashSnapshot;
  today: string;
  onOpenTab: (tab: string) => void;
}) {
  const [prefs, setPrefs] = useState<DashPrefs>({ period: "month", collapsed: ["sources"], metrics: ["net"] });
  useEffect(() => setPrefs(loadPrefs()), []);
  const update = (patch: Partial<DashPrefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });
  const [openKpi, setOpenKpi] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [year, setYear] = useState(Number(today.slice(0, 4)));

  const range = useMemo(() => periodRange(prefs.period, today, prefs.custom), [prefs.period, prefs.custom, today]);
  const mode = prefs.compare ?? defaultCompareMode(prefs.period);
  const previousRange = useMemo(() => compareRange(range, mode), [range, mode]);
  const current = useMemo(() => buildPeriodMetrics(input, range), [input, range]);
  const previous = useMemo(() => buildPeriodMetrics(input, previousRange), [input, previousRange]);
  const comparison = useMemo(() => buildComparison(current, previous), [current, previous]);
  const byKey = Object.fromEntries(comparison.map((r) => [r.key, r]));
  const yearData = useMemo(() => buildYearAnalysis(input, year, today), [input, year, today]);
  const minYear = useMemo(() => {
    let earliest = Number(today.slice(0, 4));
    for (const entries of Object.values(input.activityLedger ?? input.ledgerStore)) for (const e of entries) earliest = Math.min(earliest, Number(e.date.slice(0, 4)) || earliest);
    return earliest;
  }, [input, today]);

  // ---- phase 2: money sources, Starlink, debts, goals, alerts ----
  const sources = useMemo(() => buildMoneySources(money, range, previousRange), [money, range, previousRange]);
  const debtFlow = useMemo(() => buildDebtFlow(money, range), [money, range]);
  const starlink = useMemo(
    () => buildStarlinkAnalysis(current, input.ledgerStore, input.activityLedger ?? input.ledgerStore, accounts, clientName, input.rates),
    [current, input, accounts, clientName],
  );
  const [goals, setGoals] = useState<MonthlyGoals>({});
  useEffect(() => setGoals(loadGoals()), []);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [rules, setRules] = useState<AlertRules>(DEFAULT_ALERT_RULES);
  useEffect(() => setRules(loadAlertRules()), []);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const monthRange = useMemo(() => periodRange("month", today), [today]);
  const monthMetrics = useMemo(() => buildPeriodMetrics(input, monthRange), [input, monthRange]);
  const dayMetrics = useMemo(() => buildPeriodMetrics(input, { from: today, to: today }), [input, today]);
  const monthDebt = useMemo(() => buildDebtFlow(money, monthRange), [money, monthRange]);

  // 💳 Every money movement, classified (lib/moneyMovements.ts) - the same records «حسابي» adds up.
  const deviceName = useMemo(() => (id: string) => accounts.find((a) => a.id === id)?.name, [accounts]);
  const movements = useMemo(
    () =>
      buildMovements({
        ledger: money.ledger,
        invoices: money.invoices,
        adjustments: money.adjustments,
        settlements: money.settlements,
        cash: money.cash,
        book: books.book,
        cardTopUps: books.cardTopUps,
        incomes: books.incomes,
        expenses: books.expenses,
        debts: books.debts,
        remittances: books.remittances,
        clientOf: (id) => accounts.find((a) => a.id === id)?.clientId,
        deviceName,
        partyName: books.partyName,
      }),
    [money, books, accounts, deviceName],
  );
  const methodMovements = useMemo(() => (method === "all" ? movements : movements.filter((m) => m.method === method)), [movements, method]);
  const kinds = useMemo(() => summarizeByKind(methodMovements, range, input.rates), [methodMovements, range, input.rates]);
  const previousKinds = useMemo(() => summarizeByKind(methodMovements, previousRange, input.rates), [methodMovements, previousRange, input.rates]);
  const series = useMemo(() => collectionSeries(methodMovements, range, input.rates), [methodMovements, range, input.rates]);
  const periodMovements = useMemo(() => methodMovements.filter((m) => m.date >= range.from && m.date <= range.to), [methodMovements, range]);
  const places = useMemo(() => (books.ownerView ? moneyPlaces(books.book).map((p) => buildPlaceStatement(p, movements, range, previousRange)) : []), [books, movements, range, previousRange]);

  // 📡 The period's renewals one by one (lib/financeStarlink.ts).
  const renewalRows = useMemo(
    () => buildRenewalRows({ ledger: input.activityLedger ?? input.ledgerStore, accounts, clientName, rates: input.rates, range }),
    [input, accounts, clientName, range],
  );
  const starBook = useMemo(() => summarizeStarlink(renewalRows, rules.minMarginPct), [renewalRows, rules.minMarginPct]);

  // 🧾 / 🏭 Debts.
  const customerDebts = useMemo(() => buildCustomerDebts(books.debtors, books.promises, input.rates, today), [books, input.rates, today]);
  const supplierDebts = useMemo(
    () =>
      buildSupplierDebts({
        suppliers: books.suppliers,
        invoices: money.invoices,
        adjustments: money.adjustments,
        ledger: input.activityLedger ?? input.ledgerStore,
        previousDebts: books.previousDebts,
        accounts,
        rates: input.rates,
        range,
        previous: previousRange,
        today,
      }),
    [books, money, input, accounts, range, previousRange, today],
  );

  // 🎯 Goals - each «done» from the same calculations as the rest of the dashboard.
  const goalActuals = useMemo<GoalActuals>(() => {
    const upTo = (period: "week" | "year") => buildPeriodMetrics(input, { from: periodBounds(period, today).from, to: today }).netMru;
    const monthSoFar = { from: monthRange.from, to: today };
    return {
      profitDay: dayMetrics.netMru,
      profitWeek: upTo("week"),
      profitMonth: monthMetrics.netMru,
      profitYear: upTo("year"),
      collectedDay: summarizeByKind(movements, { from: today, to: today }, input.rates).collectedMru,
      collectedMonth: summarizeByKind(movements, monthSoFar, input.rates).collectedMru,
      expensesMonth: monthMetrics.expensesMru,
      newDebtsMonth: monthDebt.newDebtMru,
      openDebtsNow: customerDebts.totalMru,
      renewalsMonth: monthMetrics.renewals,
      newClientsMonth: books.newClientsThisMonth,
    };
  }, [input, today, monthRange, dayMetrics, monthMetrics, monthDebt, movements, customerDebts, books.newClientsThisMonth]);
  const goalItems = useMemo(() => buildGoalProgress(goals, goalActuals, today, input.rates), [goals, goalActuals, today, input.rates]);
  const dailyNet = useMemo(() => monthDaysSoFar(today).map((d) => buildPeriodMetrics(input, { from: d, to: d }).netMru), [input, today]);
  const forecast = useMemo(() => {
    const goal = goals.profitMonthMru;
    const cur = goals.goalCurrencies?.profitMonthMru;
    const goalMru = goal && cur && cur !== "MRU" ? toMru(goal, cur, input.rates) : goal;
    return forecastMonth(dailyNet, today, goalMru);
  }, [dailyNet, today, goals, input.rates]);
  const profitGoal = goalItems.find((g) => g.key === "profitMonthMru");

  // 🔔 Alert center: fixed windows (this month so far vs the same days of last month, 30 days, now).
  const centerAlerts = useMemo<CenterAlert[]>(() => {
    const monthSoFar = { from: monthRange.from, to: today };
    const lastMonth = { from: addMonths(monthRange.from, -1), to: addMonths(today, -1) };
    const now = buildPeriodMetrics(input, monthSoFar);
    const before = buildPeriodMetrics(input, lastMonth);
    const from30 = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    const last30 = { from: from30, to: today };
    const rows30 = buildRenewalRows({ ledger: input.activityLedger ?? input.ledgerStore, accounts, clientName, rates: input.rates, range: last30 });
    const store30 = buildPeriodMetrics(input, last30).net.storeSalesMru;
    const allSupplier = buildSupplierDebts({ suppliers: [], invoices: [], adjustments: [], ledger: input.activityLedger ?? input.ledgerStore, previousDebts: books.previousDebts, accounts, rates: input.rates, range: monthRange, previous: monthRange, today });
    return buildCenterAlerts(
      {
        today,
        monthNetMru: now.netMru,
        lastMonthNetMru: before.netMru,
        monthExpensesMru: now.expensesMru,
        lastMonthExpensesMru: before.expensesMru,
        monthNewDebtMru: monthDebt.newDebtMru,
        monthCollectedMru: monthDebt.collectedMru,
        salesLast30Mru: rows30.reduce((s, r) => s + (r.saleMru ?? 0), 0) + store30,
        goals: goalItems,
        renewals: rows30,
        debtors: customerDebts.rows,
        totalDebtsMru: customerDebts.totalMru,
        openDebtsGoalMru: goals.openDebtsMaxMru,
        credits: customerDebts.credits,
        starlinkOwed: allSupplier.starlink,
        starlinkOwedMru: allSupplier.starlinkMru,
        upcomingStarlinkUsd: allSupplier.upcomingUsd,
        upcomingCount: allSupplier.upcoming.length,
        cardBalanceUsd: books.cardBalanceUsd,
        ledger: input.activityLedger ?? input.ledgerStore,
        allocations: books.allocations,
        rates: input.rates,
        usedCurrencies: books.usedCurrencies,
        deviceName: (id) => deviceName(id) ?? "جهاز محذوف",
      },
      rules,
    );
  }, [input, today, monthRange, monthDebt, goalItems, customerDebts, goals.openDebtsMaxMru, books, accounts, clientName, deviceName, rules]);
  const [alertStates, setAlertStates] = useState<AlertStates>({});
  useEffect(() => {
    const stored = loadAlertStates();
    const next = reconcileAlertStates(stored, centerAlerts, new Date().toISOString());
    if (!sameStates(stored, next)) saveAlertStates(next);
    setAlertStates(next);
  }, [centerAlerts]);
  const updateStates = (next: AlertStates) => {
    saveAlertStates(next);
    setAlertStates(next);
  };
  function openAlert(a: CenterAlert) {
    const ref = a.ref;
    if (!ref) return;
    if (ref.kind === "tab") onOpenTab(ref.id);
    else if (ref.kind === "section") {
      const id = ref.id as DashSectionId;
      if (!isOpen(id)) toggle(id);
      window.setTimeout(() => document.getElementById(`dash-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } else window.location.assign(homeSearchHref(ref.label ?? ref.id));
  }
  const activeAlertCount = centerAlerts.filter((a) => ["new", "reviewed"].includes(alertStates[a.key]?.status ?? "new")).length;
  const newAlertCount = centerAlerts.filter((a) => (alertStates[a.key]?.status ?? "new") === "new").length;

  const alerts = useMemo(
    () =>
      buildAlerts({
        current,
        previous,
        previousLabel: COMPARE_MODES.find((m) => m.mode === mode)?.label ?? "الفترة السابقة",
        debt: debtFlow,
        openDCount: starlink.openDCount,
        openDMru: starlink.openDMru,
        goals: [],
      }),
    [current, previous, mode, debtFlow, starlink],
  );
  const debtYear = useMemo(
    () =>
      yearData.months.map((p) => {
        const flow = buildDebtFlow(money, p.metrics.range);
        return { month: p.month, future: p.future, values: [flow.collectedMru, flow.newDebtMru] };
      }),
    [yearData, money],
  );
  function saveAllGoals(next: Partial<MonthlyGoals>) {
    const merged = { ...loadGoals(), ...next };
    saveGoals(merged);
    setGoals(merged);
  }

  const isOpen = (id: DashSectionId) => !prefs.collapsed.includes(id);
  const toggle = (id: DashSectionId) => update({ collapsed: isOpen(id) ? [...prefs.collapsed, id] : prefs.collapsed.filter((c) => c !== id) });
  const approx = current.approximate;

  const kpis: KpiCardData[] = [
    { id: "revenue", icon: "💰", label: "الإيرادات المحققة", value: current.empty ? null : mru(current.revenueMru, approx), unit: "أوقية", tone: "rev", change: byKey.revenue, how: "تجديدات ستارلينك التي دُفعت تكلفتها في الفترة (يوم الدفع لستارلينك) + مبيعات المتجر. التجديد الذي ما زالت تكلفته دينًا (D) لا يدخل هنا.", tab: "starlink" },
    { id: "net", icon: "📈", label: "صافي الربح", value: current.empty ? null : mru(current.netMru, approx), unit: "أوقية", tone: current.netMru < 0 ? "loss" : "profit", change: byKey.net, how: "الإيرادات المحققة − تكلفة ستارلينك − حصص المندوبين + ربح المتجر − المصروفات. نفس رقم تبويب «الصافي».", tab: "net" },
    { id: "expenses", icon: "🧾", label: "المصروفات", value: current.empty ? null : mru(current.expensesMru, approx), unit: "أوقية", tone: "loss", change: byKey.expenses, how: "قيود «خارج» اليدوية في الكاش + سحب البطاقة إلى خسارة. ليست مصروفاتك الشخصية، ولا شحن البطاقة ولا دفعات المندوبين.", tab: "net" },
    { id: "cost", icon: "📡", label: "تكلفة اشتراكات ستارلينك", value: current.net.starlinkShipments ? mru(current.starlinkCostMru) : null, unit: "أوقية", tone: "warn", how: "ما دفعته لستارلينك عن التجديدات المحققة في الفترة، بسعر الصرف المثبّت على كل تجديد.", tab: "starlink" },
    { id: "collected", icon: "💵", label: "المحصّل من العملاء", value: current.collectedCount ? mru(current.collectedMru, approx) : null, unit: "أوقية", tone: "rev", change: byKey.collected, how: "دفعات الزبائن عن الأجهزة المسجلة في الفترة («له»). تحصيل مال وليس ربحًا: لا يُضاف إلى الأرباح.", tab: "debts" },
    { id: "pending", icon: "⏳", label: "ربح معلّق (D)", value: current.pendingCount ? mru(current.pendingProfitMru, true) : null, unit: `أوقية · ${current.pendingCount} تجديد`, tone: "warn", how: "تجديدات الفترة التي ما زالت تكلفتها دينًا عليك لستارلينك: هامش متوقع، لا يُعتبر ربحًا محققًا ولا متاحًا للسحب حتى تسدّد ستارلينك.", tab: "starlink" },
    { id: "debtors", icon: "🧾", label: "ديون العملاء المستحقة", value: snapshot.debtorsMru !== undefined && snapshot.debtorsCount ? mru(snapshot.debtorsMru, true) : null, unit: `أوقية · ${snapshot.debtorsCount} زبون`, tone: "warn", how: "ما على الزبائن الآن (كل الأجهزة والمتجر)، أيًا كانت الفترة.", tab: "debts" },
    { id: "owed", icon: "📡", label: "عليّ لستارلينك", value: snapshot.owedStarlinkMru !== undefined ? mru(snapshot.owedStarlinkMru, true) : null, unit: "أوقية", tone: "warn", how: "تكاليف D غير المسددة + ديون الملاك السابقين، الآن.", tab: "debts" },
    { id: "suppliers", icon: "🏭", label: "المستحق للموردين", value: snapshot.suppliersCount && snapshot.suppliersMru !== undefined ? mru(snapshot.suppliersMru, true) : null, unit: `أوقية · ${snapshot.suppliersCount} مورد`, tone: "warn", how: "ما بقي عليك للموردين الآن: فواتير الشراء غير المسددة + قيود أرصدتهم.", tab: "store" },
    { id: "renewals", icon: "🔄", label: "عمليات التجديد", value: String(current.renewals), tone: "neutral", change: byKey.renewals, how: "كل تجديد مسجل بتاريخه في الفترة (D أو مسدد). دين التوثيق ليس تجديدًا." },
    { id: "active", icon: "📡", label: "الأجهزة / العملاء النشطون", value: `${snapshot.activeDevices} / ${snapshot.activeClients}`, tone: "neutral", how: "الأجهزة غير المؤرشفة وغير المحذوفة الآن، والزبائن الذين لهم جهاز منها." },
    { id: "avg", icon: "➗", label: "متوسط الربح لكل تجديد", value: current.avgProfitPerRenewalMru !== undefined ? mru(current.avgProfitPerRenewalMru) : null, unit: "أوقية", tone: "profit", how: "ربح ستارلينك المحقق ÷ عدد التجديدات المحققة في الفترة (قبل حصص المندوبين)." },
    { id: "margin", icon: "％", label: "هامش الربح", value: current.marginPct !== undefined ? `${Math.round(current.marginPct)}%` : null, tone: current.marginPct !== undefined && current.marginPct < 0 ? "loss" : "profit", how: "صافي الربح ÷ الإيرادات المحققة × 100." },
    { id: "capital", icon: "🏦", label: "الرصيد التشغيلي", value: null, tone: "neutral", how: "أرصدة الكاش والحسابات البنكية والمحافظ تُحسب في «💰 حسابي» (رصيد كل حساب من تاريخ ضبطه) - لا يُعاد حسابها هنا حتى لا يظهر رقمان مختلفان.", tab: "money" },
  ];

  const chosenMetrics = MONTH_METRICS.filter((m) => prefs.metrics.includes(m.key));
  function toggleMetric(key: MonthMetricKey) {
    const meta = MONTH_METRICS.find((m) => m.key === key)!;
    const has = prefs.metrics.includes(key);
    if (has) {
      if (prefs.metrics.length > 1) update({ metrics: prefs.metrics.filter((k) => k !== key) });
      return;
    }
    // One axis: a count alone; at most two money metrics together.
    if (meta.count) return update({ metrics: [key] });
    const money = prefs.metrics.filter((k) => !MONTH_METRICS.find((m) => m.key === k)?.count);
    update({ metrics: [...money.slice(-1), key] });
  }

  return (
    <div className="dash">
      <div className="dash-toolbar" role="toolbar" aria-label="الفترة والأقسام">
        <select className="search-input dash-period" value={prefs.period} onChange={(e) => update({ period: e.target.value as DashPeriod })} aria-label="الفترة">
          {DASH_PERIODS.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="button" className="dash-tool" onClick={() => update({ collapsed: [] })}>
          ⊞ فتح الكل
        </button>
        <button type="button" className="dash-tool" onClick={() => update({ collapsed: DASH_SECTIONS.map((s) => s.id) })}>
          ⊟ طي الكل
        </button>
      </div>
      {prefs.period === "custom" && (
        <div className="dash-custom">
          <label>
            <span>من</span>
            <DateInput className="search-input" value={prefs.custom?.from ?? today} onChange={(e) => update({ custom: { from: e.target.value, to: prefs.custom?.to ?? today } })} />
          </label>
          <label>
            <span>إلى</span>
            <DateInput className="search-input" value={prefs.custom?.to ?? today} onChange={(e) => update({ custom: { from: prefs.custom?.from ?? today, to: e.target.value } })} />
          </label>
        </div>
      )}
      <nav className="dash-jump" aria-label="الانتقال إلى قسم">
        {DASH_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (!isOpen(s.id)) toggle(s.id);
              window.setTimeout(() => document.getElementById(`dash-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
            }}
          >
            {s.icon} {s.title}
          </button>
        ))}
      </nav>
      <p className="dash-period-note">
        <bdi dir="ltr">{rangeText(range)}</bdi> · بالأوقية{approx ? " (≈ بعض المبالغ بسعر اليوم)" : ""}
        {current.missingCurrencies.length > 0 && ` · لم تُحتسب عملات بلا سعر: ${current.missingCurrencies.join("، ")}`}
      </p>

      <DashSection
        id="alerts"
        open={isOpen("alerts")}
        onToggle={() => toggle("alerts")}
        badge={activeAlertCount ? `${activeAlertCount}${newAlertCount ? ` · ${newAlertCount} جديد` : ""}` : undefined}
        extra={
          <button type="button" className="dash-tool" onClick={() => setRulesOpen(true)}>
            ⚙️ القواعد
          </button>
        }
      >
        <AlertCenterBody
          alerts={centerAlerts}
          states={alertStates}
          periodAlerts={alerts}
          onReview={(key) => updateStates(markAlertReviewed(alertStates, key, new Date().toISOString()))}
          onAck={(a) => updateStates(acknowledgeAlert(alertStates, a, new Date().toISOString()))}
          onOpen={openAlert}
        />
      </DashSection>

      <DashSection id="kpis" open={isOpen("kpis")} onToggle={() => toggle("kpis")}>
        <div className="dash-kpis">
          {kpis.map((card) => (
            <KpiCard key={card.id} card={card} open={openKpi === card.id} onToggle={() => setOpenKpi(openKpi === card.id ? null : card.id)} onOpenTab={onOpenTab} />
          ))}
        </div>
      </DashSection>

      <DashSection
        id="goals"
        open={isOpen("goals")}
        onToggle={() => toggle("goals")}
        extra={
          <button type="button" className="dash-tool" onClick={() => setGoalsOpen(true)}>
            ✏️ الأهداف
          </button>
        }
      >
        {goalItems.length === 0 ? (
          <p className="party-empty">لم تحدد أهدافًا بعد. اضغط «✏️ الأهداف»: الربح اليومي والأسبوعي والشهري والسنوي، التحصيل، حدود المصروفات والديون، عدد التجديدات والزبائن الجدد.</p>
        ) : (
          <>
            {profitGoal && <Gauge label="هدف ربح الشهر" done={profitGoal.done} target={profitGoal.target} />}
            <GoalList items={goalItems} />
          </>
        )}
        <ForecastCard forecast={forecast} />
      </DashSection>

      <DashSection
        id="compare"
        open={isOpen("compare")}
        onToggle={() => toggle("compare")}
      >
        <div className="dash-chips" role="radiogroup" aria-label="المقارنة مع">
          {COMPARE_MODES.map((m) => (
            <button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode} className={`dash-chip${mode === m.mode ? " dash-chip-on" : ""}`} onClick={() => update({ compare: m.mode })}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="dash-period-note">
          <bdi dir="ltr">{rangeText(range)}</bdi> مقابل <bdi dir="ltr">{rangeText(previousRange)}</bdi>
        </p>
        <ul className="dash-compare">
          {comparison.map((row) => (
            <li key={row.key}>
              <span className="dash-compare-label">{row.label}</span>
              <span className="dash-compare-values">
                <strong>
                  <bdi dir="ltr">{row.count ? row.current : mru(row.current)}</bdi>
                </strong>
                <small>
                  كان <bdi dir="ltr">{row.count ? row.previous : mru(row.previous)}</bdi> · الفرق <bdi dir="ltr">{`${row.diff > 0 ? "+" : ""}${row.count ? row.diff : mru(row.diff)}`}</bdi>
                </small>
              </span>
              <Change row={row} />
            </li>
          ))}
        </ul>
      </DashSection>

      <DashSection
        id="monthly"
        open={isOpen("monthly")}
        onToggle={() => toggle("monthly")}
        extra={
          <span className="dash-year">
            <button type="button" aria-label="السنة السابقة" disabled={year <= minYear} onClick={() => setYear(year - 1)}>
              ›
            </button>
            <bdi dir="ltr">{year}</bdi>
            <button type="button" aria-label="السنة التالية" disabled={year >= Number(today.slice(0, 4))} onClick={() => setYear(year + 1)}>
              ‹
            </button>
          </span>
        }
      >
        <div className="dash-chips" aria-label="المؤشرات">
          {MONTH_METRICS.map((m) => (
            <button key={m.key} type="button" aria-pressed={prefs.metrics.includes(m.key)} className={`dash-chip${prefs.metrics.includes(m.key) ? " dash-chip-on" : ""}`} onClick={() => toggleMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <MonthChart points={yearData.months.map((p) => ({ month: p.month, future: p.future, values: chosenMetrics.map((m) => metricValue(p.metrics, m.key)) }))} metrics={chosenMetrics} />
        <div className="dash-best">
          {yearData.best ? (
            <span className="dash-change-good">
              🏆 أفضل شهر: {monthLabel(yearData.best.month)} · <bdi dir="ltr">{mru(yearData.best.metrics.netMru)}</bdi>
            </span>
          ) : (
            <span>{NO_DATA}</span>
          )}
          {yearData.worst && (
            <span className="dash-change-bad">
              ⚠️ أضعف شهر: {monthLabel(yearData.worst.month)} · <bdi dir="ltr">{mru(yearData.worst.metrics.netMru)}</bdi>
            </span>
          )}
        </div>
        <button type="button" className="text-action" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
          📋 {showTable ? "إخفاء الجدول" : "عرض الجدول"}
        </button>
        {showTable && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الصافي</th>
                  <th>الإيرادات</th>
                  <th>المصروفات</th>
                  <th>تجديد</th>
                  <th>النمو</th>
                </tr>
              </thead>
              <tbody>
                {yearData.months
                  .filter((p) => !p.future)
                  .map((p) => (
                    <tr key={p.month}>
                      <td>{SHORT_MONTHS[Number(p.month.slice(5, 7)) - 1]}</td>
                      <td className={p.metrics.netMru < 0 ? "dash-change-bad" : undefined}>
                        <bdi dir="ltr">{mru(p.metrics.netMru)}</bdi>
                      </td>
                      <td>
                        <bdi dir="ltr">{mru(p.metrics.revenueMru)}</bdi>
                      </td>
                      <td>
                        <bdi dir="ltr">{mru(p.metrics.expensesMru)}</bdi>
                      </td>
                      <td>{p.metrics.renewals}</td>
                      <td>{p.growthPct === null ? "—" : <bdi dir="ltr">{`${p.growthPct > 0 ? "+" : ""}${Math.round(p.growthPct)}%`}</bdi>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </DashSection>

      <DashSection id="rings" open={isOpen("rings")} onToggle={() => toggle("rings")}>
        <div className="fin-rings">
          <Ring label="الربح ÷ الإيرادات" ratio={current.revenueMru > 0 ? current.netMru / current.revenueMru : undefined} tone={current.netMru < 0 ? "bad" : "good"} how={`صافي الربح ${mru(current.netMru)} ÷ الإيرادات المحققة ${mru(current.revenueMru)} أوقية.`} />
          <Ring label="المصروفات ÷ الإيرادات" ratio={current.revenueMru > 0 ? current.expensesMru / current.revenueMru : undefined} tone="bad" how={`المصروفات ${mru(current.expensesMru)} ÷ الإيرادات المحققة ${mru(current.revenueMru)} أوقية.`} />
          <Ring label="نسبة التحصيل" ratio={debtFlow.ratioPct !== undefined ? debtFlow.ratioPct / 100 : undefined} tone="rev" how={`المحصّل من العملاء ${mru(debtFlow.collectedMru)} ÷ الديون الجديدة في الفترة ${mru(debtFlow.newDebtMru)} أوقية (تجديدات وتوثيق ومبيعات بالدين).`} />
          <Ring label="تجديدات مسددة لستارلينك" ratio={starlink.periodSettled + starlink.periodPending > 0 ? starlink.periodSettled / (starlink.periodSettled + starlink.periodPending) : undefined} tone="warn" how={`${starlink.periodSettled} تجديدًا سُددت تكلفته لستارلينك و${starlink.periodPending} ما زالت دينًا، من تجديدات الفترة.`} />
          {profitGoal && <Ring label="هدف ربح الشهر" ratio={profitGoal.ratio} tone="good" how={`ربح الشهر ${mru(profitGoal.done)} من هدف ${mru(profitGoal.target)} ${profitGoal.currency === "MRU" ? "أوقية" : profitGoal.currency}.`} />}
        </div>
        <Donut
          title="الإيرادات حسب النوع"
          slices={[
            { key: "starlink", label: "تجديدات ستارلينك", value: current.net.starlinkSalesMru },
            { key: "store", label: "مبيعات المتجر", value: current.net.storeSalesMru },
          ]}
        />
        <Donut title="الأموال الداخلة حسب المصدر" slices={sources.rows.map((r) => ({ key: r.key, label: r.label, value: r.mru }))} />
      </DashSection>

      <DashSection id="waterfall" open={isOpen("waterfall")} onToggle={() => toggle("waterfall")}>
        {current.empty ? (
          <p className="party-empty">{NO_DATA} في هذه الفترة.</p>
        ) : (
          <>
            <ul className="dash-waterfall">
              <WaterLine label={`📡 إيرادات تجديدات ستارلينك المحققة (${current.net.starlinkShipments})`} value={current.net.starlinkSalesMru} onClick={() => onOpenTab("starlink")} />
              <WaterLine label="− تكلفة ستارلينك المدفوعة" value={-current.net.starlinkCostMru} onClick={() => onOpenTab("starlink")} />
              <WaterLine label="− حصص المندوبين" value={-current.net.starlinkRepSharesMru} onClick={() => onOpenTab("net")} />
              <WaterLine label="🛍️ ربح المتجر (مبيعات − بضاعة − شحن − عمولات)" value={current.net.storeNetMru} onClick={() => onOpenTab("store")} />
              <WaterLine label="− المصروفات التشغيلية" value={-current.expensesMru} onClick={() => onOpenTab("net")} />
              <WaterLine label="= صافي الربح التشغيلي" value={current.netMru} total onClick={() => onOpenTab("net")} />
            </ul>
            <h3 className="dash-sub">خارج الربح (للمراجعة فقط)</h3>
            <ul className="dash-waterfall dash-waterfall-aside">
              <WaterLine label={`⏳ ربح معلّق - تكلفته ما زالت دينًا لستارلينك (${current.pendingCount})`} value={current.pendingProfitMru} approx aside onClick={() => onOpenTab("starlink")} />
              <WaterLine label="💵 المحصّل من العملاء - تحصيل وليس ربحًا" value={current.collectedMru} aside onClick={() => onOpenTab("debts")} />
              {snapshot.debtorsMru !== undefined && <WaterLine label="🧾 على العملاء الآن" value={snapshot.debtorsMru} approx aside onClick={() => onOpenTab("debts")} />}
              {snapshot.owedStarlinkMru !== undefined && <WaterLine label="🏭 عليّ لستارلينك الآن" value={-snapshot.owedStarlinkMru} approx aside onClick={() => onOpenTab("debts")} />}
            </ul>
            <p className="settings-hint">تحصيل دين قديم لا يُضاف إلى الربح مرة ثانية، وتسديد ستارلينك ليس مصروفًا جديدًا: التكلفة احتُسبت مع التجديد. مصروفاتك الشخصية في تبويب «المصروفات» منفصلة.</p>
          </>
        )}
      </DashSection>

      <DashSection id="sources" open={isOpen("sources")} onToggle={() => toggle("sources")}>
        <SourcesBody
          places={places}
          kinds={kinds}
          previousKinds={previousKinds}
          series={series}
          movements={periodMovements}
          method={method}
          onMethod={setMethod}
          creditSalesMru={sources.creditSalesMru}
          approx={sources.approx}
          ownerView={books.ownerView}
          onDrill={setDrill}
        >
          <h3 className="dash-sub">حسب وسيلة الدفع (مقارنة بالفترة السابقة)</h3>
          {sources.rows.length === 0 ? (
            <p className="party-empty">لا أموال داخلة في هذه الفترة.</p>
          ) : (
            <ul className="dash-sources">
              {sources.rows.map((m) => (
                <li key={m.key}>
                  <span className="dash-sources-label">
                    {m.label} <small>({m.count})</small>
                  </span>
                  <span className="dash-sources-bar" aria-hidden="true">
                    <i style={{ width: `${sources.totalMru > 0 ? Math.max(m.mru > 0 ? 2 : 0, (m.mru / sources.totalMru) * 100) : 0}%` }} />
                  </span>
                  <span className="dash-sources-value">
                    <bdi dir="ltr">{mru(m.mru)}</bdi> <small>{Math.round(m.share)}%</small>
                    <Change row={{ diff: m.mru - m.previousMru, pct: m.changePct, upIsGood: true }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Donut title="حصة كل وسيلة من الأموال الداخلة" slices={sources.rows.map((r) => ({ key: r.key, label: r.label, value: r.mru }))} />
          <Donut title="عدد العمليات حسب الوسيلة" slices={sources.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} unit="عملية" />
          <p className="settings-hint">
            كل مبلغ يُحسب مرة واحدة: دفعات الزبائن بوسيلتها، تسليم المندوبين، المدفوع عند البيع في المتجر، وقيود «داخل» اليدوية. التحويلات بين حساباتك لا تُعدّ دخلًا. الاستردادات غير مسجلة في التطبيق (المرتجع يُنقص دين الزبون فقط) فلا تظهر.
            {sources.missing.length > 0 && ` لم تُحتسب عملات بلا سعر: ${sources.missing.join("، ")}.`}
          </p>
        </SourcesBody>
      </DashSection>

      <DashSection id="starlink" open={isOpen("starlink")} onToggle={() => toggle("starlink")}>
        <StarlinkBody
          book={starBook}
          realizedProfitMru={starlink.realizedProfitMru}
          realizedCount={starlink.realizedCount}
          pendingProfitMru={starlink.pendingProfitMru}
          pendingCount={starlink.pendingCount}
          activeDevices={snapshot.activeDevices}
          activeClients={snapshot.activeClients}
          latePayers={[...customerDebts.rows].sort((a, b) => b.oldestDays - a.oldestDays).slice(0, 5)}
          minMarginPct={rules.minMarginPct}
          onDrill={setDrill}
        >
          <h3 className="dash-sub">⏰ تقترب من الانتهاء (7 أيام)</h3>
          {starlink.expiringSoon.length === 0 ? (
            <p className="party-empty">لا أجهزة تنتهي خلال 7 أيام.</p>
          ) : (
            <ul className="dash-rank">
              {starlink.expiringSoon.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <a href={homeSearchHref(r.name)}>{r.name}</a>
                  <small>{r.days === 0 ? "توقف هذه الليلة" : r.days === 1 ? "تنتهي اليوم" : `بعد ${r.days} أيام`}</small>
                  <span />
                </li>
              ))}
              {starlink.expiringSoon.length > 8 && <li className="dash-rank-more">+{starlink.expiringSoon.length - 8} جهاز آخر</li>}
            </ul>
          )}
          <button type="button" className="text-action" onClick={() => onOpenTab("starlink")}>
            كشف التجديدات الكامل ←
          </button>
        </StarlinkBody>
      </DashSection>

      <DashSection id="customers" open={isOpen("customers")} onToggle={() => toggle("customers")}>
        <CustomerDebtsBody debts={customerDebts} newDebtMru={debtFlow.newDebtMru} collectedMru={debtFlow.collectedMru} approx={debtFlow.approx} rules={rules} onDrill={setDrill}>
          <h3 className="dash-sub">
            التحصيلات (أزرق) مقابل الديون الجديدة (أحمر) - <bdi dir="ltr">{year}</bdi>
          </h3>
          <MonthChart points={debtYear} metrics={[{ key: "collected", label: "التحصيلات" }, { key: "debt", label: "الديون الجديدة" }]} />
          <p className="settings-hint">تحصيل دين قديم يُحسب هنا تحصيلًا فقط - لا يدخل الأرباح مرة ثانية.</p>
          <button type="button" className="text-action" onClick={() => onOpenTab("debts")}>
            قائمة المدينين في تبويب الديون ←
          </button>
        </CustomerDebtsBody>
      </DashSection>

      <DashSection id="suppliers" open={isOpen("suppliers")} onToggle={() => toggle("suppliers")}>
        <SupplierDebtsBody debts={supplierDebts} onDrill={setDrill} />
      </DashSection>

      {goalsOpen && (
        <GoalsEditSheet
          goals={goals}
          currencies={["MRU", ...Object.keys(input.rates).filter((c) => c !== "MRU" && input.rates[c])]}
          onSave={(next) => {
            saveAllGoals(next);
            setGoalsOpen(false);
          }}
          onClose={() => setGoalsOpen(false)}
        />
      )}
      {rulesOpen && (
        <AlertRulesSheet
          rules={rules}
          onSave={(next) => {
            saveAlertRules(next);
            setRules(next);
            setRulesOpen(false);
          }}
          onClose={() => setRulesOpen(false)}
        />
      )}
      {drill && <DrillSheet drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function WaterLine({ label, value, total, approx, aside, onClick }: { label: string; value: number; total?: boolean; approx?: boolean; aside?: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={`dash-water-line${total ? " dash-water-total" : ""}${aside ? " dash-water-aside" : ""}`} onClick={onClick}>
        <span>{label}</span>
        <bdi dir="ltr" className={!aside && value < 0 ? "dash-change-bad" : !aside && total && value > 0 ? "dash-change-good" : undefined}>
          {mru(value, approx)}
        </bdi>
      </button>
    </li>
  );
}

export type { PeriodMetrics };
