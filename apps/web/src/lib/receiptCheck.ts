/**
 * 🧾 The rep's transfer receipt, read (his Nov 7 2026 ask: «يمكن قراءة Référence العملية، وكل عملية يكتب ريفيرانسها
 * لكي لا ترسل لي نفس المبالغ مرتين»). His choices: a reference (or the very same picture) already recorded **locks the
 * approval** («⛔ … سُجّل من قبل» + «أعرف، سجّله مع ذلك»), and the rep is told in the bot at once; the amount is
 * checked against what he wrote (**1 سيفا = 5 فرنك CFA**) and a receipt more than a day older than his request is
 * flagged; the picture shows small with what was read beside it.
 *
 * The text comes from the phone's own reader (ML Kit, `readImageText`); this module is pure: text → what it says, and
 * the registry of every reference / picture already used (`starnet_receipt_refs_v1`, business data - in the backup and
 * in the team link, so both phones know).
 */

import { formatAmount } from "./formatAmount";

export interface ReceiptRead {
  /** The transfer's reference, upper case, no spaces. */
  ref?: string;
  /** The amount as printed, and its unit. */
  amount?: number;
  unit?: "CFA" | "MRU";
  /** When the transfer was made, local time «yyyy-mm-ddThh:mm» (time optional). */
  at?: string;
}

const REF_LABEL = /(r[ée]f[ée]rence|reference|\br[ée]f\b\.?|transaction\s*id|id\s*(de\s*)?(la\s*)?transaction|n[°o]\s*(de\s*)?(la\s*)?transaction|txn\s*id|المرجع|رقم\s*العملية|رقم\s*المعاملة)/i;
const AMOUNT_LABEL = /(montant|amount|المبلغ|somme)/i;
const UNIT = "(F\\s?CFA|CFA|XOF|MRU|MRO|UM|أوقية)";
const AMOUNT_RE = new RegExp(`(\\d{1,3}(?:[ \\u00a0\\u202f.,]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?\\s*${UNIT}`, "gi");
const UNIT_FIRST_RE = new RegExp(`${UNIT}\\s*(\\d{1,3}(?:[ \\u00a0\\u202f.,]\\d{3})+|\\d+)`, "gi");

function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function unitOf(word: string): "CFA" | "MRU" {
  return /cfa|xof/i.test(word) ? "CFA" : "MRU";
}

function numberOf(whole: string): number {
  return Number(whole.replace(/[   .,]/g, ""));
}

/** A token that can be a reference: 6+ letters / digits with at least one digit, not a phone, a date or a year. */
function refScore(token: string): number {
  const t = token.replace(/[.\-_/]+$/, "");
  const alnum = t.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length < 6 || !/\d/.test(alnum)) return 0;
  if (/^\d{8}$/.test(alnum) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t) || /^(19|20)\d{2}$/.test(alnum)) return 0;
  let score = alnum.length;
  if (/[A-Za-z]/.test(alnum)) score += 10;
  if (/[.\-_]/.test(t)) score += 3;
  return score;
}

function tokens(line: string): string[] {
  return line.match(/[A-Za-z0-9][A-Za-z0-9.\-_/]{4,}[A-Za-z0-9]/g) ?? [];
}

function readRef(lines: string[]): string | undefined {
  let best: { ref: string; score: number; line: number } | undefined;
  lines.forEach((line, i) => {
    const labelled = REF_LABEL.test(line);
    const after = labelled ? line.slice(line.search(REF_LABEL)).replace(REF_LABEL, "") : line;
    for (const tok of tokens(after)) {
      let score = refScore(tok);
      if (!score) continue;
      if (labelled) score += 40;
      else if (i > 0 && REF_LABEL.test(lines[i - 1]!) && tokens(lines[i - 1]!.replace(REF_LABEL, "")).every((t) => !refScore(t))) score += 30;
      if (!best || score > best.score) best = { ref: tok, score, line: i };
    }
  });
  if (!best || best.score < 20) return undefined;
  let ref = best.ref;
  // the reader often breaks a long reference: «PP2611….A9142» then «6» on the next line
  const next = lines[best.line + 1]?.trim();
  if (next && /^[A-Za-z0-9]{1,3}$/.test(next)) ref += next;
  return ref.toUpperCase().replace(/\s+/g, "");
}

