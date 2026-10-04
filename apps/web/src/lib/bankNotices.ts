/**
 * 🏦 The operator's bank / wallet notifications (بنكيلي، سداد، نيتا، بينانس…, read on the phone by
 * the native BankNotice listener) turned into suggestions waiting for his confirmation in
 * «حسابي» - never recorded by themselves. Each keeps everything its notification showed (the
 * person's name and number, the transaction ID, the app, the full text and its time).
 *
 * The wordings below are the real ones from his screenshots (business.md «Bank / wallet
 * notifications»); a notification of these apps that isn't understood yet still shows, as
 * «إشعار لم يُفهم», when it carries an amount.
 */

import type { MoneyAccount } from "./moneyAccounts";

export interface RawBankNotice {
  id: string;
  app: string;
  title: string;
  text: string;
  /** When it was posted (ms). */
  at: number;
}

export const BANK_APP_LABELS: Record<string, string> = {
  bankily: "بنكيلي",
  sedad: "سداد",
  masrvi: "مصرفي",
  click: "كليك",
  amanty: "أمانتي",
  orange: "أورانج موني",
  nita: "نيتا",
  binance: "بينانس",
};

export function bankAppLabel(app: string): string {
  return BANK_APP_LABELS[app] ?? app;
}

export interface NoticeParty {
  name?: string;
  number?: string;
}

/** in = money came in, out = went out (airtime = phone credit bought, out too), transfer = between
 * two of my apps (GIMTEL), unknown = from one of these apps but not understood. */
export type NoticeKind = "in" | "out" | "airtime" | "transfer" | "unknown";

export interface ParsedNotice {
  kind: NoticeKind | "ignore";
  amount?: number;
  currencyCode?: string;
  party?: NoticeParty;
  txId?: string;
  /** transfer: from which app to which app. */
  fromApp?: string;
  toApp?: string;
  /** A Binance deposit: income, or a transfer from another account of mine - he picks. */
  deposit?: boolean;
  /** Cash he handed to an agent went into the account («Versement espèces»): from الكاش. */
  cashDeposit?: boolean;
}

