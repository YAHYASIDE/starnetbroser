/**
 * 💰 «حسابي» as a financial dashboard (his Oct 12 2026 request): the four summary cards, the money per
 * currency, the page's sections (folded / unfolded, remembered on the phone), one search over every
 * money record, the money alerts and the quick comparisons. Pure - the page only wires it.
 *
 * Every figure comes from `buildWealth` (lib/myMoney.ts) and the dashboard's period metrics
 * (lib/financeDashboard.ts) - nothing is recomputed another way, so no two numbers disagree:
 *  - a transfer between two of my places moves money, it never adds any (it is not income);
 *  - each debt is one line only: a rep's customers owe the rep, not me (ourDebtLedger), so their
 *    debt is counted once - inside «لك عند المندوبين».
 * أوقية figures are display-only (today's registered rates); each card also lists the real
 * amounts in their own currencies.
 */

import { cashCurrencyLabel } from "./cashCurrencies";
import { addMonths, buildComparison, buildPeriodMetrics, type CompareRow, type DashInput, type DateRange } from "./financeDashboard";
import { formatAmount } from "./formatAmount";
import { matches, normalizeSearchText } from "./homeInsights";
import type { Wealth, WealthLine } from "./myMoney";
import { toMru, type RatesFromUsd } from "./reportsView";

const EPS = 0.0001;

function addInto(into: Record<string, number>, from: Record<string, number>, sign = 1): void {
  for (const [code, v] of Object.entries(from)) if (Math.abs(v) > EPS) into[code] = (into[code] ?? 0) + v * sign;
}

function clean(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => Math.abs(v) > 0.005));
}

// ---- أولًا: the summary ----

export type SummaryKey = "available" | "net" | "obligations" | "receivables";

export interface SummaryFigure {
  key: SummaryKey;
  icon: string;
  label: string;
  /** ≈ أوقية at today's rates. */
  mru: number;
  /** The real amounts, each in its own currency. */
  byCurrency: Record<string, number>;
  /** The wealth lines it is made of (they open from the card). */
  lineKeys: string[];
  how: string;
}

export interface MoneySummary {
  figures: SummaryFigure[];
  /** «في يدك الآن» = available − obligations (before what others owe me). */
  inHandMru: number;
  missing: string[];
}

export function buildMoneySummary(wealth: Wealth): MoneySummary {
  const of = (kind: WealthLine["kind"]) => wealth.lines.filter((l) => l.kind === kind);
  const sumCurrencies = (lines: WealthLine[]) => {
    const out: Record<string, number> = {};
    for (const l of lines) addInto(out, l.byCurrency);
    return clean(out);
  };
  const have = of("have");
  const owed = of("owed");
  const owe = of("owe");
  const net: Record<string, number> = {};
  for (const l of have) addInto(net, l.byCurrency);
  for (const l of owed) addInto(net, l.byCurrency);
  for (const l of owe) addInto(net, l.byCurrency, -1);
  const total = (lines: WealthLine[]) => lines.reduce((s, l) => s + l.mru, 0);
  return {
    figures: [
      { key: "available", icon: "💼", label: "المال المتاح", mru: wealth.haveMru, byCurrency: sumCurrencies(have), lineKeys: have.map((l) => l.key), how: "الكاش بكل عملاته + كل البنوك والمحافظ + محفظة KAST، الآن. التحويل بين حساباتك ينقل المال ولا يزيده." },
      { key: "net", icon: "⚖️", label: "صافي المركز المالي", mru: wealth.totalMru, byCurrency: clean(net), lineKeys: wealth.lines.map((l) => l.key), how: "المال المتاح + المستحقات لك − الالتزامات عليك. كل دين يُحسب مرة واحدة فقط." },
      { key: "obligations", icon: "📤", label: "إجمالي الالتزامات", mru: total(owe), byCurrency: sumCurrencies(owe), lineKeys: owe.map((l) => l.key), how: "ما عليك الآن: ستارلينك (D والديون السابقة) + أرصدة الزبائن عندك + الموردون + المندوبون." },
      { key: "receivables", icon: "📥", label: "المستحقات لك", mru: total(owed), byCurrency: sumCurrencies(owed), lineKeys: owed.map((l) => l.key), how: "ما لك عند الآخرين الآن: الزبائن (والتحويلات غير المدفوعة) + المندوبون. ديون زبائن المندوب تُحسب عليه هو، لا مرتين." },
    ],
    inHandMru: wealth.inHandMru,
    missing: wealth.missing,
  };
}

