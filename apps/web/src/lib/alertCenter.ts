/**
 * 🔔 «مركز التنبيهات» (his Oct 9 2026 brief, part 5): profit, collection, Starlink and data-quality
 * alerts, each with a stable key so a page refresh never makes a second one, a severity (معلومات /
 * تحذير / حرج), its reason and amount, and a status: جديد → تمت مراجعته → تم حلّه.
 *
 * An alert is «تم حلّه» only when its cause is gone (it is not raised any more) - opening it only
 * marks it reviewed. Where a cause can be legitimate (a renewal sold under its margin on purpose, a
 * suspected duplicate that isn't one, payments without a method) he can say «تمت المعالجة» and it
 * stays quiet until its numbers change (its `fingerprint`).
 *
 * Every alert is computed from the records on fixed windows (this month so far vs the same days of
 * last month, the last 30 days, now) - not from the dashboard's chosen period, so changing the
 * period never «resolves» anything. Rules (thresholds, on/off, severity) are his, per phone. Pure +
 * two small stores.
 */

import { allocatedFromPayment, paidTowardShipment, type PaymentAllocation } from "./paymentAllocationStore";
import type { DebtorRow, StarlinkOwedRow } from "./financeDebts";
import type { RenewalRow } from "./financeStarlink";
import type { GoalProgressItem } from "./financeGoals";
import { isLegacyShipmentEntry, isShipmentEntry, type LedgerByAccount } from "./ledgerStore";
import type { RatesFromUsd } from "./reportsView";

export type AlertSeverity = "info" | "warn" | "critical";
export type AlertGroup = "profit" | "collection" | "starlink" | "data";

export const SEVERITY_LABELS: Record<AlertSeverity, string> = { info: "معلومات", warn: "تحذير", critical: "حرج" };
export const GROUP_LABELS: Record<AlertGroup, string> = { profit: "📈 الأرباح", collection: "💵 التحصيل", starlink: "📡 Starlink", data: "🩺 جودة البيانات" };

export type AlertType =
  | "profit-below-goal"
  | "profit-drop"
  | "negative-margin"
  | "low-margin"
  | "expense-spike"
  | "goal-ceiling"
  | "client-debt-limit"
  | "no-collection"
  | "promise-overdue"
  | "debts-up"
  | "debt-ratio"
  | "total-debts-max"
  | "customer-credit"
  | "starlink-owed"
  | "starlink-old-d"
  | "starlink-due-soon"
  | "incomplete-renewal"
  | "duplicate-op"
  | "allocation-mismatch"
  | "missing-rate"
  | "no-method";

export const ALERT_TYPES: { type: AlertType; group: AlertGroup; label: string; severity: AlertSeverity; ackable: boolean }[] = [
  { type: "profit-below-goal", group: "profit", label: "الربح أقل من وتيرة الهدف", severity: "warn", ackable: false },
  { type: "profit-drop", group: "profit", label: "تراجع الربح عن الشهر الماضي", severity: "warn", ackable: false },
  { type: "negative-margin", group: "profit", label: "تجديد بهامش سالب (خسارة)", severity: "critical", ackable: true },
  { type: "low-margin", group: "profit", label: "هامش أقل من الحد الأدنى", severity: "warn", ackable: true },
  { type: "expense-spike", group: "profit", label: "ارتفاع غير معتاد في المصروفات", severity: "warn", ackable: false },
  { type: "goal-ceiling", group: "profit", label: "تجاوز حد وضعته (مصروفات / ديون)", severity: "warn", ackable: false },
  { type: "client-debt-limit", group: "collection", label: "دين زبون فوق الحد", severity: "warn", ackable: true },
  { type: "no-collection", group: "collection", label: "مدة طويلة بلا تحصيل", severity: "warn", ackable: true },
  { type: "promise-overdue", group: "collection", label: "تأخر عن موعد وعد الدفع", severity: "critical", ackable: false },
  { type: "debts-up", group: "collection", label: "الديون الجديدة أكثر من التحصيل", severity: "warn", ackable: false },
  { type: "debt-ratio", group: "collection", label: "ارتفاع نسبة الديون إلى المبيعات", severity: "warn", ackable: false },
  { type: "total-debts-max", group: "collection", label: "إجمالي الديون فوق الحد", severity: "critical", ackable: false },
  { type: "customer-credit", group: "collection", label: "دفعات زائدة غير موزعة (رصيد للزبون)", severity: "info", ackable: true },
  { type: "starlink-owed", group: "starlink", label: "تجديدات غير مسددة لستارلينك", severity: "warn", ackable: false },
  { type: "starlink-old-d", group: "starlink", label: "تكلفة ستارلينك غير مسددة منذ أكثر من 30 يومًا", severity: "critical", ackable: false },
  { type: "starlink-due-soon", group: "starlink", label: "تجديدات تقترب ورصيد البطاقة", severity: "info", ackable: false },
  { type: "incomplete-renewal", group: "starlink", label: "تجديد بلا تكلفة أو بلا قيمة بيع", severity: "warn", ackable: true },
  { type: "duplicate-op", group: "data", label: "عملية مكررة محتملة", severity: "warn", ackable: true },
  { type: "allocation-mismatch", group: "data", label: "تخصيص دفعات لا يطابق الكشف", severity: "critical", ackable: false },
  { type: "missing-rate", group: "data", label: "عملة بلا سعر صرف", severity: "critical", ackable: false },
  { type: "no-method", group: "data", label: "دفعات بلا طريقة دفع", severity: "info", ackable: true },
];

