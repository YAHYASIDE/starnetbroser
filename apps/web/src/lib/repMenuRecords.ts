"use client";

/**
 * The app's side of the reps bot's device menu (TelegramReplyService leaves these in its inbox):
 * a ✏️ edit becomes a request on the representatives page (applied only once approved - here or
 * with ✅ in the owner's bot), a 📝 note is saved on the device straight away, a 💵 payment waits
 * for approval like one typed in full.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { LocalBrowser, type TelegramInboxMessage } from "@starnet/local-browser-plugin";
import { loadClientStore, saveClientStore, updateClient } from "./clientStore";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { localDay } from "./eveningSummary";
import { LEDGER_CURRENCIES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type LedgerCurrency, type PaymentMethod } from "./ledgerStore";
import { isPaymentMethod, loadActivationCosts, recordRepActivation as recordActivationOnDevice, type ActivationCost } from "./repActivation";
import { appendRepNote, editFieldName, isRepEditField, repEditPatch } from "./repDeviceMenu";
import { addRepRequest, hasBotRequest, loadRepRequests, resolveRepRequest, saveRepRequests, type RepRequest } from "./repRequests";
import { addRepBookEntry, currentRepOfClient, loadRepBook, saveRepBook, undoRepBookEntry } from "./repClients";
import { loadRepresentativeStore } from "./repStore";
import { isDemoMode } from "./settingsStore";
import { sendRepText } from "./telegram";
import { formatMoneyShort } from "./telegramRepMessages";

/** Fired after a device / customer changed outside the page showing them (HomeView and the
 * representatives page reload them). */
export const ACCOUNTS_CHANGED_EVENT = "starnet:accounts-changed";

function notifyChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