// ---- 💱 the currencies ----

export interface CurrencyHolding {
  code: string;
  label: string;
  /** What I have in it (cash + apps + wallets). */
  have: number;
  /** Owed to me in it. */
  owed: number;
  /** What I owe in it. */
  owe: number;
  /** have + owed − owe. */
  net: number;
  /** ≈ أوقية of `have` / `net`; undefined without a rate. */
  haveMru?: number;
  netMru?: number;
  /** The registered rate (units per 1 USD). */
  rate?: number;
}

export function buildCurrencyHoldings(wealth: Wealth, rates: RatesFromUsd): CurrencyHolding[] {
  const map = new Map<string, CurrencyHolding>();
  const get = (code: string) => {
    let h = map.get(code);
    if (!h) {
      h = { code, label: cashCurrencyLabel(code), have: 0, owed: 0, owe: 0, net: 0, ...(rates[code] ? { rate: rates[code] } : {}) };
      map.set(code, h);
    }
    return h;
  };
  for (const line of wealth.lines) {
    for (const [code, v] of Object.entries(line.byCurrency)) {
      if (Math.abs(v) <= EPS) continue;
      get(code)[line.kind] += v;
    }
  }
  const list = [...map.values()].map((h) => {
    const net = h.have + h.owed - h.owe;
    const haveMru = toMru(h.have, h.code, rates);
    const netMru = toMru(net, h.code, rates);
    return { ...h, net, ...(haveMru !== undefined ? { haveMru } : {}), ...(netMru !== undefined ? { netMru } : {}) };
  });
  // The biggest holding first; a currency without a rate last.
  return list.sort((a, b) => (b.haveMru ?? -Infinity) - (a.haveMru ?? -Infinity) || a.code.localeCompare(b.code));
}

/** Each currency's share of what I have (≈ أوقية), for the distribution bar - positive holdings only. */
export function currencyShares(holdings: CurrencyHolding[]): { code: string; label: string; mru: number; pct: number }[] {
  const positive = holdings.filter((h) => (h.haveMru ?? 0) > 0.5);
  const total = positive.reduce((s, h) => s + h.haveMru!, 0);
  if (total <= 0) return [];
  return positive.map((h) => ({ code: h.code, label: h.label, mru: h.haveMru!, pct: (h.haveMru! / total) * 100 }));
}

// ---- ثانيًا: the sections ----

export type MoneySectionId =
  | "alerts"
  | "period"
  | "wallets"
  | "currencies"
  | "starlink"
  | "customers"
  | "suppliers"
  | "reps"
  | "receivables"
  | "transfers"
  | "compare"
  | "analysis"
  | "records"
  | "reset";

export const MONEY_SECTIONS: { id: MoneySectionId; icon: string; title: string; keywords: string }[] = [
  { id: "alerts", icon: "🔔", title: "التنبيهات", keywords: "تنبيه متأخر مستحق منخفض خطأ فرق" },
  { id: "period", icon: "📅", title: "يبقى لك", keywords: "اليوم امس الشهر ربح دخل مصروف" },
  { id: "wallets", icon: "💼", title: "المحافظ والكاش", keywords: "كاش بنك بنكيلي سداد مصرفي اورانج نيتا بينانس كاست محفظة رصيد" },
  { id: "currencies", icon: "💱", title: "العملات", keywords: "اوقية سيفا دولار فرانك دينار سعر صرف" },
  { id: "starlink", icon: "🛰️", title: "ديون ستارلينك", keywords: "ستارلينك d دين تكلفة بطاقة" },
  { id: "customers", icon: "👥", title: "ديون الزبائن", keywords: "زبون زبائن عملاء دين رصيد" },
  { id: "suppliers", icon: "🏭", title: "الموردون", keywords: "مورد موردين فاتورة شراء" },
  { id: "reps", icon: "🧑‍💼", title: "المندوبون", keywords: "مندوب مندوبين عمولة ربح" },
  { id: "receivables", icon: "📥", title: "المستحقات", keywords: "مستحق لك تحصيل موعد وعد" },
  { id: "transfers", icon: "🔁", title: "التحويلات", keywords: "تحويل نقل شراء عملة صرف تحويل الاموال" },
  { id: "compare", icon: "⚖️", title: "مقارنات سريعة", keywords: "مقارنة الشهر الماضي نفس اليوم تحسن تراجع" },
  { id: "analysis", icon: "📊", title: "التحليل المالي", keywords: "مؤشرات اهداف مخطط شهري هامش مصادر تحليل" },
  { id: "records", icon: "💵", title: "الدخل والمصروفات", keywords: "دخل مصروف راتب ايجار شهري" },
  { id: "reset", icon: "⚙️", title: "البداية من جديد", keywords: "تصفير حذف استرجاع" },
];