/** "50.0", "4600", "10000.0", "1 000", "1,000.50" → a number. */
export function parseNoticeAmount(raw: string): number | undefined {
  let s = raw.replace(/[\s  ]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/,\d{3}$/.test(s) || /,\d{3},/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const value = Number(s);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** "+22222227268" / "22222227268" / "22227268" → "22227268" (the 8 local digits). */
export function localNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 8 && (digits.startsWith("222") || digits.startsWith("223") || digits.startsWith("227")) ? digits.slice(3) : digits;
}

/** The app named in brackets: "(SEDAD)" / "(BANKILY)". */
function appFromTag(tag: string): string | undefined {
  const t = tag.trim().toLowerCase();
  if (t.includes("sedad")) return "sedad";
  if (t.includes("bankily")) return "bankily";
  if (t.includes("masrvi")) return "masrvi";
  if (t.includes("amanty")) return "amanty";
  if (t.includes("click")) return "click";
  return undefined;
}

const AMOUNT = "(\\d[\\d.,\\s\\u00a0]*?)";

function currencyOf(word: string): string | undefined {
  const w = word.toLowerCase().replace(/\s/g, "");
  if (w === "mru" || w.includes("أوقية")) return "MRU";
  if (w.includes("cfa") || w === "xof") return "SIFA";
  if (w === "usdt" || w === "usd" || w === "usdc") return "USD";
  return undefined;
}

/** Any "<amount> <currency>" - for a notification of these apps that isn't understood yet. */
function anyAmount(text: string): { amount: number; currencyCode: string } | undefined {
  const m = new RegExp(`${AMOUNT}\\s*(MRU|أوقية|F\\s?CFA|FCFA|XOF|USDT|USDC|USD)`, "i").exec(text);
  if (!m) return undefined;
  const amount = parseNoticeAmount(m[1]!);
  const currencyCode = currencyOf(m[2]!);
  return amount && currencyCode ? { amount, currencyCode } : undefined;
}

function party(name?: string, number?: string): NoticeParty | undefined {
  const cleanName = name?.replace(/[…]+$/, "").trim();
  const cleanNumber = number ? localNumber(number) : undefined;
  if (!cleanName && !cleanNumber) return undefined;
  return { ...(cleanName ? { name: cleanName } : {}), ...(cleanNumber ? { number: cleanNumber } : {}) };
}

function unknownOrIgnore(text: string, txId?: string): ParsedNotice {
  const found = anyAmount(text);
  return found ? { kind: "unknown", ...found, ...(txId ? { txId } : {}) } : { kind: "ignore" };
}

/**
 * One notification → what it says. `ownNumbers`: my own numbers (22227268…) - money between two
 * of my apps on my own number is a transfer, not income.
 */
export function parseBankNotice(raw: Pick<RawBankNotice, "app" | "title" | "text">, ownNumbers: string[]): ParsedNotice {
  // Phones write the apostrophe several ways («Transfert d’argent»).
  const quotes = (s: string) => s.replace(/[’‘ʼ`´]/g, "'");
  const rawText = quotes(raw.text);
  const title = quotes(raw.title).trim();
  const text = rawText.replace(/[\s ]+/g, " ").trim();
  const all = `${title} ${text}`;
  const own = new Set(ownNumbers.map(localNumber));
  const txId = /(?:ID de transaction|ID Trs)\s*:\s*(\d+)/i.exec(all)?.[1];
  const withTx = txId ? { txId } : {};

  if (raw.app === "bankily") {
    // GIMTEL: «Vous avez reçu 50.0 MRU du bénéficiaire : +22222227268 (SEDAD). ID de transaction : …»
    const gimtel = new RegExp(`reçu\\s+${AMOUNT}\\s*MRU\\s+du\\s+b[ée]n[ée]ficiaire\\s*:\\s*(\\+?[\\d\\s]+)\\s*\\(([^)]+)\\)`, "i").exec(text);
    if (gimtel) {
      const amount = parseNoticeAmount(gimtel[1]!);
      const number = localNumber(gimtel[2]!);
      const other = appFromTag(gimtel[3]!);
      if (!amount) return unknownOrIgnore(text, txId);
      if (own.has(number) && other) return { kind: "transfer", amount, currencyCode: "MRU", fromApp: other, toApp: "bankily", ...withTx };
      return { kind: "in", amount, currencyCode: "MRU", party: party(undefined, number), ...withTx };
    }
    // «Transfert d'argent» - «Montant : 10 MRU» + «Beneficiaire : NAME,NUMBER» (out) or
    // «Expediteur : NAME,NUMBER» (in).
    const montant = new RegExp(`Montant\\s*:\\s*${AMOUNT}\\s*MRU`, "i").exec(text);
    // «Versement espèces»: «Votre compte a ete credite de 11800.0 MRU suite a votre versement espece».
    const cash = new RegExp(`cr[ée]dit[ée]e?\\s+de\\s+${AMOUNT}\\s*MRU\\s+suite\\s+[àa]\\s+votre\\s+versement\\s+esp[eè]ce`, "i").exec(text);
    if (cash) {
      const amount = parseNoticeAmount(cash[1]!);
      if (amount) return { kind: "in", amount, currencyCode: "MRU", cashDeposit: true, ...withTx };
    }
    const who = /(Beneficiaire|Bénéficiaire|Expediteur|Expéditeur)\s*:\s*([^\n]+)/i.exec(rawText);
    if (montant && who && /transfert d'argent/i.test(title)) {
      const amount = parseNoticeAmount(montant[1]!);
      if (!amount) return unknownOrIgnore(text, txId);
      const incoming = /exp/i.test(who[1]!);
      const [name, rest] = who[2]!.replace(/(\.{3}|…)\s*$/, "").split(",");
      const number = /\+?\d[\d ]*\d|\d/.exec(rest ?? "")?.[0];
      return { kind: incoming ? "in" : "out", amount, currencyCode: "MRU", party: party(name, number), ...withTx };
    }
    return unknownOrIgnore(text, txId);
  }

  if (raw.app === "sedad") {
    // «أرسلتم مبلغ 50.0 أوقية جديدة لصالح 22227268 (BANKILY)» (GIMTEL) or «… لصالح NAME ( NUMBER )».
    const sent = new RegExp(`أرسلتم مبلغ\\s+${AMOUNT}\\s*أوقية(?:\\s+جديدة)?\\s+لصالح\\s+(.+)$`).exec(text);
    if (sent) {
      const amount = parseNoticeAmount(sent[1]!);
      if (!amount) return unknownOrIgnore(text, txId);
      const rest = sent[2]!.trim();
      const tagged = /^(\+?\d[\d\s]*)\s*\(\s*([A-Za-z]+)\s*\)/.exec(rest);
      if (tagged) {
        const number = localNumber(tagged[1]!);
        const other = appFromTag(tagged[2]!);
        if (own.has(number) && other) return { kind: "transfer", amount, currencyCode: "MRU", fromApp: "sedad", toApp: other, ...withTx };
        return { kind: "out", amount, currencyCode: "MRU", party: party(undefined, number), ...withTx };
      }
      const named = /^(.*?)\s*\(\s*(\+?\d[\d\s]*)\s*\)\s*$/.exec(rest);
      return { kind: "out", amount, currencyCode: "MRU", party: named ? party(named[1], named[2]) : party(rest), ...withTx };
    }
    // «PAIEMENT_CREDIT - تلقيتم رصيدا بمبلغ 10 أوقية جديدة من شنقيتل»: phone credit bought.
    const credit = new RegExp(`رصيدا?\\s+بمبلغ\\s+${AMOUNT}\\s*أوقية(?:\\s+جديدة)?(?:\\s+من\\s+(.+))?$`).exec(text);
    if (credit && /paiement_credit/i.test(title)) {
      const amount = parseNoticeAmount(credit[1]!);
      if (!amount) return unknownOrIgnore(text, txId);
      return { kind: "airtime", amount, currencyCode: "MRU", party: party(credit[2]), ...withTx };
    }
    return unknownOrIgnore(text, txId);
  }

  if (raw.app === "nita") {
    // «NAME vient de transferer un montant de 5000.0 F CFA vers votre…»
    const received = new RegExp(`^(.*?)\\s+vient de transf[ée]rer un montant de\\s+${AMOUNT}\\s*F\\s?CFA`, "i").exec(text);
    if (received) {
      const amount = parseNoticeAmount(received[2]!);
      if (amount) return { kind: "in", amount, currencyCode: "SIFA", party: party(received[1]), ...withTx };
    }
    return unknownOrIgnore(text, txId);
  }

  if (raw.app === "binance") {
    // Only «USDT Deposit Successful» counts («Processing» comes first, prices and ads are ignored).
    if (!/deposit successful/i.test(title)) return { kind: "ignore" };
    const deposited = new RegExp(`deposited\\s+${AMOUNT}\\s+([A-Z]{3,5})`, "i").exec(text);
    const amount = deposited ? parseNoticeAmount(deposited[1]!) : undefined;
    const currencyCode = deposited ? currencyOf(deposited[2]!) : undefined;
    if (!amount) return { kind: "ignore" };
    // USDT = dollars (his choice); another coin is left for him to read.
    return currencyCode ? { kind: "in", amount, currencyCode, deposit: true } : { kind: "unknown", amount };
  }

  return unknownOrIgnore(text, txId);
}

// ---- the suggestions waiting in «حسابي» ----

export interface NoticeCopy {
  id: string;
  app: string;
  title: string;
  text: string;
  at: number;
}

export type SuggestionStatus = "pending" | "done" | "rejected";

export interface BankSuggestion {
  id: string;
  kind: NoticeKind;
  /** The app the money moved in (a transfer: the first notification's). */
  app: string;
  at: number;
  amount?: number;
  currencyCode?: string;
  party?: NoticeParty;
  txId?: string;
  fromApp?: string;
  toApp?: string;
  deposit?: boolean;
  cashDeposit?: boolean;
  /** Every notification behind it, as it was (a GIMTEL transfer has two). */
  notices: NoticeCopy[];
  /** The same text came a little before - perhaps a repeat, perhaps a second real transfer. */
  maybeDuplicate?: boolean;
  status: SuggestionStatus;
  /** What it became, in words («🧾 مصروف: أكل»). */
  outcome?: string;
  decidedAt?: string;
}

export interface BankInbox {
  suggestions: BankSuggestion[];
  /** Notification ids already turned into suggestions (or ignored). */
  seen: string[];
  /** Transaction IDs already suggested - never twice. */
  txIds: string[];
}

export const EMPTY_BANK_INBOX: BankInbox = { suggestions: [], seen: [], txIds: [] };

/** The two halves of one GIMTEL transfer arrive within minutes. */
const SAME_TRANSFER_MS = 15 * 60 * 1000;
/** The same text again within this time is flagged «قد يكون مكررًا». */
const REPEAT_MS = 30 * 60 * 1000;
const MAX_SEEN = 2000;
const MAX_DECIDED = 500;

/** Adds the new notifications as suggestions (oldest first). Returns how many suggestions are new. */
export function ingestBankNotices(inbox: BankInbox, raws: RawBankNotice[], ownNumbers: string[]): { inbox: BankInbox; added: number } {
  const seen = new Set(inbox.seen);
  const txIds = new Set(inbox.txIds);
  const seenOrder = [...inbox.seen];
  const txOrder = [...inbox.txIds];
  let suggestions = [...inbox.suggestions];
  let added = 0;
  for (const raw of [...raws].sort((a, b) => a.at - b.at)) {
    if (!raw?.id || seen.has(raw.id)) continue;
    seen.add(raw.id);
    seenOrder.push(raw.id);
    const parsed = parseBankNotice(raw, ownNumbers);
    if (parsed.kind === "ignore") continue;
    if (parsed.txId) {
      if (txIds.has(parsed.txId)) continue;
      txIds.add(parsed.txId);
      txOrder.push(parsed.txId);
    }
    const copy: NoticeCopy = { id: raw.id, app: raw.app, title: raw.title, text: raw.text, at: raw.at };
    if (parsed.kind === "transfer") {
      const half = suggestions.find(
        (s) =>
          s.status === "pending" &&
          s.kind === "transfer" &&
          s.notices.length === 1 &&
          s.notices[0]!.app !== raw.app &&
          s.fromApp === parsed.fromApp &&
          s.toApp === parsed.toApp &&
          s.amount === parsed.amount &&
          Math.abs(s.at - raw.at) <= SAME_TRANSFER_MS,
      );
      if (half) {
        suggestions = suggestions.map((s) =>
          s === half ? { ...s, notices: [...s.notices, copy].sort((a, b) => a.at - b.at), ...(s.txId || !parsed.txId ? {} : { txId: parsed.txId }) } : s,
        );
        continue;
      }
    }
    const repeated = suggestions.some((s) =>
      s.notices.some((n) => n.app === raw.app && n.title === raw.title && n.text === raw.text && raw.at > n.at && raw.at - n.at <= REPEAT_MS),
    );
    const suggestion: BankSuggestion = {
      id: raw.id,
      kind: parsed.kind,
      app: raw.app,
      at: raw.at,
      ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
      ...(parsed.currencyCode ? { currencyCode: parsed.currencyCode } : {}),
      ...(parsed.party ? { party: parsed.party } : {}),
      ...(parsed.txId ? { txId: parsed.txId } : {}),
      ...(parsed.fromApp ? { fromApp: parsed.fromApp } : {}),
      ...(parsed.toApp ? { toApp: parsed.toApp } : {}),
      ...(parsed.deposit ? { deposit: true } : {}),
      ...(parsed.cashDeposit ? { cashDeposit: true } : {}),
      notices: [copy],
      ...(repeated ? { maybeDuplicate: true } : {}),
      status: "pending",
    };
    suggestions.push(suggestion);
    added++;
  }
  return {
    inbox: { suggestions: trimDecided(suggestions), seen: seenOrder.slice(-MAX_SEEN), txIds: txOrder.slice(-MAX_SEEN) },
    added,
  };
}

function trimDecided(list: BankSuggestion[]): BankSuggestion[] {
  const decided = list.filter((s) => s.status !== "pending");
  if (decided.length <= MAX_DECIDED) return list;
  const drop = new Set(decided.sort((a, b) => a.at - b.at).slice(0, decided.length - MAX_DECIDED).map((s) => s.id));
  return list.filter((s) => !drop.has(s.id));
}

/** Waiting for him, newest first. */
export function pendingSuggestions(inbox: BankInbox): BankSuggestion[] {
  return inbox.suggestions.filter((s) => s.status === "pending").sort((a, b) => b.at - a.at);
}

/** Already confirmed or rejected, newest first. */
export function decidedSuggestions(inbox: BankInbox): BankSuggestion[] {
  return inbox.suggestions.filter((s) => s.status !== "pending").sort((a, b) => b.at - a.at);
}

export function decideSuggestion(inbox: BankInbox, id: string, status: "done" | "rejected", outcome: string | undefined, now = new Date()): BankInbox {
  return {
    ...inbox,
    suggestions: inbox.suggestions.map((s) =>
      s.id === id ? { ...s, status, decidedAt: now.toISOString(), ...(outcome ? { outcome } : {}) } : s,
    ),
  };
}

/** A rejected one back to «بانتظار التأكيد». */
export function reopenSuggestion(inbox: BankInbox, id: string): BankInbox {
  return {
    ...inbox,
    suggestions: inbox.suggestions.map((s) => {
      if (s.id !== id || s.status !== "rejected") return s;
      const { outcome: _outcome, decidedAt: _decidedAt, ...rest } = s;
      return { ...rest, status: "pending" as const };
    }),
  };
}

/** Which way the money went: in, out, a transfer, or not known (he says). */
export function suggestionDirection(s: Pick<BankSuggestion, "kind">): "in" | "out" | "transfer" | "unknown" {
  if (s.kind === "airtime") return "out";
  return s.kind;
}

/** My account for an app: by its payment method (بنكيلي، سداد، مصرفي، نيتا، أورانج), else by name. */
export function accountForApp(accounts: MoneyAccount[], app: string | undefined): MoneyAccount | undefined {
  if (!app) return undefined;
  const byMethod = accounts.find((a) => a.method === app);
  if (byMethod) return byMethod;
  const label = BANK_APP_LABELS[app];
  return label ? accounts.find((a) => a.name.includes(label)) : undefined;
}

/** The person as one line: «NAME · 40000000». */
export function partyLabel(p: NoticeParty | undefined): string {
  return [p?.name, p?.number].filter(Boolean).join(" · ");
}

/** The note put on the record it becomes: the person, the app, the transaction ID. */
export function suggestionNote(s: BankSuggestion): string {
  const parts =
    s.kind === "transfer" ? [`جيمتل من ${bankAppLabel(s.fromApp ?? "")} إلى ${bankAppLabel(s.toApp ?? "")}`] : [partyLabel(s.party), `عبر ${bankAppLabel(s.app)}`];
  if (s.txId) parts.push(`عملية ${s.txId}`);
  return parts.filter(Boolean).join(" - ");
}

/** The local day (yyyy-mm-dd) it was posted. */
export function noticeDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KEY = "starnet_bank_inbox_v1";

export function loadBankInbox(): BankInbox {
  if (typeof window === "undefined") return EMPTY_BANK_INBOX;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<BankInbox>) : {};
    return {
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      txIds: Array.isArray(parsed.txIds) ? parsed.txIds : [],
    };
  } catch {
    return EMPTY_BANK_INBOX;
  }
}

export function saveBankInbox(inbox: BankInbox): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(inbox));
}