export interface AlertRules {
  /** A renewal's margin under this % is «هامش منخفض». */
  minMarginPct: number;
  /** One customer's debt above this (أوقية) is flagged. */
  clientDebtLimitMru: number;
  /** All customers' debts above this (أوقية); empty = off. */
  totalDebtsMaxMru?: number;
  /** Expenses this % above the same days of last month (and ≥ 1,000). */
  expenseSpikePct: number;
  /** A debtor who paid nothing for this many days. */
  noCollectionDays: number;
  /** Renewals still owing Starlink before it's flagged. */
  starlinkOwedCount: number;
  disabled: AlertType[];
  severity: Partial<Record<AlertType, AlertSeverity>>;
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  minMarginPct: 10,
  clientDebtLimitMru: 30000,
  expenseSpikePct: 30,
  noCollectionDays: 30,
  starlinkOwedCount: 3,
  disabled: [],
  severity: {},
};

export interface CenterAlert {
  key: string;
  type: AlertType;
  group: AlertGroup;
  severity: AlertSeverity;
  title: string;
  /** Why it shows, with its numbers. */
  reason: string;
  amount?: { value: number; currency: string };
  /** What «التفاصيل» opens. */
  ref?: { kind: "device" | "client" | "tab" | "section"; id: string; label?: string };
  ackable: boolean;
  /** Changes when its numbers change: a handled alert comes back then. */
  fingerprint: string;
}

export interface AlertInput {
  today: string;
  /** This month so far vs the same days of last month. */
  monthNetMru: number;
  lastMonthNetMru: number;
  monthExpensesMru: number;
  lastMonthExpensesMru: number;
  monthNewDebtMru: number;
  monthCollectedMru: number;
  /** Sales (renewals + store) of the last 30 days, أوقية. */
  salesLast30Mru: number;
  goals: GoalProgressItem[];
  /** Renewals of the last 30 days (financeStarlink.buildRenewalRows). */
  renewals: RenewalRow[];
  debtors: DebtorRow[];
  totalDebtsMru: number;
  openDebtsGoalMru?: number;
  credits: { key: string; name: string; currency: string; amount: number }[];
  starlinkOwed: StarlinkOwedRow[];
  starlinkOwedMru?: number;
  upcomingStarlinkUsd: number;
  upcomingCount: number;
  cardBalanceUsd?: number;
  ledger: LedgerByAccount;
  allocations: PaymentAllocation[];
  rates: RatesFromUsd;
  /** Currencies used by any record (ledger, cash, invoices…). */
  usedCurrencies: string[];
  deviceName: (accountId: string) => string;
}

/** Numbers, % and dates inside Arabic text: isolated left-to-right (U+2066 … U+2069). */
const ltr = (s: string) => `\u2066${s}\u2069`;
const fmt = (v: number) => ltr(`${v < 0 ? "-" : ""}${Math.round(Math.abs(v)).toLocaleString("en-US")}`);
const pctText = (v: number) => ltr(`${Math.round(v)}%`);