/** Which wealth lines each section lists. */
export function sectionLines(wealth: Wealth, id: MoneySectionId): WealthLine[] {
  const keys: Partial<Record<MoneySectionId, (l: WealthLine) => boolean>> = {
    wallets: (l) => l.kind === "have",
    starlink: (l) => l.key === "starlink",
    customers: (l) => l.key === "customers" || l.key === "customersOwe",
    suppliers: (l) => l.key === "suppliers",
    reps: (l) => l.key === "repsOwe" || l.key === "repsOwed",
    receivables: (l) => l.kind === "owed",
  };
  const pick = keys[id];
  return pick ? wealth.lines.filter(pick) : [];
}

/** The section a line lives in (a summary card / a search hit opens it there). */
export function sectionOfLine(key: string): MoneySectionId {
  if (key === "starlink") return "starlink";
  if (key === "customers" || key === "customersOwe") return "customers";
  if (key === "suppliers") return "suppliers";
  if (key === "repsOwe" || key === "repsOwed") return "reps";
  return "wallets";
}

/** His choice: the summary (always shown) and the alerts open, «يبقى لك» open; the rest folded. */
export const DEFAULT_OPEN_SECTIONS: MoneySectionId[] = ["alerts", "period"];

export function parseOpenSections(raw: string | null): MoneySectionId[] {
  if (!raw) return [...DEFAULT_OPEN_SECTIONS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_OPEN_SECTIONS];
    return parsed.filter((id): id is MoneySectionId => MONEY_SECTIONS.some((s) => s.id === id));
  } catch {
    return [...DEFAULT_OPEN_SECTIONS];
  }
}

export function toggleSection(open: MoneySectionId[], id: MoneySectionId): MoneySectionId[] {
  return open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
}

export function openSection(open: MoneySectionId[], id: MoneySectionId): MoneySectionId[] {
  return open.includes(id) ? open : [...open, id];
}

export const ALL_SECTION_IDS: MoneySectionId[] = MONEY_SECTIONS.map((s) => s.id);

// ---- رابعًا: the search ----

export type MoneyTarget =
  | { kind: "line"; key: string }
  | { kind: "place"; id: string }
  | { kind: "section"; id: MoneySectionId }
  | { kind: "tab"; tab: "income" | "expense" }
  | { kind: "href"; href: string };

export interface MoneySearchItem {
  id: string;
  icon: string;
  /** «محفظة» / «زبون» / «تحويل»… */
  kindLabel: string;
  title: string;
  subtitle?: string;
  /** Extra words that find it. */
  keywords?: string;
  amounts?: number[];
  /** yyyy-mm-dd, newer records first among equals. */
  date?: string;
  target: MoneyTarget;
}

