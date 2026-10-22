/**
 * 🔍 «فحص حساب المندوب» (the council's first step, his Oct 22 2026 choice): reads every record of one rep
 * and lists what looks wrong - it never changes anything; he opens each and fixes it by hand. Pure.
 * Each finding has a screen text (device names) and an anonymous text (no names - to send us).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntry } from "./cashStore";
import { computeBalanceByCurrency, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";
import type { RepLedgerBook } from "./repLedgers";
import type { RepRequest } from "./repRequests";
import type { RepSettlement } from "./repStore";

export type RepAuditKind =
  | "duplicateBot"
  | "maybeDuplicate"
  | "handoverMismatch"
  | "swapIncomplete"
  | "orphanCash"
  | "missingCash"
  | "movedDevice"
  | "deletedDevice";

export interface RepAuditFinding {
  kind: RepAuditKind;
  /** error = money counted wrong; warn = a number that moved without an operation, or to check. */
  severity: "error" | "warn";
  text: string;
  anon: string;
  date?: string;
  /** The device to open (home search), when it is about one. */
  accountId?: string;
}

export interface RepAuditInput {
  repId: string;
  repName: string;
  settlements: RepSettlement[];
  ledger: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  ledgerBook: RepLedgerBook;
  requests: RepRequest[];
  cash: CashEntry[];
}

const CUR: Record<string, string> = { MRU: "أوقية", SIFA: "سيفا", USD: "$" };
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const money = (amount: number, currency: string) => `${fmt(amount)} ${CUR[currency] ?? currency}`;
const short = (id: string) => `#${id.replace(/[^a-z0-9]/gi, "").slice(-4)}`;
const DUPLICATE_WINDOW_MS = 3 * 60_000;

interface RepRecord {
  id: string;
  /** What kind of operation, for comparing like with like. */
  kind: string;
  amount: number;
  currency: string;
  date: string;
  createdAt: string;
  group?: string;
  botId?: string;
  label: string;
}

const SETTLEMENT_LABEL: Record<RepSettlement["kind"], string> = {
  cashHandover: "استلمت منه",
  commissionPayout: "دفعت له من ربحه",
  manualCredit: "له",
  manualDebit: "عليه",
  profitTransfer: "تحويل من ربحه",
  profitCredit: "له في ربحه",
};

/** Every money record of this rep: his settlements, payments he handed over for his customers'
 * devices, and his named accounts' entries. */
function repRecords(input: RepAuditInput): RepRecord[] {
  const out: RepRecord[] = [];
  for (const s of input.settlements) {
    if (s.representativeId !== input.repId) continue;
    out.push({ id: s.id, kind: `s:${s.kind}`, amount: s.amount, currency: s.currencyCode, date: s.date, createdAt: s.createdAt, group: s.handoverId, botId: s.botId, label: SETTLEMENT_LABEL[s.kind] });
  }
  for (const entries of Object.values(input.ledger)) {
    for (const e of entries) {
      if (e.heldByRepId !== input.repId || e.kind !== "credit") continue;
      out.push({ id: e.id, kind: "d:credit", amount: e.amount, currency: e.currency, date: e.date, createdAt: e.createdAt, group: e.handoverId, botId: e.botId, label: "دفعة سلّمها عن جهاز" });
    }
  }
  const ledgerIds = new Set(input.ledgerBook.ledgers.filter((l) => l.repId === input.repId).map((l) => l.id));
  for (const e of input.ledgerBook.entries) {
    if (!ledgerIds.has(e.ledgerId) || e.travelFor || e.opening) continue;
    out.push({ id: e.id, kind: `l:${e.ledgerId}:${e.direction}`, amount: e.amount, currency: e.currencyCode, date: e.date, createdAt: e.createdAt, botId: e.botId, label: e.direction === "credit" ? "له في حساب مسمّى" : "عليه في حساب مسمّى" });
  }
  return out;
}

function deviceLabel(account: StarlinkAccountSummary | undefined, id: string): { text: string; anon: string } {
  return { text: `«${account?.name || "جهاز"}»`, anon: `جهاز ${short(id)}` };
}