export function buildCenterAlerts(input: AlertInput, rules: AlertRules = DEFAULT_ALERT_RULES): CenterAlert[] {
  const out: CenterAlert[] = [];
  const month = input.today.slice(0, 7);
  const put = (type: AlertType, a: Omit<CenterAlert, "type" | "group" | "severity" | "ackable">, severity?: AlertSeverity) => {
    if (rules.disabled.includes(type)) return;
    const meta = ALERT_TYPES.find((t) => t.type === type)!;
    out.push({ ...a, type, group: meta.group, severity: rules.severity[type] ?? severity ?? meta.severity, ackable: meta.ackable });
  };

  // ---- 📈 profit ----
  const goal = input.goals.find((g) => g.key === "profitMonthMru");
  if (goal && goal.pace === "behind" && Number(input.today.slice(8, 10)) >= 5) {
    put("profit-below-goal", {
      key: `profit-below-goal:${month}`,
      title: `ربح الشهر أقل من وتيرة هدفه: ${pctText(goal.ratio * 100)}`,
      reason: `حققت ${fmt(goal.done)} من ${fmt(goal.target)} ${goal.currency === "MRU" ? "أوقية" : goal.currency}، والوتيرة المتساوية تقول ${fmt(goal.expected)} حتى اليوم. المطلوب يوميًا: ${fmt(goal.perDay ?? 0)}.`,
      amount: { value: goal.remaining, currency: goal.currency || "MRU" },
      ref: { kind: "section", id: "goals" },
      fingerprint: String(Math.round(goal.ratio * 10)),
    });
  }
  if (input.lastMonthNetMru > 0) {
    const pct = ((input.monthNetMru - input.lastMonthNetMru) / input.lastMonthNetMru) * 100;
    if (pct <= -20) {
      put("profit-drop", {
        key: `profit-drop:${month}`,
        title: `صافي الربح أقل بـ ${pctText(-pct)} من نفس الأيام من الشهر الماضي`,
        reason: `${fmt(input.monthNetMru)} أوقية هذا الشهر حتى اليوم مقابل ${fmt(input.lastMonthNetMru)} في نفس الأيام من الشهر الماضي.`,
        amount: { value: input.monthNetMru - input.lastMonthNetMru, currency: "MRU" },
        ref: { kind: "section", id: "compare" },
        fingerprint: String(Math.round(pct / 10)),
      });
    }
  }
  for (const r of input.renewals) {
    if (!r.complete || r.marginMru === undefined) continue;
    const label = `${r.device}${r.client ? ` (${r.client})` : ""} · ${ltr(r.date)}`;
    if (r.marginMru < -0.5) {
      put("negative-margin", { key: `negative-margin:${r.entryId}`, title: `تجديد بخسارة: ${label}`, reason: `البيع ${fmt(r.saleMru ?? 0)} وتكلفة ستارلينك ${fmt(r.costMru ?? 0)} أوقية → هامش ${fmt(r.marginMru)}. غالبًا خطأ في المبلغ أو سعر الصرف.`, amount: { value: r.marginMru, currency: "MRU" }, ref: { kind: "device", id: r.accountId, label: r.device }, fingerprint: String(Math.round(r.marginMru)) });
    } else if (r.marginPct !== undefined && r.marginPct < rules.minMarginPct) {
      put("low-margin", { key: `low-margin:${r.entryId}`, title: `هامش ${pctText(r.marginPct)} فقط: ${label}`, reason: `أقل من الحد الأدنى ${rules.minMarginPct}% (البيع ${fmt(r.saleMru ?? 0)}، التكلفة ${fmt(r.costMru ?? 0)} أوقية).`, amount: { value: r.marginMru, currency: "MRU" }, ref: { kind: "device", id: r.accountId, label: r.device }, fingerprint: String(Math.round(r.marginPct)) });
    }
  }
  if (input.lastMonthExpensesMru > 0) {
    const pct = ((input.monthExpensesMru - input.lastMonthExpensesMru) / input.lastMonthExpensesMru) * 100;
    if (pct >= rules.expenseSpikePct && input.monthExpensesMru - input.lastMonthExpensesMru >= 1000) {
      put("expense-spike", { key: `expense-spike:${month}`, title: `المصروفات أعلى بـ ${pctText(pct)} من نفس الأيام من الشهر الماضي`, reason: `${fmt(input.monthExpensesMru)} مقابل ${fmt(input.lastMonthExpensesMru)} أوقية.`, amount: { value: input.monthExpensesMru, currency: "MRU" }, ref: { kind: "tab", id: "net" }, fingerprint: String(Math.round(pct / 10)) });
    }
  }

  for (const g of input.goals) {
    if (!g.ceiling || g.status !== "over") continue;
    put("goal-ceiling", {
      key: `goal-ceiling:${g.key}:${g.period === "month" ? month : input.today}`,
      title: `تجاوزت «${g.label}»: ${pctText(g.ratio * 100)}`,
      reason: `${fmt(g.done)} والحد ${fmt(g.target)} ${g.currency === "MRU" ? "أوقية" : g.currency}. هنا الأقل أفضل.`,
      amount: { value: -g.remaining, currency: g.currency || "MRU" },
      ref: { kind: "section", id: "goals" },
      fingerprint: String(Math.round(g.ratio * 10)),
    });
  }

  // ---- 💵 collection ----
  for (const d of input.debtors) {
    const ref = { kind: d.kind === "client" ? ("client" as const) : ("device" as const), id: d.id, label: d.name };
    if (d.mru !== undefined && d.mru > rules.clientDebtLimitMru) {
      put("client-debt-limit", { key: `client-debt-limit:${d.key}`, title: `${d.name}: دينه فوق الحد`, reason: `عليه ${fmt(d.total)} ${d.currency} (≈ ${fmt(d.mru)} أوقية) والحد ${fmt(rules.clientDebtLimitMru)} أوقية.`, amount: { value: d.total, currency: d.currency }, ref, fingerprint: String(Math.round(d.mru / 1000)) });
    }
    const quiet = d.daysSincePayment ?? d.oldestDays;
    if (quiet >= rules.noCollectionDays) {
      put("no-collection", { key: `no-collection:${d.key}`, title: `${d.name}: ${d.daysSincePayment === undefined ? "لم يدفع أبدًا" : `لم يدفع منذ ${d.daysSincePayment} يومًا`}`, reason: `عليه ${fmt(d.total)} ${d.currency}، أقدم دين عمره ${d.oldestDays} يومًا. هذا عمر الدين، وليس تأخرًا عن موعد متفق عليه.`, amount: { value: d.total, currency: d.currency }, ref, fingerprint: String(Math.round(d.total)) });
    }
    if (d.overdue > 0.5) {
      put("promise-overdue", { key: `promise-overdue:${d.key}`, title: `${d.name}: تأخر عن موعد وعده`, reason: `وعد بدفع ${fmt(d.overdue)} ${d.currency} في يوم مضى ولم يُسجَّل الوعد كمنفَّذ.`, amount: { value: d.overdue, currency: d.currency }, ref, fingerprint: String(Math.round(d.overdue)) });
    }
  }
  if (input.monthNewDebtMru - input.monthCollectedMru >= 1000) {
    put("debts-up", { key: `debts-up:${month}`, title: "الديون الجديدة هذا الشهر أكثر من التحصيل", reason: `ديون جديدة ${fmt(input.monthNewDebtMru)} مقابل تحصيل ${fmt(input.monthCollectedMru)} أوقية.`, amount: { value: input.monthNewDebtMru - input.monthCollectedMru, currency: "MRU" }, ref: { kind: "section", id: "customers" }, fingerprint: String(Math.round((input.monthNewDebtMru - input.monthCollectedMru) / 1000)) });
  }
  if (input.salesLast30Mru > 0 && input.totalDebtsMru / input.salesLast30Mru >= 1.5) {
    const ratio = input.totalDebtsMru / input.salesLast30Mru;
    put("debt-ratio", { key: "debt-ratio", title: `الديون على الزبائن = ${pctText(ratio * 100)} من مبيعات آخر 30 يومًا`, reason: `على الزبائن ${fmt(input.totalDebtsMru)} أوقية، ومبيعات آخر 30 يومًا ${fmt(input.salesLast30Mru)}.`, amount: { value: input.totalDebtsMru, currency: "MRU" }, ref: { kind: "section", id: "customers" }, fingerprint: String(Math.round(ratio * 10)) });
  }
  const maxDebts = rules.totalDebtsMaxMru ?? input.openDebtsGoalMru;
  if (maxDebts && input.totalDebtsMru > maxDebts) {
    put("total-debts-max", { key: "total-debts-max", title: "إجمالي الديون فوق الحد", reason: `على الزبائن ${fmt(input.totalDebtsMru)} أوقية والحد ${fmt(maxDebts)}.`, amount: { value: input.totalDebtsMru - maxDebts, currency: "MRU" }, ref: { kind: "section", id: "customers" }, fingerprint: String(Math.round(input.totalDebtsMru / 1000)) });
  }
  if (input.credits.length > 0) {
    put("customer-credit", { key: "customer-credit", title: `${input.credits.length} زبون لهم رصيد زائد عندك`, reason: `دفعوا أكثر مما عليهم (${input.credits.slice(0, 3).map((c) => `${c.name}: ${fmt(c.amount)} ${c.currency}`).join("، ")}${input.credits.length > 3 ? "…" : ""}). يبقى رصيدًا لهم حتى تقرر: يُخصم من تجديدهم القادم أو يُردّ.`, ref: { kind: "section", id: "customers" }, fingerprint: input.credits.map((c) => `${c.key}:${Math.round(c.amount)}`).join("|") });
  }

  // ---- 📡 Starlink ----
  if (input.starlinkOwed.length >= rules.starlinkOwedCount) {
    put("starlink-owed", { key: "starlink-owed", title: `عليك لستارلينك ${input.starlinkOwed.length} تكلفة غير مسددة`, reason: `${input.starlinkOwedMru !== undefined ? `≈ ${fmt(input.starlinkOwedMru)} أوقية. ` : ""}أرباح هذه التجديدات معلّقة حتى تسدّدها.`, amount: { value: input.starlinkOwed.reduce((s, r) => s + r.usd, 0), currency: "USD" }, ref: { kind: "section", id: "suppliers" }, fingerprint: String(input.starlinkOwed.length) });
  }
  const old = input.starlinkOwed.filter((r) => r.ageDays > 30);
  if (old.length > 0) {
    put("starlink-old-d", { key: "starlink-old-d", title: `${old.length} تكلفة لستارلينك عمرها أكثر من 30 يومًا`, reason: `أقدمها: ${old[0]!.device} منذ ${old[0]!.ageDays} يومًا (${fmt(old[0]!.usd)} $).`, amount: { value: old.reduce((s, r) => s + r.usd, 0), currency: "USD" }, ref: { kind: "section", id: "suppliers" }, fingerprint: String(old.length) });
  }
  if (input.upcomingCount > 0) {
    const short = input.cardBalanceUsd !== undefined && input.cardBalanceUsd < input.upcomingStarlinkUsd;
    put(
      "starlink-due-soon",
      {
        key: "starlink-due-soon",
        title: `${input.upcomingCount} جهاز يتجدد خلال 7 أيام${short ? " - رصيد البطاقة لا يكفي" : ""}`,
        reason: `تكلفتها حسب سعرها الشهري ≈ ${fmt(input.upcomingStarlinkUsd)} $${input.cardBalanceUsd !== undefined ? `، ورصيد بطاقة KAST ${fmt(input.cardBalanceUsd)} $` : ""}.`,
        amount: { value: input.upcomingStarlinkUsd, currency: "USD" },
        ref: { kind: "section", id: "suppliers" },
        fingerprint: `${input.upcomingCount}:${short}`,
      },
      short ? "warn" : undefined,
    );
  }
  const incomplete = input.renewals.filter((r) => !r.complete);
  if (incomplete.length > 0) {
    put("incomplete-renewal", { key: "incomplete-renewal", title: `${incomplete.length} تجديد بيانات غير مكتملة`, reason: `بلا تكلفة ستارلينك أو بلا قيمة البيع بالدولار - لا يُحسب ربحه ولا يُصنَّف رابحًا أو خاسرًا. مثال: ${incomplete[0]!.device} · ${ltr(incomplete[0]!.date)}.`, ref: { kind: "device", id: incomplete[0]!.accountId, label: incomplete[0]!.device }, fingerprint: String(incomplete.length) });
  }

  // ---- 🩺 data quality ----
  for (const issue of dataQualityIssues(input)) put(issue.type, issue.alert);
  const rank: Record<AlertSeverity, number> = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function dataQualityIssues(input: AlertInput): { type: AlertType; alert: Omit<CenterAlert, "type" | "group" | "severity" | "ackable"> }[] {
  const issues: { type: AlertType; alert: Omit<CenterAlert, "type" | "group" | "severity" | "ackable"> }[] = [];
  const since90 = new Date(Date.parse(`${input.today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const entryIds = new Set<string>();
  const amounts = new Map<string, number>();
  let noMethod = 0;
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    for (const e of entries) {
      entryIds.add(e.id);
      amounts.set(e.id, e.amount);
      if (e.kind === "credit" && !e.paymentMethod && !e.heldByRepId && e.date >= since90) noMethod += 1;
    }
    // Same device, same kind, amount, currency and day, saved within 10 minutes of each other.
    const sorted = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.kind !== b.kind || a.amount !== b.amount || a.currency !== b.currency || a.date !== b.date || b.date < since90) continue;
      const gap = Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt));
      if (!Number.isFinite(gap) || gap > 10 * 60_000) continue;
      if (a.travelFeeFor || b.travelFeeFor) continue;
      issues.push({
        type: "duplicate-op",
        alert: {
          key: `duplicate-op:${a.id}:${b.id}`,
          title: `عملية مكررة محتملة: ${input.deviceName(accountId)}`,
          reason: `${a.kind === "debit" ? "عليه" : "له"} ${fmt(a.amount)} ${a.currency} مرتين يوم ${ltr(a.date)}، سُجّلتا بفارق ${Math.round(gap / 60_000)} دقيقة. احذف المكررة، أو اضغط «تمت المعالجة» إن كانتا عمليتين حقيقيتين.`,
          amount: { value: a.amount, currency: a.currency },
          ref: { kind: "device", id: accountId, label: input.deviceName(accountId) },
          fingerprint: "1",
        },
      });
    }
  }
  // Allocations: a payment spread beyond its amount, a renewal paid beyond its price, or a link to
  // an operation that no longer exists - the statement and the payments would disagree.
  const broken = new Set<string>();
  for (const a of input.allocations) {
    if (!entryIds.has(a.paymentEntryId) || !entryIds.has(a.shipmentEntryId)) broken.add(a.paymentEntryId);
    else if (allocatedFromPayment(input.allocations, a.paymentEntryId) > (amounts.get(a.paymentEntryId) ?? 0) + 0.01) broken.add(a.paymentEntryId);
    else if (paidTowardShipment(input.allocations, a.shipmentEntryId) > (amounts.get(a.shipmentEntryId) ?? 0) + 0.01) broken.add(a.shipmentEntryId);
  }
  if (broken.size > 0) {
    issues.push({ type: "allocation-mismatch", alert: { key: "allocation-mismatch", title: `${broken.size} دفعة/تجديد تخصيصها لا يطابق الكشف`, reason: "دفعة موزعة بأكثر من مبلغها، أو تجديد مدفوع بأكثر من سعره، أو تخصيص لعملية حُذفت. افتح «تخصيص الدفعة» في كشف الجهاز وصحّحه.", fingerprint: [...broken].sort().join("|") } });
  }
  for (const code of input.usedCurrencies) {
    if (code === "USD" || (input.rates[code] && input.rates.MRU)) continue;
    issues.push({ type: "missing-rate", alert: { key: `missing-rate:${code}`, title: `العملة ${code} بلا سعر صرف`, reason: "مبالغها لا تدخل أي مجموع بالأوقية حتى تضع سعرها في «العملات».", ref: { kind: "tab", id: "rates" }, fingerprint: "1" } });
  }
  if (noMethod > 0) {
    issues.push({ type: "no-method", alert: { key: "no-method", title: `${noMethod} دفعة بلا طريقة دفع (آخر 90 يومًا)`, reason: "لا يُعرف في أي حساب دخلت - تظهر في «بدون وسيلة» في مصادر الأموال.", fingerprint: String(noMethod) } });
  }
  // A recent shipment with no cost info at all (an older record format) - its profit can't be known.
  let legacy = 0;
  for (const entries of Object.values(input.ledger)) for (const e of entries) if (isShipmentEntry(e) && isLegacyShipmentEntry(e) && e.date >= since90) legacy += 1;
  if (legacy > 0) {
    issues.push({ type: "incomplete-renewal", alert: { key: "incomplete-legacy", title: `${legacy} شحنة بصيغة قديمة بلا معلومات تكلفة`, reason: "سُجّلت بلا تكلفة ستارلينك، فلا يمكن حساب ربحها. أكملها من كشف الجهاز.", fingerprint: String(legacy) } });
  }
  return issues;
}

// ---- Status: new → reviewed / handled → resolved ----

export type AlertStatus = "new" | "reviewed" | "acknowledged" | "resolved";

export const STATUS_LABELS: Record<AlertStatus, string> = { new: "جديد", reviewed: "تمت مراجعته", acknowledged: "تمت المعالجة", resolved: "تم حلّه" };

export interface AlertState {
  status: AlertStatus;
  firstSeen: string;
  lastSeen: string;
  reviewedAt?: string;
  ackAt?: string;
  resolvedAt?: string;
  fingerprint: string;
  /** Kept to list a resolved alert after its cause is gone. */
  title: string;
  severity: AlertSeverity;
  type: AlertType;
}

export type AlertStates = Record<string, AlertState>;

/** One pass after computing the alerts: new ones are created once (stable key), a handled one whose
 * numbers changed comes back as new, and one whose cause is gone becomes «تم حلّه» with the time. */
export function reconcileAlertStates(states: AlertStates, alerts: CenterAlert[], now: string): AlertStates {
  const next: AlertStates = {};
  const live = new Set<string>();
  for (const a of alerts) {
    live.add(a.key);
    const prev = states[a.key];
    if (!prev || prev.status === "resolved") {
      next[a.key] = { status: "new", firstSeen: now, lastSeen: now, fingerprint: a.fingerprint, title: a.title, severity: a.severity, type: a.type };
      continue;
    }
    const changed = prev.fingerprint !== a.fingerprint;
    next[a.key] = {
      ...prev,
      ...(changed && prev.status !== "new" ? { status: "new" as const, reviewedAt: undefined, ackAt: undefined } : {}),
      lastSeen: now,
      fingerprint: a.fingerprint,
      title: a.title,
      severity: a.severity,
      type: a.type,
    };
  }
  const t = Date.parse(now);
  const keepFrom = Number.isFinite(t) ? new Date(t - 60 * 86_400_000).toISOString() : "";
  for (const [key, s] of Object.entries(states)) {
    if (live.has(key)) continue;
    if (s.status === "resolved") {
      if ((s.resolvedAt ?? s.lastSeen) >= keepFrom) next[key] = s;
    } else next[key] = { ...s, status: "resolved", resolvedAt: now };
  }
  return next;
}

export function markAlertReviewed(states: AlertStates, key: string, now: string): AlertStates {
  const s = states[key];
  if (!s || s.status !== "new") return states;
  return { ...states, [key]: { ...s, status: "reviewed", reviewedAt: now } };
}

/** «تمت المعالجة» - only for an alert whose cause can be legitimate (ALERT_TYPES.ackable). */
export function acknowledgeAlert(states: AlertStates, alert: Pick<CenterAlert, "key" | "ackable">, now: string): AlertStates {
  const s = states[alert.key];
  if (!s || !alert.ackable || s.status === "resolved") return states;
  return { ...states, [alert.key]: { ...s, status: "acknowledged", ackAt: now, reviewedAt: s.reviewedAt ?? now } };
}

export function sameStates(a: AlertStates, b: AlertStates): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const STATES_KEY = "starnet_alert_states_v1";
const RULES_KEY = "starnet.alertRules";

export function loadAlertStates(): AlertStates {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STATES_KEY) ?? "{}") as AlertStates;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAlertStates(states: AlertStates): void {
  try {
    window.localStorage.setItem(STATES_KEY, JSON.stringify(states));
  } catch {
    // storage full - the alerts are recomputed anyway
  }
}

export function loadAlertRules(): AlertRules {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RULES_KEY) ?? "null") as Partial<AlertRules> | null;
    return { ...DEFAULT_ALERT_RULES, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return DEFAULT_ALERT_RULES;
  }
}

export function saveAlertRules(rules: AlertRules): void {
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // a per-phone setting
  }
}