export interface MoneySearchSources {
  wealth: Wealth;
  holdings: CurrencyHolding[];
  accounts: { id: string; name: string; icon: string; currencyCode: string; number?: string }[];
  incomes: { id: string; amount: number; currencyCode: string; date: string; note?: string; category: string }[];
  expenses: { id: string; amount: number; currencyCode: string; date: string; note?: string; category: string }[];
  transfers: { id: string; amount: number; currencyCode: string; date: string; note?: string; from: string; to: string }[];
  /** The business's own الكاش entries (typed on the الكاش page: rent, a sale…) - not the linked ones. */
  cash: { id: string; kind: "in" | "out"; amount: number; currencyCode: string; date: string; category?: string; note?: string }[];
  exchanges: { id: string; paid: number; fromCurrency: string; received: number; toCurrency: string; date: string; seller?: string; note?: string }[];
  remittances: { id: string; client: string; beneficiary?: string; amount: number; currency: string; date: string; note?: string }[];
  clients: { id: string; name: string; phone?: string }[];
  suppliers: { id: string; name: string; phone?: string }[];
  reps: { id: string; name: string; phone?: string }[];
  /** Opens a customer / device on the home list. */
  homeHref: (text: string) => string;
}

function money(amount: number, code: string): string {
  return `${amount < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(amount * 100) / 100))} ${cashCurrencyLabel(code)}`;
}

function currencyText(byCurrency: Record<string, number>): string {
  return Object.entries(byCurrency)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .map(([c, v]) => money(v, c))
    .join(" + ");
}

const KIND_WORDS: Record<WealthLine["kind"], string> = { have: "عندك", owed: "لك", owe: "عليك" };

export function buildMoneySearchIndex(src: MoneySearchSources): MoneySearchItem[] {
  const items: MoneySearchItem[] = [];
  const named = new Set<string>();
  for (const line of src.wealth.lines) {
    const amounts = Object.values(line.byCurrency);
    // A line with nothing in it (عليك للمندوبين 0…) is not a result; a wallet always is.
    if (line.kind === "have" ? line.places?.length : line.items.length) {
      items.push({ id: `line:${line.key}`, icon: line.icon || "🏦", kindLabel: line.kind === "have" ? "محفظة" : KIND_WORDS[line.kind], title: line.label, subtitle: currencyText(line.byCurrency) || "0", amounts, target: { kind: "line", key: line.key } });
    }
    if (line.kind === "have") continue;
    for (const it of line.items) {
      named.add(normalizeSearchText(it.name));
      items.push({ id: `item:${line.key}:${it.name}`, icon: line.icon, kindLabel: line.label, title: it.name, subtitle: `${KIND_WORDS[line.kind]} ${currencyText(it.byCurrency)}`, amounts: Object.values(it.byCurrency), target: { kind: "line", key: line.key } });
    }
  }
  for (const a of src.accounts) {
    items.push({ id: `acc:${a.id}`, icon: a.icon || "🏦", kindLabel: "حساب", title: a.name, subtitle: `كشف الحساب · ${cashCurrencyLabel(a.currencyCode)}`, keywords: a.number, target: { kind: "place", id: a.id } });
  }
  for (const h of src.holdings) {
    items.push({ id: `cur:${h.code}`, icon: "💱", kindLabel: "عملة", title: h.label, subtitle: `عندك ${money(h.have, h.code)}`, keywords: h.code, target: { kind: "section", id: "currencies" } });
  }
  for (const r of src.incomes) {
    items.push({ id: `inc:${r.id}`, icon: "💵", kindLabel: "دخل", title: `${money(r.amount, r.currencyCode)} · ${r.category}`, subtitle: [r.date, r.note].filter(Boolean).join(" · "), keywords: r.note, amounts: [r.amount], date: r.date, target: { kind: "tab", tab: "income" } });
  }
  for (const r of src.expenses) {
    items.push({ id: `exp:${r.id}`, icon: "🧾", kindLabel: "مصروف", title: `${money(r.amount, r.currencyCode)} · ${r.category}`, subtitle: [r.date, r.note].filter(Boolean).join(" · "), keywords: r.note, amounts: [r.amount], date: r.date, target: { kind: "tab", tab: "expense" } });
  }
  for (const c of src.cash) {
    items.push({ id: `cash:${c.id}`, icon: c.kind === "out" ? "🧾" : "💵", kindLabel: c.kind === "out" ? "خرج من الكاش" : "دخل الكاش", title: `${money(c.amount, c.currencyCode)} · ${c.category?.trim() || "بدون تصنيف"}`, subtitle: [c.date, c.note].filter(Boolean).join(" · "), keywords: c.note, amounts: [c.amount], date: c.date, target: { kind: "place", id: "cash" } });
  }
  for (const t of src.transfers) {
    items.push({ id: `tr:${t.id}`, icon: "🔁", kindLabel: "تحويل", title: `${money(t.amount, t.currencyCode)} · ${t.from} ← ${t.to}`, subtitle: [t.date, t.note].filter(Boolean).join(" · "), keywords: `تحويل ${t.from} ${t.to}`, amounts: [t.amount], date: t.date, target: { kind: "section", id: "transfers" } });
  }
  for (const x of src.exchanges) {
    items.push({ id: `ex:${x.id}`, icon: "💱", kindLabel: "شراء عملة", title: `${money(x.received, x.toCurrency)} مقابل ${money(x.paid, x.fromCurrency)}`, subtitle: [x.date, x.seller, x.note].filter(Boolean).join(" · "), keywords: `شراء عملة ${x.seller ?? ""}`, amounts: [x.paid, x.received], date: x.date, target: { kind: "section", id: "transfers" } });
  }
  for (const r of src.remittances) {
    items.push({ id: `rem:${r.id}`, icon: "💸", kindLabel: "تحويل أموال", title: `${r.client} · ${money(r.amount, r.currency)}`, subtitle: [r.date, r.beneficiary, r.note].filter(Boolean).join(" · "), keywords: `تحويل الاموال ${r.beneficiary ?? ""}`, amounts: [r.amount], date: r.date, target: { kind: "section", id: "transfers" } });
  }
  // People without a balance line here still open their own page.
  const people = (list: { id: string; name: string; phone?: string }[], icon: string, kindLabel: string, href: (p: { name: string }) => string) => {
    for (const p of list) {
      if (named.has(normalizeSearchText(p.name))) continue;
      items.push({ id: `${kindLabel}:${p.id}`, icon, kindLabel, title: p.name, subtitle: p.phone, keywords: p.phone, target: { kind: "href", href: href(p) } });
    }
  };
  people(src.clients, "👤", "زبون", (p) => src.homeHref(p.name));
  people(src.suppliers, "🏭", "مورد", () => "/clients");
  people(src.reps, "🧑‍💼", "مندوب", () => "/representatives");
  return items;
}