const TOTAL_LABEL = /^\s*total\b|الإجمالي|المجموع/i;
const BALANCE_LABEL = /(solde|balance|الرصيد|رصيدك)/i;

/** The transferred amount. His Nov 10 2026 report: a Max it receipt sheet over the wallet screen - the wallet's balance
 * «111 163 CFA» sat above it and was taken (the first amount) instead of «Montant / Total 67 500 CFA», read by the phone
 * as two columns (labels, then values). So: a value next to «Montant» wins; then one printed twice (Montant + Total);
 * then one next to «Total»; a value next to «solde / balance» (the wallet's own) never counts; else the first. */
function readAmount(lines: string[]): { amount: number; unit: "CFA" | "MRU" } | undefined {
  const found: { amount: number; unit: "CFA" | "MRU"; score: number; at: number }[] = [];
  const near = (re: RegExp, i: number) => re.test(lines[i]!) || (i > 0 && re.test(lines[i - 1]!) && !new RegExp(AMOUNT_RE.source, "i").test(lines[i - 1]!));
  lines.forEach((line, i) => {
    let score = 0;
    if (near(AMOUNT_LABEL, i)) score += 100;
    else if (near(TOTAL_LABEL, i)) score += 40;
    if (near(BALANCE_LABEL, i)) score -= 1000;
    for (const m of line.matchAll(new RegExp(AMOUNT_RE.source, "gi"))) found.push({ amount: numberOf(m[1]!), unit: unitOf(m[3]!), score, at: found.length });
    for (const m of line.matchAll(new RegExp(UNIT_FIRST_RE.source, "gi"))) found.push({ amount: numberOf(m[2]!), unit: unitOf(m[1]!), score, at: found.length });
  });
  const ok = found.filter((f) => f.amount > 0 && f.score > -1000);
  if (!ok.length) return undefined;
  const times = (f: (typeof ok)[number]) => ok.filter((g) => g.amount === f.amount && g.unit === f.unit).length;
  const rank = (f: (typeof ok)[number]) => f.score + (times(f) > 1 ? 60 : 0);
  const pick = [...ok].sort((a, b) => rank(b) - rank(a) || a.at - b.at)[0]!;
  return { amount: pick.amount, unit: pick.unit };
}

function readDate(text: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = (h?: string, m?: string) => (h && m && Number(h) < 24 && Number(m) < 60 ? `T${pad(Number(h))}:${m}` : "");
  const dmy = text.match(/\b(\d{1,2})[/.\- ](\d{1,2})[/.\- ](20\d{2})(?:\s*(?:à|a|at|-|,)?\s*(\d{1,2})[:h](\d{2}))?/i);
  if (dmy) {
    const [, d, mo, y, h, mi] = dmy;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${pad(Number(mo))}-${pad(Number(d))}${time(h, mi)}`;
  }
  const ymd = text.match(/\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (ymd) {
    const [, y, mo, d, h, mi] = ymd;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${pad(Number(mo))}-${pad(Number(d))}${time(h, mi)}`;
  }
  return undefined;
}

