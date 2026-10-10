/**
 * The owner bot's answers for the 🧰 الأدوات tools - "توقعات", "وعود", "استرجاع", "فحص",
 * "أهداف" - so he gets them in Telegram too (and with the app closed, from the prepared
 * snapshot). Pure text builders over the same pure tool functions.
 */

import { isRenewalEntry } from "./renewals";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { buildDailyPlan } from "./dailyPlan";
import { checkDataHealth, healthScore } from "./dataHealth";
import { computeDebtAging } from "./debtAging";
import type { InvoiceList } from "./invoiceStore";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import { computeGoalProgress, type MonthlyGoals } from "./goals";
import { isShipmentEntry, type LedgerByAccount } from "./ledgerStore";
import { bucketPromises, type PaymentPromise } from "./paymentPromises";
import { cardNeed, computeRenewalForecast } from "./renewalForecast";
import { currencyLabel, money } from "./telegramMessages";
import { listLapsedDevices } from "./winBack";

const MAX_LINES = 15;

function dm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function forecastText(accounts: StarlinkAccountSummary[], today: Date, cardBalanceUsd?: number): string {
  const f = computeRenewalForecast(accounts, today, 30);
  if (f.devices.length === 0) return "📈 لا تجديدات خلال 30 يوماً";
  const lines = [`📈 توقعات 30 يوماً: ${f.devices.length} جهاز`, `💰 الدخل المتوقع: ${money(f.sale) || "0"}`];
  if (Object.keys(f.cost).length) lines.push(`💳 تكلفة Starlink: ${money(f.cost)}`);
  if (cardBalanceUsd !== undefined) {
    const card = cardNeed(f, cardBalanceUsd);
    if (card.devices > 0) {
      lines.push(
        card.shortUsd > 0
          ? `⚠️ البطاقة: تحتاج ${Math.round(card.needUsd)}$ خلال 7 أيام ورصيدها ${Math.round(card.balanceUsd)}$ - اشحنها بـ${Math.ceil(card.shortUsd)}$`
          : `✓ البطاقة تكفي تجديدات 7 أيام (${Math.round(card.needUsd)}$ من ${Math.round(card.balanceUsd)}$)`,
      );
    }
  }
  if (f.missingPrice) lines.push(`⚠️ ${f.missingPrice} جهاز بدون سعر شهري`);
  lines.push("");
  for (const week of f.weeks) {
    if (week.count === 0) continue;
    lines.push(`• ${dm(week.from)}-${dm(week.to)}: ${week.count} جهاز${Object.keys(week.sale).length ? ` · ${money(week.sale)}` : ""}`);
  }
  return lines.join("\n");
}

export function promisesText(promises: PaymentPromise[], today: string): string {
  const b = bucketPromises(promises, today);
  if (b.overdue.length + b.today.length + b.upcoming.length === 0) return "🤝 لا توجد وعود دفع مفتوحة";
  const line = (p: PaymentPromise) => `• ${p.name}: ${money({ [p.currency]: p.amount })} (${p.dueDate === today ? "اليوم" : dm(p.dueDate)})`;
  const out = ["🤝 وعود الدفع"];
  if (b.overdue.length) out.push("", `⏰ متأخرة (${b.overdue.length}):`, ...b.overdue.slice(0, MAX_LINES).map(line));
  if (b.today.length) out.push("", `📅 اليوم (${b.today.length}):`, ...b.today.slice(0, MAX_LINES).map(line));
  if (b.upcoming.length) out.push("", `🗓 قادمة (${b.upcoming.length}):`, ...b.upcoming.slice(0, 5).map(line));
  return out.join("\n");
}