/** "15000" / "15,000" / "15 000" find 15,000 (and 15,000.5 rounded). */
function amountHit(query: string, amounts: number[] | undefined): boolean {
  const digits = query.replace(/[,\s]/g, "");
  if (!amounts?.length || !/^\d+(\.\d+)?$/.test(digits)) return false;
  return amounts.some((a) => String(Math.abs(a)) === digits || String(Math.round(Math.abs(a))) === digits);
}

/** Matches by name / note / number / amount; balances first, then the newest records. */
export function searchMoney(items: MoneySearchItem[], query: string, limit = 30): MoneySearchItem[] {
  if (!normalizeSearchText(query)) return [];
  const rank = (i: MoneySearchItem) => (i.target.kind === "line" ? 0 : i.target.kind === "place" ? 1 : i.target.kind === "section" && !i.date ? 2 : i.date ? 3 : 4);
  return items
    .filter((i) => matches(query, i.title, i.subtitle, i.keywords, i.kindLabel) || amountHit(query, i.amounts))
    .sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

// ---- خامسًا: the money alerts ----

export type MoneyAlertSeverity = "critical" | "warn" | "info";

export interface MoneyAlert {
  key: string;
  severity: MoneyAlertSeverity;
  icon: string;
  title: string;
  detail: string;
  target: MoneyTarget | { kind: "inbox" };
}

export interface MoneyAlertInput {
  wealth: Wealth;
  /** Wealth line keys under their low-balance floor (lib/balanceAlerts.ts). */
  lowLines: string[];
  /** Every place's balance now: place id → currency → amount. */
  placeBalances: Record<string, Record<string, number>>;
  placeName: (id: string) => string;
  /** Money places whose real balance was never typed («بانتظار رصيده»). */
  unsetPlaces: { id: string; name: string }[];
  pendingNotices: number;
  missingRates: string[];
  /** Customers' promised payments: due today or in the next days (not yet overdue). */
  dueSoon: { name: string; amount: number; currency: string; date: string }[];
  today: string;
}

const SEVERITY_ORDER: Record<MoneyAlertSeverity, number> = { critical: 0, warn: 1, info: 2 };

export function buildMoneyAlerts(input: MoneyAlertInput): MoneyAlert[] {
  const alerts: MoneyAlert[] = [];
  for (const key of input.lowLines) {
    const line = input.wealth.lines.find((l) => l.key === key);
    if (!line) continue;
    alerts.push({ key: `low:${key}`, severity: "warn", icon: "🔻", title: `رصيد منخفض: ${line.label}`, detail: `${currencyText(line.byCurrency) || "0"} - تحت الحد الذي وضعته.`, target: { kind: "line", key } });
  }
  // A place can't really hold less than 0: a record is missing or wrong (his «أخطاء أو فروقات»).
  for (const [placeId, byCurrency] of Object.entries(input.placeBalances)) {
    for (const [code, v] of Object.entries(byCurrency)) {
      if (v >= -0.5) continue;
      alerts.push({ key: `negative:${placeId}:${code}`, severity: "critical", icon: "⚠️", title: `رصيد سالب: ${input.placeName(placeId)}`, detail: `${money(v, code)} - لا يمكن أن يكون أقل من 0: عملية ناقصة أو مسجلة مرتين. افتح الكشف وطابق الرصيد.`, target: { kind: "place", id: placeId } });
    }
  }
  if (input.unsetPlaces.length) {
    const first = input.unsetPlaces[0]!;
    alerts.push({ key: "unset-places", severity: "info", icon: "✍️", title: `${input.unsetPlaces.length} حساب بلا رصيد بداية`, detail: `${input.unsetPlaces.map((p) => p.name).slice(0, 3).join("، ")}${input.unsetPlaces.length > 3 ? "…" : ""} - اكتب رصيده الحقيقي ليصح المجموع.`, target: { kind: "place", id: first.id } });
  }
  if (input.pendingNotices > 0) {
    alerts.push({ key: "bank-inbox", severity: "warn", icon: "📩", title: `${input.pendingNotices} عملية بنكية تنتظر التأكيد`, detail: "لم تدخل أي رصيد بعد - أكّدها ليصح رصيد التطبيق.", target: { kind: "inbox" } });
  }
  if (input.missingRates.length) {
    alerts.push({ key: "missing-rate", severity: "warn", icon: "💱", title: `عملات بلا سعر صرف: ${input.missingRates.join("، ")}`, detail: "مبالغها لا تدخل مجاميع الأوقية حتى تسجّل سعرها.", target: { kind: "href", href: "/currencies" } });
  }
  for (const d of input.dueSoon) {
    const today = d.date === input.today;
    alerts.push({ key: `due:${d.name}:${d.currency}:${d.date}`, severity: today ? "warn" : "info", icon: "📆", title: `${d.name}: موعد دفع ${today ? "اليوم" : d.date}`, detail: `وعد بدفع ${money(d.amount, d.currency)}.`, target: { kind: "section", id: "receivables" } });
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---- ثالثًا: the quick comparisons ----

export type MonthCompareMode = "same" | "full";

export interface QuickComparison {
  id: "day" | "month";
  title: string;
  range: DateRange;
  previous: DateRange;
  rows: CompareRow[];
  /** ok · noData (the earlier period is before the first record) · incomplete (a running period
   * against a finished one - shown without «تحسن / تراجع»). */
  status: "ok" | "noData" | "incomplete";
  note?: string;
}

function lastDay(month: string): string {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

/** The first day anything was recorded (devices' operations, الكاش, invoices). */
export function earliestRecordDate(input: DashInput): string | undefined {
  let earliest: string | undefined;
  const see = (d: string | undefined) => {
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d) && (!earliest || d < earliest)) earliest = d.slice(0, 10);
  };
  for (const entries of Object.values(input.activityLedger ?? input.ledgerStore)) for (const e of entries) see(e.date);
  for (const c of input.cash) see(c.date);
  for (const inv of input.invoices) see(inv.date);
  return earliest;
}

const COMPARE_KEYS = ["net", "revenue", "collected", "expenses", "renewals"];

/**
 * «اليوم مقابل نفس اليوم من الشهر الماضي» and «هذا الشهر مقابل الشهر الماضي» (the same days by
 * default; the whole previous month on request, flagged as incomplete). From the records only:
 * profit, revenue, collection, expenses, renewals - never a past balance (not kept).
 */
export function quickComparisons(input: DashInput, today: string, mode: MonthCompareMode, earliest = earliestRecordDate(input)): QuickComparison[] {
  const compare = (id: QuickComparison["id"], title: string, range: DateRange, previous: DateRange): QuickComparison => {
    const rows = buildComparison(buildPeriodMetrics(input, range), buildPeriodMetrics(input, previous)).filter((r) => COMPARE_KEYS.includes(r.key));
    rows.sort((a, b) => COMPARE_KEYS.indexOf(a.key) - COMPARE_KEYS.indexOf(b.key));
    // Nothing recorded yet in the earlier period: no comparison at all.
    if (!earliest || earliest > previous.to) {
      return { id, title, range, previous, rows, status: "noData", note: earliest ? `لا توجد بيانات كافية: أول سجل يوم ${earliest}.` : "لا توجد بيانات كافية بعد." };
    }
    // The records start in the middle of it: shown, without «تحسن / تراجع».
    if (earliest > previous.from) {
      return { id, title, range, previous, rows, status: "incomplete", note: `سجلاتك تبدأ يوم ${earliest}: الفترة السابقة ناقصة، فالفرق ليس تحسنًا ولا تراجعًا.` };
    }
    return { id, title, range, previous, rows, status: "ok" };
  };
  const sameDay = addMonths(today, -1);
  const day = compare("day", "اليوم مقابل نفس اليوم من الشهر الماضي", { from: today, to: today }, { from: sameDay, to: sameDay });
  if (day.status === "ok") {
    day.note = sameDay.slice(8) !== today.slice(8) ? `الشهر الماضي أقصر: يُقارن بآخر يوم فيه (${sameDay}). اليوم لم ينتهِ بعد.` : "اليوم لم ينتهِ بعد - الأرقام حتى الآن.";
  }
  const month = today.slice(0, 7);
  const prevFirst = addMonths(`${month}-01`, -1);
  const fullPrevious = { from: prevFirst, to: lastDay(prevFirst.slice(0, 7)) };
  const sameDays = { from: prevFirst, to: addMonths(today, -1) };
  const monthCmp = compare("month", mode === "full" ? "هذا الشهر مقابل الشهر الماضي كاملًا" : "هذا الشهر مقابل نفس الأيام من الشهر الماضي", { from: `${month}-01`, to: today }, mode === "full" ? fullPrevious : sameDays);
  if (monthCmp.status === "ok" && mode === "full" && today < lastDay(month)) {
    const done = Number(today.slice(8, 10));
    const all = Number(lastDay(month).slice(8, 10));
    monthCmp.status = "incomplete";
    monthCmp.note = `الشهر الحالي لم يكتمل (${done} من ${all} يومًا) والشهر الماضي كامل: الفرق ليس تحسنًا ولا تراجعًا. للمقارنة العادلة اختر «نفس الأيام».`;
  }
  return [day, monthCmp];
}

/** The text and direction of one row: «▲ +12%» good / bad, or why there is none. */
export function compareDirection(row: CompareRow, status: QuickComparison["status"]): { text: string; tone: "good" | "bad" | "flat" | "none" } {
  if (status !== "ok") return { text: status === "noData" ? "لا توجد قاعدة" : "غير مكتمل", tone: "none" };
  if (row.pct === null) return { text: "لا توجد قاعدة مقارنة", tone: "none" };
  if (Math.abs(row.diff) < 0.5) return { text: "● 0%", tone: "flat" };
  const up = row.diff > 0;
  return { text: `${up ? "▲ +" : "▼ "}${Math.round(row.pct)}%`, tone: up === row.upIsGood ? "good" : "bad" };
}
