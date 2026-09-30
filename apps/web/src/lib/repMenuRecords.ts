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
import { LEDGER_CURRENCIES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type LedgerCurrency, type PaymentMethod } from "./ledgerStore";
import { appendRepNote, editFieldName, isRepEditField, repEditPatch } from "./repDeviceMenu";
import { addRepRequest, loadRepRequests, resolveRepRequest, saveRepRequests, type RepRequest } from "./repRequests";
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
  const extra = {
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
    repId,
    kind: "loan",
    text: `🏦 سلفة ${label} عبر ${app} إلى ${number}`,
    amount,
    currency: currency as LedgerCurrency,
    loanApp: app,
    loanNumber: number,
  };
}

/** One inbox record from the device menu. True when it was one (handled or not). */
export async function handleRepMenuRecord(message: TelegramInboxMessage): Promise<boolean> {
  if (!message.kind) return false;
  const data = parse(message.data);
  if (!data) return true;
  if (message.kind === "repEdit") {
    recordRepEdit(data);
    return true;
  }
  if (message.kind === "repEditDecision") {
    // Carries the whole edit too, so a lost "repEdit" record never loses an approved change.
    recordRepEdit(data);
    const request = loadRepRequests().find((r) => r.editId === str(data.id));
    if (request) await decideRepEdit(request, data.approve === true, "telegram");
    return true;
  }
  if (message.kind === "repPayment") {
    const request = repPaymentRequest(data);
    if (request) saveRepRequests(addRepRequest(loadRepRequests(), request));
    return true;
  }
  if (message.kind === "repLoan") {
    const request = repLoanRequest(data);
    if (request) saveRepRequests(addRepRequest(loadRepRequests(), request));
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