export function lapsedText(accounts: StarlinkAccountSummary[], clients: ClientStore, today: Date): string {
  const lapsed = listLapsedDevices(accounts, clients, today, { maxDays: 60 });
  if (lapsed.length === 0) return "🔁 لا زبائن متوقفين عن التجديد (آخر 60 يوماً)";
  const out = [`🔁 زبائن للاسترجاع (${lapsed.length}):`];
  for (const d of lapsed.slice(0, MAX_LINES)) out.push(`• ${d.name}${d.clientName ? ` - ${d.clientName}` : ""} · منذ ${d.daysLapsed} يوماً${d.phone ? ` · ${d.phone}` : ""}`);
  if (lapsed.length > MAX_LINES) out.push(`… و${lapsed.length - MAX_LINES} غيرهم - التفاصيل في التطبيق ← الأدوات`);
  return out.join("\n");
}

export function healthText(accounts: StarlinkAccountSummary[], clients: ClientStore, now: Date, ledger?: LedgerByAccount): string {
  const issues = checkDataHealth(accounts, clients, { now, ledger });
  const score = healthScore(accounts, issues);
  if (issues.length === 0) return "🩺 بياناتك سليمة 100% ✓";
  const icon = { high: "🔴", medium: "🟠", low: "⚪" } as const;
  return [`🩺 فحص البيانات: ${score}% سليمة`, "", ...issues.map((i) => `${icon[i.severity]} ${i.title}: ${i.items.length}`), "", "التفاصيل: التطبيق ← الأدوات ← فحص البيانات"].join("\n");
}

export function goalsText(goals: MonthlyGoals, today: string, ledger: LedgerByAccount, clients: ClientStore): string {
  const progress = computeGoalProgress(goals, today.slice(0, 7), today, ledger, clients);
  if (progress.length === 0) return "🎯 لم تحدد أهدافاً لهذا الشهر - من التطبيق ← الأدوات ← الأهداف";
  const bar = (ratio: number) => "▓".repeat(Math.round(ratio * 10)) + "░".repeat(10 - Math.round(ratio * 10));
  return [
    `🎯 أهداف الشهر ${today.slice(5, 7)}/${today.slice(0, 4)}`,
    ...progress.map(
      (g) =>
        `\n${g.label}: ${Math.round(g.done).toLocaleString("en-US")} / ${g.target.toLocaleString("en-US")}${g.currency ? ` ${currencyLabel(g.currency)}` : ""}\n${bar(g.ratio)} ${Math.round(g.ratio * 100)}% ${g.ratio >= 1 ? "🎉" : g.onPace ? "✓" : "⚠️ متأخر"}`,
    ),
  ].join("\n");
}

export function planText(input: {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  promises: PaymentPromise[];
  ledger: LedgerByAccount;
  invoices: InvoiceList;
  adjustments: PartyAdjustmentList;
  today: string;
  now: Date;
}): string {
  const debtors = computeDebtAging({
    clients: Object.values(input.clients),
    accounts: input.accounts,
    invoices: input.invoices,
    adjustments: input.adjustments,
    ledgerStore: input.ledger,
    today: input.today,
  });
  const plan = buildDailyPlan({
    accounts: input.accounts,
    clients: input.clients,
    promises: input.promises,
    debtors,
    issues: checkDataHealth(input.accounts, input.clients, { now: input.now, ledger: input.ledger }),
    today: input.today,
    currencyLabel,
  });
  if (plan.length === 0) return "✅ لا مهام اليوم - يوم هادئ 🌤";
  const lines = plan.slice(0, 20).map((t) => `• ${t.title} - ${t.detail}${t.phone ? ` · ${t.phone}` : ""}`);
  if (plan.length > 20) lines.push(`… و${plan.length - 20} غيرها`);
  return [`✅ خطة اليوم (${plan.length} مهمة)`, "", ...lines, "", "للتأشير على المنجز: التطبيق ← الأدوات ← خطة اليوم"].join("\n");
}

/** Saturday = 6: the next one at `hour` (today if still ahead). */
export function nextWeeklyTime(now: Date, hour: number): Date {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  const ahead = (6 - at.getDay() + 7) % 7;
  at.setDate(at.getDate() + ahead);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 7);
  return at;
}

