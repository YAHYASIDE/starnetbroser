/**
 * 🔔 «أي تعديل على الأجهزة أو الزبائن أو حذف لمعاملة يأتي إشعاره في الإشعارات» (his Oct 14 2026 ask) -
 * and «إشعار أنه تم تغيير سعر العملة». Pure: compares a store before and after a save and says, in his
 * words, what changed. Additions are not changes (a new device, customer or operation is no news);
 * what a Starlink sync writes on a device is not either - only the fields a person edits.
 * The impure side (reading the old value at save time, writing the 🔔 list) is changeLogStore.ts.
 */

import { formatAmount } from "./formatAmount";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface ChangeEvent {
  text: string;
  route: string;
}

/** The device fields a person edits (labels in his words). Everything else is the sync's or internal. */
export const WATCHED_DEVICE_FIELDS: Record<string, string> = {
  name: "الاسم",
  clientId: "الزبون",
  representativeId: "المندوب",
  renewalDate: "تاريخ التجديد",
  renewalPlan: "السعر الشهري",
  expectedEmail: "الإيميل",
  phone: "الهاتف",
  kitNumber: "رقم KIT",
  notes: "الملاحظات",
  paymentCardLast4: "البطاقة",
};

/** Customer fields worth a notice (not the bookkeeping timestamps). */
export const WATCHED_CLIENT_FIELDS: Record<string, string> = {
  name: "الاسم",
  phone: "الهاتف",
  creditLimit: "حد الدين",
  repSegments: "المندوب",
  defaultCurrency: "العملة",
};

const CURRENCY_WORDS: Record<string, string> = { MRU: "أوقية", SIFA: "سيفا", USD: "دولار" };
const currencyWord = (code: string) => CURRENCY_WORDS[code] ?? code;

function deviceRoute(device: Rec): string {
  const key = str(device.expectedEmail) || str(device.name);
  return key ? `/?q=${encodeURIComponent(key)}` : "/";
}

export function deviceChangeEvents(before: unknown, after: unknown): ChangeEvent[] {
  if (!Array.isArray(before) || !Array.isArray(after)) return [];
  const next = new Map(after.filter(isRec).map((d) => [str(d.id), d]));
  const out: ChangeEvent[] = [];
  for (const old of before.filter(isRec)) {
    const id = str(old.id);
    const now = next.get(id);
    const name = str(now?.name) || str(old.name) || "جهاز";
    if (!now) {
      out.push({ text: `🗑 حُذف الجهاز «${name}» نهائيًا`, route: "/trash" });
      continue;
    }
    if (!old.deletedAt && now.deletedAt) {
      out.push({ text: `🗑 حُذف الجهاز «${name}» (في سلة المحذوفات)`, route: "/trash" });
      continue;
    }
    if (old.deletedAt && !now.deletedAt) out.push({ text: `↩️ استُرجع الجهاز «${name}» من المحذوفات`, route: deviceRoute(now) });
    if (!old.archivedAt && now.archivedAt) out.push({ text: `📦 أُرشف الجهاز «${name}»`, route: "/archive" });
    if (old.archivedAt && !now.archivedAt) out.push({ text: `📤 أُخرج الجهاز «${name}» من الأرشيف`, route: deviceRoute(now) });
    const changed = Object.entries(WATCHED_DEVICE_FIELDS).filter(([f]) => !same(old[f], now[f]));
    if (!changed.length) continue;
    const rename = changed.some(([f]) => f === "name") ? ` (كان «${str(old.name) || "-"}»)` : "";
    out.push({ text: `✏️ تعديل الجهاز «${name}»${rename}\n${changed.map(([, label]) => label).join("، ")}`, route: deviceRoute(now) });
  }
  return out;
}