export function auditRep(input: RepAuditInput): RepAuditFinding[] {
  const findings: RepAuditFinding[] = [];
  const records = repRecords(input);
  const nameOut = (text: string) => text.split(input.repName).join("المندوب");

  // 1. One bot message recorded in two separate operations.
  const byBot = new Map<string, Set<string>>();
  const botSample = new Map<string, RepRecord>();
  for (const r of records) {
    if (!r.botId) continue;
    const groups = byBot.get(r.botId) ?? new Set<string>();
    groups.add(r.group ?? r.id);
    byBot.set(r.botId, groups);
    if (!botSample.has(r.botId)) botSample.set(r.botId, r);
  }
  const dupBots = new Set<string>();
  for (const [botId, groups] of byBot) {
    if (groups.size < 2) continue;
    dupBots.add(botId);
    const r = botSample.get(botId)!;
    const text = `رسالة واحدة من بوت المال سُجّلت ${groups.size} مرات: ${r.label} ${money(r.amount, r.currency)} يوم ${r.date}. احذف المكرر من كشفه.`;
    findings.push({ kind: "duplicateBot", severity: "error", text, anon: text, date: r.date });
  }

  // 2. The same operation twice within minutes (no bot id to prove it - to check).
  const seen = new Set<string>();
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const gap = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (!(gap <= DUPLICATE_WINDOW_MS)) break;
      if (a.kind !== b.kind || a.amount !== b.amount || a.currency !== b.currency || a.date !== b.date) continue;
      if (a.group && a.group === b.group) continue;
      if (a.botId && a.botId === b.botId && dupBots.has(a.botId)) continue;
      const key = `${a.id}|${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const minutes = Math.max(1, Math.round(gap / 60_000));
      const text = `قد تكون مكررة: ${a.label} ${money(a.amount, a.currency)} يوم ${a.date} مسجّلة مرتين خلال ${minutes} دقيقة. إن كانت مرة واحدة فاحذف إحداهما.`;
      findings.push({ kind: "maybeDuplicate", severity: "warn", text, anon: text, date: a.date });
    }
  }

  // 3. A bot handover whose parts no longer add up to what was approved.
  for (const request of input.requests) {
    if (request.repId !== input.repId || request.kind !== "handover" || request.status !== "approved" || !request.botId || request.swap) continue;
    const parts = records.filter((r) => r.botId === request.botId && r.currency === (request.currency ?? r.currency));
    if (parts.length === 0 || dupBots.has(request.botId) || request.amount === undefined) continue;
    const sum = Math.round(parts.reduce((t, r) => t + r.amount, 0) * 100) / 100;
    if (Math.abs(sum - request.amount) > 0.01) {
      const text = `دفعة ${money(request.amount, request.currency ?? parts[0]!.currency)} من بوت المال: المسجّل منها الآن ${money(sum, parts[0]!.currency)} فقط - جزء منها حُذف أو عُدّل.`;
      findings.push({ kind: "handoverMismatch", severity: "error", text, anon: text, date: parts[0]!.date });
    }
  }

  // 4. «💱 سعر البديل»: three records - the money, «حُوّلت» out, «من دفعة» in.
  const mine = input.settlements.filter((s) => s.representativeId === input.repId && s.handoverId);
  const groups = new Map<string, RepSettlement[]>();
  for (const s of mine) groups.set(s.handoverId!, [...(groups.get(s.handoverId!) ?? []), s]);
  for (const group of groups.values()) {
    const moneyRec = group.find((s) => s.swap);
    const outRec = group.find((s) => s.kind === "manualDebit");
    const inRec = group.find((s) => s.kind === "manualCredit");
    const isSwap = Boolean(moneyRec) || (outRec?.note?.startsWith("💱") ?? false) || (inRec?.note?.startsWith("💱") ?? false);
    if (!isSwap) continue;
    const intoLedger = Boolean(moneyRec?.swap?.toLedgerName);
    const missing = [!moneyRec && "المبلغ المدفوع", !outRec && "«حُوّلت» من حسابه", !intoLedger && !inRec && "«من دفعة» في الحساب الآخر"].filter(Boolean);
    if (missing.length === 0) continue;
    const any = moneyRec ?? outRec ?? inRec!;
    const text = `💱 سعر البديل يوم ${any.date} ناقص: لا يوجد ${missing.join(" ولا ")} - يتغيّر حسابه بمبلغ لم يُستلم أو استُلم ولم يُحسب. احذف الباقي وسجّله من جديد.`;
    findings.push({ kind: "swapIncomplete", severity: "error", text, anon: text, date: any.date });
  }

  // 5. الكاش: an entry left after its rep record was deleted, or a cash handover that never got in.
  const settlementIds = new Set(input.settlements.map((s) => s.id));
  for (const c of input.cash) {
    if (c.sourceKind !== "rep-settlement" || !c.sourceId || settlementIds.has(c.sourceId)) continue;
    if (!(c.note ?? "").startsWith(input.repName)) continue;
    const text = `في الكاش قيد «${c.category}» ${money(c.amount, c.currencyCode)} يوم ${c.date} لعملية مندوب حُذفت - الكاش فيه مبلغ ليس له عملية.`;
    findings.push({ kind: "orphanCash", severity: "error", text: text, anon: nameOut(text), date: c.date });
  }
  const cashSources = new Set(input.cash.filter((c) => c.sourceKind === "rep-settlement").map((c) => c.sourceId));
  for (const s of input.settlements) {
    if (s.representativeId !== input.repId || s.kind !== "cashHandover" || s.accountId || cashSources.has(s.id)) continue;
    const text = `${SETTLEMENT_LABEL[s.kind]} ${money(s.amount, s.currencyCode)} يوم ${s.date} نقدًا، لكنها لم تدخل الكاش.`;
    findings.push({ kind: "missingCash", severity: "warn", text, anon: text, date: s.date });
  }

  // 6. «ما عليه» follows who holds the device today: a device he no longer holds takes its debt away.
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    const account = byId.get(accountId);
    if (!account) continue;
    const his = entries.filter((e: LedgerEntry) => e.kind === "debit" && e.representativeId === input.repId);
    if (his.length === 0) continue;
    const label = deviceLabel(account, accountId);
    const balance = computeBalanceByCurrency(entries);
    const owed = Object.entries(balance)
      .filter(([, v]) => (v ?? 0) > 0.005)
      .map(([c, v]) => money(v ?? 0, c))
      .join(" · ");
    if (account.deletedAt && account.representativeId === input.repId && owed) {
      const tail = `في سلة المحذوفات وعليه ${owed} - خرج هذا الدين من «ما عليه» دون أي عملية. استعده أو سجّل الدين عليه بيدك.`;
      findings.push({ kind: "deletedDevice", severity: "warn", text: `${label.text} ${tail}`, anon: `${label.anon} ${tail}`, accountId });
    } else if (!account.deletedAt && account.representativeId !== input.repId) {
      const tail = `عليه ${his.length} تجديد بحصة هذا المندوب، لكنه الآن ${account.representativeId ? "عند مندوب آخر" : "عندنا"}${owed ? ` وعليه ${owed}` : ""} - ديونه لم تعد في «ما عليه» لهذا المندوب.`;
      findings.push({ kind: "movedDevice", severity: "warn", text: `${label.text} ${tail}`, anon: `${label.anon} ${tail}`, accountId });
    }
  }

  const order: Record<RepAuditFinding["severity"], number> = { error: 0, warn: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || (b.date ?? "").localeCompare(a.date ?? ""));
}

/** The report to send us - no customer, device or rep names. */
export function repAuditReport(findings: RepAuditFinding[], today: string): string {
  if (findings.length === 0) return `🔍 فحص حساب المندوب (${today}): لا مشاكل.`;
  return [
    `🔍 فحص حساب المندوب (${today}): ${findings.length} ملاحظة`,
    ...findings.map((f, i) => `${i + 1}. [${f.kind}] ${f.severity === "error" ? "🔴" : "🟠"} ${f.anon}`),
  ].join("\n");
}
