/**
 * 🧹 «تفريغ المساحة» (his Nov 23 2026 «ذاكرة التطبيق ممتلئة - آخر تغيير لم يُحفظ»): frees room in the phone's
 * localStorage by trimming ONLY what the app can do without - logs, diagnostic lists, old copies - never a record
 * of money, a device, a customer, a rep or a setting. Every key it may touch is listed here with its rule; anything
 * else is never read for writing. Pure over a storage object - tested in storageCleanup.test.ts.
 */

export interface CleanupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CleanupAction {
  key: string;
  label: string;
  before: number;
  after: number;
  /** The new text, or null to remove the key. */
  next: string | null;
}

/** Stores that hold money, devices, customers, reps or the team link's agreed state - never touched here. */
export const PROTECTED = [
  "starnet_customer_ledger_v1",
  "starnet_cash_entries_v1",
  "starnet_store_invoices_v1",
  "starnet_store_transactions_v1",
  "starnet_clients_v1",
  "starnet_demo_accounts_v1",
  "starnet_representatives_v1",
  "starnet_rep_settlements_v1",
  "starnet_payment_allocations_v1",
  "starnet_party_adjustments_v1",
  "starnet_previous_debts_v1",
  "starnet_card_topups_v1",
  "starnet_currencies_v1",
  "starnet.deviceLinkBase",
  "starnet.deviceLinkState",
  "starnet.deviceLinkPendingDeletes",
] as const;

const DAY = 24 * 3600_000;

function parse<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type Rule = { key: string; label: string; apply: (raw: string, now: number) => string | null };

/** Keep the first `n` items of an array (the stores keep the newest first). */
const headOf = (n: number) => (raw: string) => {
  const a = parse<unknown[]>(raw);
  return Array.isArray(a) && a.length > n ? JSON.stringify(a.slice(0, n)) : raw;
};

/** Keep the last `n` items of an array (the stores keep the newest last). */
const tailOf = (n: number) => (raw: string) => {
  const a = parse<unknown[]>(raw);
  return Array.isArray(a) && a.length > n ? JSON.stringify(a.slice(-n)) : raw;
};

export const RULES: Rule[] = [
  // the team link's notes: what was lost in a conflict (only shown, never used again)
  { key: "starnet.deviceLinkConflicts", label: "تعارضات ربط الأجهزة (للاطلاع فقط)", apply: () => null },
  { key: "starnet.deviceLinkLog", label: "سجل «ماذا وصل من الفريق»", apply: headOf(60) },
  {
    key: "starnet.deviceLinkOrigins",
    label: "علامات «سجّله فلان» على السجلات",
    apply: (raw) => {
      const o = parse<Record<string, { at?: string }>>(raw);
      if (!o || typeof o !== "object") return raw;
      const entries = Object.entries(o);
      if (entries.length <= 1500) return raw;
      // the newest 1500 marks stay
      return JSON.stringify(Object.fromEntries(entries.sort((a, b) => ((a[1]?.at ?? "") < (b[1]?.at ?? "") ? 1 : -1)).slice(0, 1500)));
    },
  },
  { key: "starnet.eventLog", label: "سجل الإشعارات", apply: headOf(100) },
  { key: "starnet.searchHistory", label: "سجل البحث", apply: () => null },
  { key: "starnet.whatsappAgentLog", label: "سجل «آخر ما فعله الوكيل»", apply: headOf(20) },
  {
    key: "starnet.whatsappAgentChats",
    label: "محادثات الوكيل القديمة (أكثر من 7 أيام)",
    apply: (raw, now) => {
      const o = parse<Record<string, { at?: number }[]>>(raw);
      if (!o || typeof o !== "object") return raw;
      const kept = Object.fromEntries(Object.entries(o).filter(([, turns]) => Array.isArray(turns) && turns.length > 0 && now - (turns[turns.length - 1]?.at ?? 0) < 7 * DAY));
      return JSON.stringify(kept);
    },
  },
  {
    key: "starnet_agent_events_v1",
    label: "عمليات إحصائيات الوكيل (أقدم من 60 يومًا)",
    apply: (raw, now) => {
      const a = parse<{ at?: number }[]>(raw);
      if (!Array.isArray(a)) return raw;
      return JSON.stringify(a.filter((e) => now - (e.at ?? 0) < 60 * DAY).slice(-800));
    },
  },
  {
    key: "starnet_agent_questions_v1",
    label: "أسئلة الوكيل المُجابة / المتجاهلة (أقدم من 30 يومًا)",
    apply: (raw, now) => {
      const a = parse<{ status?: string; at?: number; send?: string }[]>(raw);
      if (!Array.isArray(a)) return raw;
      return JSON.stringify(a.filter((q) => q.status === "open" || q.send === "waiting" || now - (q.at ?? 0) < 30 * DAY));
    },
  },
  {
    key: "starnet_agent_menus_v1",
    label: "نسخ القوائم القديمة (بلا صورها، آخر 3)",
    apply: (raw) => {
      const m = parse<{ versions?: { doc?: { nodes?: { image?: string }[]; products?: { image?: string }[] } }[] }>(raw);
      if (!m || !Array.isArray(m.versions)) return raw;
      const strip = <T extends { image?: string }>(list: T[] | undefined) => (list ?? []).map(({ image: _i, ...rest }) => rest);
      const versions = m.versions.slice(0, 3).map((v) => ({ ...v, doc: v.doc ? { ...v.doc, nodes: strip(v.doc.nodes), products: strip(v.doc.products) } : v.doc }));
      return JSON.stringify({ ...m, versions });
    },
  },
  { key: "starnet.assistantChat", label: "محادثة المساعد (آخر 30 رسالة)", apply: tailOf(30) },
];

/** What «🧹 تفريغ المساحة» would do now: only the rules that free something. */
export function cleanupPlan(storage: Pick<CleanupStorage, "getItem">, now: number): CleanupAction[] {
  const out: CleanupAction[] = [];
  for (const r of RULES) {
    if ((PROTECTED as readonly string[]).includes(r.key)) continue;
    const raw = storage.getItem(r.key);
    if (raw === null) continue;
    let next: string | null;
    try {
      next = r.apply(raw, now);
    } catch {
      continue;
    }
    const after = next === null ? 0 : next.length;
    if (after < raw.length) out.push({ key: r.key, label: r.label, before: raw.length + r.key.length, after: next === null ? 0 : after + r.key.length, next });
  }
  return out.sort((a, b) => b.before - b.after - (a.before - a.after));
}

/** Applies the plan; returns the characters freed. A write that fails leaves that key as it was. */
export function applyCleanup(storage: CleanupStorage, plan: CleanupAction[]): number {
  let freed = 0;
  for (const a of plan) {
    if ((PROTECTED as readonly string[]).includes(a.key)) continue;
    try {
      if (a.next === null) storage.removeItem(a.key);
      else storage.setItem(a.key, a.next);
      freed += a.before - a.after;
    } catch {
      // a full phone refuses even a smaller write: removing first would lose it, so it stays
    }
  }
  return freed;
}
