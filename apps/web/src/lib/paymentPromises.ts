/**
 * 🤝 وعود الدفع - "he said he'll pay 5000 on Thursday". Each promise is a record (never a
 * balance change): due today / overdue ones are surfaced with a WhatsApp nudge, and marking them
 * kept or broken builds each customer's reliability over time. Pure + a small `starnet_` store.
 */

export type PromiseStatus = "open" | "kept" | "broken";

export interface PaymentPromise {
  id: string;
  clientId?: string;
  /** Who promised (the client's name when picked from the list). */
  name: string;
  phone?: string;
  amount: number;
  currency: string;
  /** yyyy-mm-dd */
  dueDate: string;
  note?: string;
  status: PromiseStatus;
  createdAt: string;
  resolvedAt?: string;
  /** Reported by this representative through the reps bot. */
  repId?: string;
}

const KEY = "starnet_payment_promises_v1";

export function loadPromises(): PaymentPromise[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PaymentPromise[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePromises(list: PaymentPromise[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full
  }
}

export type NewPromise = Omit<PaymentPromise, "id" | "status" | "createdAt">;

export function validatePromise(input: NewPromise): string | null {
  if (!input.name.trim()) return "اختر الزبون أو اكتب اسمه";
  if (!(input.amount > 0)) return "المبلغ غير صحيح";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return "اختر تاريخ الدفع";
  return null;
}

export function addPromise(list: PaymentPromise[], input: NewPromise, now = new Date()): PaymentPromise[] {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pp-${now.getTime()}`;
  return [...list, { ...input, name: input.name.trim(), id, status: "open", createdAt: now.toISOString() }];
}

export function resolvePromise(list: PaymentPromise[], id: string, status: Exclude<PromiseStatus, "open">, now = new Date()): PaymentPromise[] {
  return list.map((p) => (p.id === id ? { ...p, status, resolvedAt: now.toISOString() } : p));
}

export function deletePromise(list: PaymentPromise[], id: string): PaymentPromise[] {
  return list.filter((p) => p.id !== id);
}

export interface PromiseBuckets {
  overdue: PaymentPromise[];
  today: PaymentPromise[];
  upcoming: PaymentPromise[];
}

export function bucketPromises(list: PaymentPromise[], today: string): PromiseBuckets {
  const open = list.filter((p) => p.status === "open").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    overdue: open.filter((p) => p.dueDate < today),
    today: open.filter((p) => p.dueDate === today),
    upcoming: open.filter((p) => p.dueDate > today),
  };
}

export interface Reliability {
  kept: number;
  broken: number;
  /** kept / (kept + broken), or null with no history. */
  rate: number | null;
}

/** Per customer key (clientId, or the name when no client was picked). */
export function reliabilityByClient(list: PaymentPromise[]): Record<string, Reliability> {
  const out: Record<string, Reliability> = {};
  for (const p of list) {
    if (p.status === "open") continue;
    const key = p.clientId ?? p.name;
    const r = (out[key] ??= { kept: 0, broken: 0, rate: null });
    if (p.status === "kept") r.kept += 1;
    else r.broken += 1;
    r.rate = r.kept / (r.kept + r.broken);
  }
  return out;
}

export function buildPromiseReminder(p: Pick<PaymentPromise, "name" | "amount" | "dueDate">, currencyLabel: string, today: string): string {
  const when = p.dueDate === today ? "اليوم" : `يوم ${p.dueDate.slice(8, 10)}/${p.dueDate.slice(5, 7)}`;
  return [`مرحباً ${p.name} 👋`, `نذكّرك بالدفعة المتفق عليها ${when}: ${p.amount.toLocaleString("en-US")} ${currencyLabel}.`, "شكراً لتعاملك معنا 🙏", "", "- STAR NET"].join("\n");
}