/** What a receipt's text says (whatever could be read). */
export function parseReceipt(text: string): ReceiptRead {
  const lines = latinDigits(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ReceiptRead = {};
  const ref = readRef(lines);
  if (ref) out.ref = ref;
  const amount = readAmount(lines);
  if (amount) Object.assign(out, amount);
  const at = readDate(lines.join("\n"));
  if (at) out.at = at;
  return out;
}

/** 1 سيفا = 5 فرنك CFA (his rule). */
export const CFA_PER_SIFA = 5;

/** The receipt's amount in the request's currency, when it can be said. */
export function receiptAmountIn(read: ReceiptRead, currency: string): number | undefined {
  if (read.amount === undefined) return undefined;
  if (currency === "SIFA") return read.unit === "CFA" ? read.amount / CFA_PER_SIFA : undefined;
  if (currency === "MRU") return read.unit === "MRU" ? read.amount : undefined;
  return undefined;
}

export type ReceiptAmountCheck = "ok" | "mismatch" | "unknown";

export function checkReceiptAmount(read: ReceiptRead, amount: number | undefined, currency: string | undefined): ReceiptAmountCheck {
  if (read.amount === undefined || !amount || !currency) return "unknown";
  const inCurrency = receiptAmountIn(read, currency);
  if (inCurrency !== undefined) return Math.abs(inCurrency - amount) < 1 ? "ok" : "mismatch";
  // a unit not printed / another currency: the same number, or a franc amount of سيفا, still matches
  if (read.unit === undefined) return read.amount === amount || (currency === "SIFA" && read.amount === amount * CFA_PER_SIFA) ? "ok" : "mismatch";
  return "unknown";
}

/** More than a day between the transfer and his request. */
export function receiptIsOld(read: ReceiptRead, requestAt: string, maxHours = 24): boolean {
  if (!read.at) return false;
  const when = new Date(read.at.length === 10 ? `${read.at}T23:59` : read.at).getTime();
  const asked = new Date(requestAt).getTime();
  return Number.isFinite(when) && Number.isFinite(asked) && asked - when > maxHours * 3_600_000;
}

/** «05/11 17:15» */
export function receiptDateLabel(at: string): string {
  const [d, t] = at.split("T");
  const [, mo, day] = (d ?? "").split("-");
  return `${day}/${mo}${t ? ` ${t}` : ""}`;
}

/** «75,000 CFA = 15,000 سيفا» */
export function receiptAmountLabel(read: ReceiptRead): string {
  if (read.amount === undefined) return "";
  const printed = `${formatAmount(read.amount)} ${read.unit === "CFA" ? "CFA" : read.unit === "MRU" ? "أوقية" : ""}`.trim();
  return read.unit === "CFA" ? `${printed} = ${formatAmount(read.amount / CFA_PER_SIFA)} سيفا` : printed;
}

// ---- the registry: every reference / picture already used ----

export interface ReceiptUse {
  requestId: string;
  repId: string;
  /** When it arrived (ISO). */
  at: string;
  amount?: number;
  currency?: string;
}

export type ReceiptRegistry = Record<string, ReceiptUse>;

/** The registry's keys of a receipt: its reference and its picture. */
export function receiptKeys(read: ReceiptRead | undefined, imageHash: string | undefined): string[] {
  return [...(read?.ref ? [`ref:${read.ref}`] : []), ...(imageHash ? [`img:${imageHash}`] : [])];
}

/** The first earlier use of this receipt by another request still standing (a rejected one frees it). */
export function findReceiptUse(registry: ReceiptRegistry, keys: string[], requestId: string, rejected: (requestId: string) => boolean): { key: string; use: ReceiptUse } | null {
  for (const key of keys) {
    const use = registry[key];
    if (use && use.requestId !== requestId && !rejected(use.requestId)) return { key, use };
  }
  return null;
}

/** This request's receipt, registered (an earlier use by another request is kept). */
export function registerReceipt(registry: ReceiptRegistry, keys: string[], use: ReceiptUse, rejected: (requestId: string) => boolean): ReceiptRegistry {
  const next = { ...registry };
  for (const key of keys) {
    const old = next[key];
    if (!old || old.requestId === use.requestId || rejected(old.requestId)) next[key] = use;
  }
  return next;
}

const KEY = "starnet_receipt_refs_v1";

export function loadReceiptRegistry(): ReceiptRegistry {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ReceiptRegistry) : {};
  } catch {
    return {};
  }
}

export function saveReceiptRegistry(registry: ReceiptRegistry): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(registry));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}