function parse(data: string | undefined): Record<string, unknown> | null {
  try {
    const value: unknown = data ? JSON.parse(data) : null;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Writes a device change to the phone's device list (the local store). False when the device
 * isn't there (or the app runs on the server's list - not supported here). */
function patchStoredAccount(accountId: string, patch: (account: StarlinkAccountSummary) => Partial<StarlinkAccountSummary>): boolean {
  if (!isDemoMode()) return false;
  const accounts = loadDemoAccounts(demoAccounts);
  const target = accounts.find((a) => a.id === accountId);
  if (!target) return false;
  saveDemoAccounts(accounts.map((a) => (a.id === accountId ? { ...a, ...patch(a) } : a)));
  return true;
}

function findAccount(accountId: string): StarlinkAccountSummary | undefined {
  return isDemoMode() ? loadDemoAccounts(demoAccounts).find((a) => a.id === accountId) : undefined;
}

/** An approved edit: device fields on the device, name/phone on its customer. */
export function applyRepEdit(request: RepRequest): boolean {
  if (!request.accountId || !request.field || !isRepEditField(request.field) || request.value === undefined) return false;
  const patch = repEditPatch(request.field, request.value);
  if (patch.account) {
    if (!patchStoredAccount(request.accountId, () => patch.account!)) return false;
  }
  if (patch.client) {
    const clientId = findAccount(request.accountId)?.clientId;
    const store = loadClientStore();
    const client = clientId ? store[clientId] : undefined;
    if (!client) return false;
    saveClientStore(updateClient(store, client.id, { name: patch.client.name ?? client.name, phone: patch.client.phone ?? client.phone, creditLimit: client.creditLimit }));
  }
  notifyChanged();
  return true;
}

/** ✅/❌ on an edit, from the representatives page ("app") or the owner's bot ("telegram" - he
 * was already told there). */
export async function decideRepEdit(request: RepRequest, approve: boolean, source: "app" | "telegram"): Promise<{ ok: boolean; message?: string }> {
  const current = loadRepRequests().find((r) => r.id === request.id);
  if (!current || current.status !== "pending") return { ok: true };
  const applied = approve ? applyRepEdit(current) : true;
  saveRepRequests(resolveRepRequest(loadRepRequests(), current.id, approve && applied ? "approved" : "rejected"));
  if (source === "app") {
    if (current.editId) void LocalBrowser.telegramResolveEdit({ id: current.editId }).catch(() => {});
    const field = current.field && isRepEditField(current.field) ? editFieldName(current.field) : "المعلومة";
    const what = `${field} لـ ${current.deviceName ?? "الجهاز"} إلى «${current.value ?? ""}»`;
    await sendRepText(current.repId, approve && applied ? `✅ وافق المسؤول على تعديل ${what}` : `❌ لم يوافق المسؤول على تعديل ${what}`);
  }
  if (approve && !applied) return { ok: false, message: "لم أجد الجهاز أو زبونه - لم يُحفظ التعديل" };
  return { ok: true };
}

/** ✏️ from the bot -> a pending request on the representatives page (once per edit id). */
function recordRepEdit(data: Record<string, unknown>): void {
  const editId = str(data.id);
  const field = str(data.field);
  if (!editId || !isRepEditField(field) || loadRepRequests().some((r) => r.editId === editId)) return;
  saveRepRequests(
    addRepRequest(loadRepRequests(), {
      repId: str(data.repId),
      kind: "edit",
      text: `تعديل ${editFieldName(field)} لـ ${str(data.device)}`,
      editId,
      accountId: str(data.accountId),
      deviceName: str(data.device),
      field,
      value: str(data.value),
      oldValue: str(data.old),
    }),
  );
}

/** 💵 A payment the rep entered step by step in the bot (amount -> currency -> whose -> ✅): a
 * customer's device becomes a payment request, "في حسابي الشخصي" a handover to his own account -
 * both wait for the operator's approval on the representatives page. */
export function repPaymentRequest(data: Record<string, unknown>): Omit<RepRequest, "id" | "createdAt" | "status"> | null {
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const currency = str(data.currency);
  const repId = str(data.repId);
  if (!repId || !(amount > 0) || !LEDGER_CURRENCIES.includes(currency as LedgerCurrency)) return null;
  const label = str(data.label) || formatMoneyShort(amount, currency);
  const method = PAYMENT_METHODS.includes(str(data.method) as PaymentMethod) ? (str(data.method) as PaymentMethod) : undefined;
  const photo = str(data.photo);
  const botId = str(data.id);
  const extra = {
    ...(botId ? { botId } : {}),
    ...(method ? { paymentMethod: method } : {}),
    ...(photo ? { proofFileId: photo, proofBot: str(data.bot) === "money" ? ("money" as const) : ("reps" as const) } : {}),
  };
  const via = method ? ` (${PAYMENT_METHOD_LABELS[method]})` : "";
  if (data.personal === true) {
    return { repId, kind: "handover", text: `💼 دفعة في حسابي الشخصي: ${label}${via}`, amount, currency: currency as LedgerCurrency, ...extra };
  }
  const accountId = str(data.accountId);
  if (!accountId) return null;
  return { repId, kind: "payment", text: `💵 دفعة ${label}${via} عن ${str(data.target) || "جهاز"}`, amount, currency: currency as LedgerCurrency, accountId, ...extra };
}

/** 💵 for one of the rep's OWN customers -> a payment in his book (true), else false (the old
 * approval path). The bot's id makes a repeated record count once. */
export function bookRepPayment(data: Record<string, unknown>): boolean {
  const repId = str(data.repId);
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const currency = str(data.currency);
  if (!repId || data.personal === true || !(amount > 0) || !LEDGER_CURRENCIES.includes(currency as LedgerCurrency)) return false;
  const clientId = findAccount(str(data.accountId))?.clientId;
  const client = clientId ? loadClientStore()[clientId] : undefined;
  if (!client || currentRepOfClient(client) !== repId) return false;
  const method = PAYMENT_METHODS.includes(str(data.method) as PaymentMethod) ? (str(data.method) as PaymentMethod) : undefined;
  const at = typeof data.at === "number" ? new Date(data.at) : new Date();
  const result = addRepBookEntry(loadRepBook(), {
    ...(str(data.id) ? { id: str(data.id) } : {}),
    repId,
    clientId: client.id,
    kind: "payment",
    amount,
    currency: currency as LedgerCurrency,
    note: method ? PAYMENT_METHOD_LABELS[method] : undefined,
    ...(method ? { paymentMethod: method } : {}),
    ...(str(data.photo) ? { proofFileId: str(data.photo), proofBot: str(data.bot) === "money" ? "money" : "reps" } : {}),
    date: localDay(at),
    createdAt: at.toISOString(),
  });
  if (!result.ok) return false;
  saveRepBook(result.book);
  return true;
}

/** ➕➖ له/عليه from the rep's bot -> an entry in his book, only on his own current customer. */
export function bookRepEntry(data: Record<string, unknown>): boolean {
  const repId = str(data.repId);
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const currency = str(data.currency);
  const kind = str(data.kind);
  const client = loadClientStore()[str(data.clientId)];
  if (!repId || !client || currentRepOfClient(client) !== repId) return false;
  if ((kind !== "charge" && kind !== "credit") || !(amount > 0) || !LEDGER_CURRENCIES.includes(currency as LedgerCurrency)) return false;
  const at = typeof data.at === "number" ? new Date(data.at) : new Date();
  const result = addRepBookEntry(loadRepBook(), {
    ...(str(data.id) ? { id: str(data.id) } : {}),
    repId,
    clientId: client.id,
    kind,
    amount,
    currency: currency as LedgerCurrency,
    note: str(data.note) || undefined,
    date: localDay(at),
    createdAt: at.toISOString(),
  });
  if (!result.ok) return false;
  saveRepBook(result.book);
  return true;
}

/** 🏦 A loan (سلفة) the rep asked for step by step in the money bot (amount -> currency ->
 * banking app -> recipient's number -> ✅): waits for the operator on the representatives page. */
export function repLoanRequest(data: Record<string, unknown>): Omit<RepRequest, "id" | "createdAt" | "status"> | null {
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const currency = str(data.currency);
  const repId = str(data.repId);
  const app = str(data.app).trim();
  const number = str(data.number).trim();
  if (!repId || !(amount > 0) || !LEDGER_CURRENCIES.includes(currency as LedgerCurrency) || !app || !number) return null;
  const label = str(data.label) || formatMoneyShort(amount, currency);
  return {
    ...(str(data.id) ? { botId: str(data.id) } : {}),
    repId,
    kind: "loan",
    text: `🏦 سلفة ${label} عبر ${app} إلى ${number}`,
    amount,
    currency: currency as LedgerCurrency,
    loanApp: app,
    loanNumber: number,
  };
}

/** ⚡ An activation the rep asked for -> a pending request on the representatives page (once). */
function recordRepActivation(data: Record<string, unknown>): void {
  const activationId = str(data.id);
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  if (!activationId || !(amount > 0) || loadRepRequests().some((r) => r.activationId === activationId)) return;
  const paid = str(data.paid);
  const currency = str(data.currency);
  const label = str(data.price) || formatMoneyShort(amount, currency);
  saveRepRequests(
    addRepRequest(loadRepRequests(), {
      repId: str(data.repId),
      kind: "activation",
      text: `⚡ تفعيل ${str(data.plan)} لـ ${str(data.device)} بسعر ${label}${isPaymentMethod(paid) ? ` - دفع للمندوب (${PAYMENT_METHOD_LABELS[paid]})` : " - لم يدفع بعد"}`,
      activationId,
      accountId: str(data.accountId),
      deviceName: str(data.device),
      plan: str(data.plan),
      amount,
      currency: LEDGER_CURRENCIES.includes(currency as LedgerCurrency) ? (currency as LedgerCurrency) : "MRU",
      ...(isPaymentMethod(paid) ? { paymentMethod: paid } : {}),
    }),
  );
}

/** ✅/❌ on an activation, from the representatives page ("app", with the amounts as edited there)
 * or the owner's bot ("telegram" - the rep was told there). Approving records it on the device. */
export async function decideRepActivation(
  request: RepRequest,
  approve: boolean,
  source: "app" | "telegram",
  input?: { amount: number; currency: string; cost: ActivationCost | undefined; paid?: PaymentMethod },
): Promise<{ ok: boolean; message?: string }> {
  const current = loadRepRequests().find((r) => r.id === request.id);
  if (!current || current.status !== "pending") return { ok: true };
  if (source === "app" && current.activationId) void LocalBrowser.telegramResolveActivation({ id: current.activationId }).catch(() => {});
  if (!approve) {
    saveRepRequests(resolveRepRequest(loadRepRequests(), current.id, "rejected"));
    if (source === "app") await sendRepText(current.repId, `❌ لم يوافق المسؤول على ${current.text.replace(/^⚡ /, "")}`, undefined, "money");
    return { ok: true };
  }
  const values = input ?? {
    amount: current.amount ?? 0,
    currency: current.currency ?? "MRU",
    cost: current.plan ? loadActivationCosts()[current.plan] : undefined,
    paid: current.paymentMethod,
  };
  const accounts = isDemoMode() ? loadDemoAccounts(demoAccounts) : [];
  const result = recordActivationOnDevice(current, { ...values, date: localDay(new Date()) }, accounts);
  if (!result.ok) {
    // ✅ in the bot but it can't be recorded yet: it stays here, marked, for the operator to finish.
    if (source === "telegram") saveRepRequests(loadRepRequests().map((r) => (r.id === current.id ? { ...r, approvedInBot: true } : r)));
    return { ok: false, message: result.message };
  }
  saveRepRequests(resolveRepRequest(loadRepRequests(), current.id, "approved"));
  notifyChanged();
  if (source === "app") {
    await sendRepText(current.repId, `✅ وافق المسؤول على ${current.text.replace(/^⚡ /, "")}`, undefined, "money");
  }
  return { ok: true };
}

/** One inbox record from the device menu. True when it was one (handled or not). */
export async function handleRepMenuRecord(message: TelegramInboxMessage): Promise<boolean> {
  if (!message.kind) return false;
  const data = parse(message.data);
  if (!data) return true;
  if (message.kind === "repEdit") {
    recordRepEdit(data);
    notifyChanged();
    return true;
  }
  if (message.kind === "repEditDecision") {
    // Carries the whole edit too, so a lost "repEdit" record never loses an approved change.
    recordRepEdit(data);
    const request = loadRepRequests().find((r) => r.editId === str(data.id));
    if (request) await decideRepEdit(request, data.approve === true, "telegram");
    return true;
  }
  if (message.kind === "repActivation") {
    recordRepActivation(data);
    notifyChanged();
    return true;
  }
  if (message.kind === "repActivationDecision") {
    // Carries the whole request too, so a lost "repActivation" record never loses an approval.
    recordRepActivation(data);
    const request = loadRepRequests().find((r) => r.activationId === str(data.id));
    if (request) await decideRepActivation(request, data.approve === true, "telegram");
    notifyChanged();
    return true;
  }
  if (message.kind === "repPayment") {
    // His own customer (repClients.ts): straight into his book - no approval.
    if (bookRepPayment(data)) {
      notifyChanged();
      return true;
    }
    const request = repPaymentRequest(data);
    // 🔒 The same message read twice never makes a second card (his Oct 2026 double payment).
    if (request && !hasBotRequest(loadRepRequests(), request.botId)) {
      saveRepRequests(addRepRequest(loadRepRequests(), request));
      notifyChanged();
    }
    return true;
  }
  if (message.kind === "repLoan") {
    const request = repLoanRequest(data);
    if (request && !hasBotRequest(loadRepRequests(), request.botId)) {
      saveRepRequests(addRepRequest(loadRepRequests(), request));
      notifyChanged();
    }
    return true;
  }
  if (message.kind === "repBookEntry") {
    if (bookRepEntry(data)) notifyChanged();
    return true;
  }
  if (message.kind === "repBookUndo") {
    const result = undoRepBookEntry(loadRepBook(), str(data.id), str(data.repId), new Date(typeof data.at === "number" ? data.at : Date.now()));
    if (result.ok) {
      saveRepBook(result.book);
      notifyChanged();
    } else if (str(data.repId)) {
      await sendRepText(str(data.repId), `↩️ لم يُلغَ: ${result.message}`, undefined, "money");
    }
    return true;
  }
  if (message.kind === "repNote") {
    const text = str(data.text).trim();
    if (!text) return true;
    const repName = loadRepresentativeStore()[str(data.repId)]?.name ?? "";
    const at = typeof data.at === "number" ? new Date(data.at) : new Date();
    if (patchStoredAccount(str(data.accountId), (a) => ({ alertReason: appendRepNote(a.alertReason, repName, text, at) }))) notifyChanged();
    return true;
  }
  return true;
}
