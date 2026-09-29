/**
 * Requests a representative sends through the reps bot - a payment he collected ("دفعة 5000 محمد")
 * or a new customer / device ("زبون جديد محمد 22212345 x@gmail.com"). Nothing is recorded until
 * the operator approves the request in the app (representatives page): approving a payment records
 * it on the device exactly like a payment typed by hand; approving a customer creates the client
 * and opens the add-device dialog already filled in. A 📱 device from the rep's app (see
 * repDeviceTransfer.ts) also brings its Starlink session, restored when the device is saved.
 * Pure parsing + a small `starnet_` store.
 */

import type { LedgerCurrency } from "./ledgerStore";

export type RepRequestKind = "payment" | "client" | "device" | "edit";
export type RepRequestStatus = "pending" | "approved" | "rejected";

export interface RepRequest {
  id: string;
  repId: string;
  kind: RepRequestKind;
  /** What the rep wrote (trimmed), shown to the operator as-is. */
  text: string;
  createdAt: string;
  status: RepRequestStatus;
  resolvedAt?: string;
  // payment
  amount?: number;
  currency?: LedgerCurrency;
  /** Words that name the device / customer, when not matched to exactly one device. */
  query?: string;
  accountId?: string;
  // client
  name?: string;
  phone?: string;
  email?: string;
  kit?: string;
  // device (📱 from the rep's app: the details above + the encrypted file with its session)
  deviceName?: string;
  /** The file as the rep sent it - still encrypted; dropped once the request is resolved. */
  file?: string;
  /** His file doesn't open with the code this phone has for him (new code / wrong rep). */
  codeMismatch?: boolean;
  // edit (✏️ from the device menu in the reps bot: `accountId` + one field's new value)
  /** The id the owner's ✅/❌ in his bot carries (TelegramReplyService). */
  editId?: string;
  /** RepEditField code (repDeviceMenu.ts). */
  field?: string;
  value?: string;
  oldValue?: string;
}

export type RepRequestList = RepRequest[];

const STORAGE_KEY = "starnet_rep_requests_v1";
const MAX_KEPT = 300;

function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function fold(word: string): string {
  return word.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
}

const CURRENCY_WORDS: Record<string, LedgerCurrency> = {
  "اوقيه": "MRU",
  "اوقيات": "MRU",
  "mru": "MRU",
  "um": "MRU",
  "دولار": "USD",
  "usd": "USD",
  "$": "USD",
  "سيفا": "SIFA",
  "sifa": "SIFA",
  "فرنك": "SIFA",
  "cfa": "SIFA",
};

const FILLER_WORDS = new Set(["من", "عن", "الى", "لـ", "ل", "جهاز", "للجهاز", "الزبون"]);

export interface ParsedPayment {
  amount: number;
  currency: LedgerCurrency;
  /** The words naming the device / customer (may be empty). */
  query: string;
}

/** "5000 من محمد", "50 دولار مقهى", "٥٬٠٠٠ اوقية منزل" -> amount, currency (أوقية by default), query.
 * `rest` is the text after the command word. Null when there's no positive amount. */
export function parseRepPayment(rest: string): ParsedPayment | null {
  const tokens = toLatinDigits(rest).replace(/[٬،]/g, ",").split(/\s+/).filter(Boolean);
  let amount: number | null = null;
  let currency: LedgerCurrency = "MRU";
  const query: string[] = [];
  for (const token of tokens) {
    const numeric = token.replace(/,/g, "");
    if (amount === null && /^\d+(\.\d+)?$/.test(numeric)) {
      amount = Number(numeric);
      continue;
    }
    const withCurrency = /^(\d+(?:\.\d+)?)(\$|mru|usd)$/i.exec(numeric);
    if (amount === null && withCurrency) {
      amount = Number(withCurrency[1]);
      currency = CURRENCY_WORDS[withCurrency[2]!.toLowerCase()] ?? currency;
      continue;
    }
    const word = fold(token);
    if (CURRENCY_WORDS[word]) {
      currency = CURRENCY_WORDS[word]!;
      continue;
    }
    if (FILLER_WORDS.has(word)) continue;
    query.push(token);
  }
  if (amount === null || !(amount > 0)) return null;
  return { amount, currency, query: query.join(" ") };
}

export interface ParsedClient {
  name?: string;
  phone?: string;
  email?: string;
  kit?: string;
  // device (📱 from the rep's app: the details above + the encrypted file with its session)
  deviceName?: string;
  /** The file as the rep sent it - still encrypted; dropped once the request is resolved. */
  file?: string;
  /** His file doesn't open with the code this phone has for him (new code / wrong rep). */
  codeMismatch?: boolean;
}

/** "محمد أحمد 22212345 x@gmail.com KIT304" -> name, phone, email, kit (any order). Null when it
 * holds neither a name nor a phone. */
export function parseRepClient(rest: string): ParsedClient | null {
  const parsed: ParsedClient = {};
  const name: string[] = [];
  // "+222 4180 4013" / "4180-4013" is one phone number.
  const joined = toLatinDigits(rest).replace(/\+?\d[\d \-]{6,}\d/g, (m) => m.replace(/[\s+\-]/g, ""));
  for (const raw of joined.split(/\s+/).filter(Boolean)) {
    const token = raw.replace(/^[,،:]+|[,،:]+$/g, "");
    if (!token) continue;
    const digits = token.replace(/[\s+\-()]/g, "");
    if (!parsed.email && token.includes("@")) {
      parsed.email = token.toLowerCase();
    } else if (!parsed.phone && /^\d{8,15}$/.test(digits)) {
      parsed.phone = digits;
    } else if (!parsed.kit && /^(kit)?[a-z0-9-]*\d[a-z0-9-]*$/i.test(token) && token.length >= 5) {
      parsed.kit = token.toUpperCase();
    } else if (!["زبون", "جديد", "اسم", "الاسم", "هاتف", "الهاتف", "ايميل", "إيميل", "kit"].includes(fold(token))) {
      name.push(token);
    }
  }
  if (name.length > 0) parsed.name = name.join(" ");
  return parsed.name || parsed.phone ? parsed : null;
}

export function loadRepRequests(): RepRequestList {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as RepRequestList) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRepRequests(list: RepRequestList): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_KEPT)));
  } catch {
    // storage full / unavailable - the rep's message is still in Telegram
  }
}

export function addRepRequest(list: RepRequestList, request: Omit<RepRequest, "id" | "createdAt" | "status">, now = new Date()): RepRequestList {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rr-${now.getTime()}-${Math.random()}`;
  return [...list, { ...request, text: request.text.trim().slice(0, 300), id, createdAt: now.toISOString(), status: "pending" }];
}

export function resolveRepRequest(list: RepRequestList, id: string, status: Exclude<RepRequestStatus, "pending">, now = new Date()): RepRequestList {
  return list.map((r) => {
    if (r.id !== id) return r;
    const { file: _file, ...rest } = r;
    return { ...rest, status, resolvedAt: now.toISOString() };
  });
}

export function pendingRepRequests(list: RepRequestList): RepRequestList {
  return list.filter((r) => r.status === "pending");
}