export function clientChangeEvents(before: unknown, after: unknown): ChangeEvent[] {
  if (!isRec(before) || !isRec(after)) return [];
  const out: ChangeEvent[] = [];
  for (const [id, old] of Object.entries(before)) {
    if (!isRec(old)) continue;
    const now = after[id];
    const name = (isRec(now) ? str(now.name) : "") || str(old.name) || "زبون";
    if (!isRec(now)) {
      out.push({ text: `🗑 حُذف الزبون «${name}»`, route: "/clients" });
      continue;
    }
    const changed = Object.entries(WATCHED_CLIENT_FIELDS).filter(([f]) => !same(old[f], now[f]));
    if (!changed.length) continue;
    const rename = changed.some(([f]) => f === "name") ? ` (كان «${str(old.name) || "-"}»)` : "";
    out.push({ text: `✏️ تعديل الزبون «${name}»${rename}\n${changed.map(([, label]) => label).join("، ")}`, route: "/clients" });
  }
  return out;
}

function entryWords(e: Rec): string {
  const kind = e.kind === "credit" ? "دفعة" : "تجديد";
  const amount = typeof e.amount === "number" ? formatAmount(e.amount) : "";
  return `${kind} ${amount} ${currencyWord(str(e.currency))} · ${str(e.date)}`.trim();
}

/** Operations deleted, or edited in what they say (amount, currency, date, kind) - per device. */
export function ledgerChangeEvents(before: unknown, after: unknown, deviceName: (accountId: string) => string): ChangeEvent[] {
  if (!isRec(before) || !isRec(after)) return [];
  const out: ChangeEvent[] = [];
  for (const [accountId, list] of Object.entries(before)) {
    if (!Array.isArray(list)) continue;
    const nowList = Array.isArray(after[accountId]) ? (after[accountId] as unknown[]).filter(isRec) : [];
    const nowById = new Map(nowList.map((e) => [str(e.id), e]));
    const name = deviceName(accountId) || "جهاز";
    const route = `/?q=${encodeURIComponent(name)}`;
    const removed: Rec[] = [];
    for (const old of list.filter(isRec)) {
      const now = nowById.get(str(old.id));
      if (!now) {
        removed.push(old);
        continue;
      }
      if (["amount", "currency", "date", "kind"].some((f) => !same(old[f], now[f]))) {
        out.push({ text: `✏️ عُدّلت عملية على «${name}»\n${entryWords(old)} ← ${entryWords(now)}`, route });
      }
    }
    if (removed.length === 1) out.push({ text: `🗑 حُذفت عملية من «${name}»\n${entryWords(removed[0]!)}`, route });
    else if (removed.length > 1) out.push({ text: `🗑 حُذفت ${removed.length} عمليات من «${name}»\n${removed.slice(0, 3).map(entryWords).join("\n")}${removed.length > 3 ? "\n…" : ""}`, route });
  }
  return out;
}

/** 💱 «تم تغيير سعر العملة»: every currency whose rate per dollar moved. */
export function rateChangeEvents(before: unknown, after: unknown): ChangeEvent[] {
  if (!isRec(before) || !isRec(after)) return [];
  const out: ChangeEvent[] = [];
  for (const [code, now] of Object.entries(after)) {
    const old = before[code];
    if (!isRec(now) || !isRec(old) || typeof now.rateFromUsd !== "number" || typeof old.rateFromUsd !== "number") continue;
    if (Math.abs(now.rateFromUsd - old.rateFromUsd) < 1e-9) continue;
    out.push({
      text: `💱 تغيّر سعر ${str(now.name) || code} (${code})\n1$ = ${formatAmount(old.rateFromUsd)} ← ${formatAmount(now.rateFromUsd)}`,
      route: "/currencies",
    });
  }
  return out;
}

/** One save that changes a lot (a restore, a merge…) is one notice, not dozens. */
export function collapseEvents(events: ChangeEvent[], max = 8): ChangeEvent[] {
  if (events.length <= max) return events;
  const titles = events.map((e) => e.text.split("\n")[0]);
  return [{ text: `🔔 ${events.length} تعديلات دفعة واحدة\n${titles.slice(0, 5).join("\n")}\n…`, route: events[0]!.route }];
}