/** 📊 The 7 days ending on `weekEnd` (yyyy-mm-dd): shipments, money in, new customers, promises
 * kept / broken, lapsed devices now and the busiest rep. */
export function weeklyText(input: {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  ledger: LedgerByAccount;
  promises: PaymentPromise[];
  repNames: Record<string, string>;
  weekEnd: string;
  now: Date;
}): string {
  const end = new Date(`${input.weekEnd}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const inWeek = (d: string) => d >= from && d <= input.weekEnd;
  let shipments = 0;
  const collected: Record<string, number> = {};
  const byRep: Record<string, number> = {};
  const repOf = new Map(input.accounts.map((a) => [a.id, a.representativeId]));
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    for (const e of entries) {
      if (!inWeek(e.date)) continue;
      if (isShipmentEntry(e) && !e.previousDebtId) {
        if (!isRenewalEntry(e, entries)) continue;
        shipments += 1;
        const rep = repOf.get(accountId);
        if (rep) byRep[rep] = (byRep[rep] ?? 0) + 1;
      } else if (e.kind === "credit") {
        collected[e.currency] = (collected[e.currency] ?? 0) + e.amount;
      }
    }
  }
  const newClients = Object.values(input.clients).filter((c) => inWeek(c.createdAt.slice(0, 10))).length;
  const resolved = input.promises.filter((p) => p.resolvedAt && inWeek(p.resolvedAt.slice(0, 10)));
  const kept = resolved.filter((p) => p.status === "kept").length;
  const broken = resolved.filter((p) => p.status === "broken").length;
  const lapsed = listLapsedDevices(input.accounts, input.clients, input.now, { minDays: 1, maxDays: 60 }).length;
  const topRep = Object.entries(byRep).sort((a, b) => b[1] - a[1])[0];
  const lines = [
    `📊 ملخص الأسبوع ${dm(from)} - ${dm(input.weekEnd)}`,
    "",
    `📦 شحنات وتجديدات: ${shipments}`,
    `💵 التحصيل: ${money(collected) || "0"}`,
    `👤 زبائن جدد: ${newClients}`,
  ];
  if (kept + broken > 0) lines.push(`🤝 وعود: ${kept} وُفي بها · ${broken} لم يُوفَ بها`);
  if (lapsed > 0) lines.push(`🔁 أجهزة متوقفة عن التجديد: ${lapsed} - اكتب «استرجاع»`);
  if (topRep) lines.push(`🏆 أنشط مندوب: ${input.repNames[topRep[0]] ?? "—"} (${topRep[1]} شحنة)`);
  return lines.join("\n");
}

/** 💳 "البطاقة": the Starlink card's balance, what the next 7 days of renewals need, and the D
 * still owed to Starlink. */
export function cardText(accounts: StarlinkAccountSummary[], balanceUsd: number, openDebtsUsd: number[], today: Date): string {
  const need = cardNeed(computeRenewalForecast(accounts, today, 7), balanceUsd);
  const debt = openDebtsUsd.reduce((a, b) => a + b, 0);
  const lines = [`💳 رصيد بطاقة Starlink: ${Math.round(balanceUsd).toLocaleString("en-US")}$`];
  if (need.devices > 0) lines.push(`📅 تجديدات 7 أيام: ${need.devices} جهاز تحتاج ${Math.round(need.needUsd).toLocaleString("en-US")}$`);
  if (openDebtsUsd.length > 0) lines.push(`🔴 D غير مدفوعة لستارلينك: ${openDebtsUsd.length} بمبلغ ${Math.round(debt).toLocaleString("en-US")}$`);
  const short = need.shortUsd + Math.max(0, debt - Math.max(0, balanceUsd - need.needUsd));
  lines.push("", short > 0.5 ? `⚠️ اشحن البطاقة بـ ${Math.ceil(short).toLocaleString("en-US")}$ لتغطي الكل` : "✓ الرصيد يكفي");
  return lines.join("\n");
}
