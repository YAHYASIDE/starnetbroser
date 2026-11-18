/**
 * 🌐 «رابط الزبائن» - the storage and network side (pure rules in customerPortal.ts). The owner's phones sign in
 * anonymously on HIS portal project (a separate Firebase project; its rules name these uids), read the sealed requests
 * into the waiting list, and send each customer's sealed «حسابي» page when it changed.
 */

import { demoAccounts } from "./demoData";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { loadClientStore, saveClientStore } from "./clientStore";
import { loadLedgerStore } from "./ledgerStore";
import { loadInvoices } from "./invoiceStore";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { clientDevicesWithHistory, loadClientMoves } from "./clientMoves";
import { buildClientCombinedStatement, computeClientCombinedTotals } from "./clientAccount";
import { lastChargePrice } from "./chargeDefault";
import { loadBusinessProfile, paymentInstructions } from "./pdfDocument";
import { addLocalEvent } from "./eventLog";
import { requestDataReload } from "./dataReload";
import { notifyPhone } from "./appEvents";
import { documentUrl, explainFirebaseError, type FetchFn, type Result } from "./firestoreRest";
import { timedFetch } from "./lowNet";
import { cleanRequest, makeOwnerKeys, openFromCustomer, randomToken, sealForOwner, sealView } from "../../public/c/portal.js";
import {
  addPortalRequest,
  addWaiting,
  buildPortalView,
  cleanPortalStore,
  clientLink,
  joinLink,
  parseFirebaseConfig,
  PORTAL_AUTH_KEY,
  PORTAL_EVENT,
  PORTAL_KEY,
  PORTAL_REQUESTS_KEY,
  requestNotice,
  viewFingerprint,
  withOwner,
  type PortalClientLink,
  type PortalSetup,
  type PortalStore,
  type PortalWaiting,
} from "./customerPortal";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tried again next round
  }
}

function changed(): void {
  window.dispatchEvent(new Event(PORTAL_EVENT));
}

export function loadPortalStore(): PortalStore {
  return cleanPortalStore(readJson<unknown>(PORTAL_KEY, null));
}

export function savePortalStore(store: PortalStore): void {
  writeJson(PORTAL_KEY, store);
  changed();
}

export function loadPortalWaiting(): PortalWaiting[] {
  const list = readJson<unknown>(PORTAL_REQUESTS_KEY, []);
  return Array.isArray(list) ? (list as PortalWaiting[]) : [];
}

function saveWaiting(list: PortalWaiting[]): void {
  writeJson(PORTAL_REQUESTS_KEY, list);
  changed();
}

export function portalBusinessName(): string {
  return loadBusinessProfile().name || "STAR NET";
}

// ---- sign-in (this phone's own, on the portal project) ----

interface PortalAuth {
  apiKey: string;
  uid: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit = {}): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchFn(url, init);
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
}

async function portalToken(setup: PortalSetup, fetchFn: FetchFn = timedFetch, now = Date.now()): Promise<Result<{ token: string; uid: string }>> {
  const saved = readJson<PortalAuth | null>(PORTAL_AUTH_KEY, null);
  const mine = saved && saved.apiKey === setup.apiKey ? saved : null;
  let auth: PortalAuth | null = null;
  if (mine && mine.expiresAt - 60_000 > now) auth = mine;
  else if (mine) {
    const r = await call(fetchFn, `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(setup.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(mine.refreshToken)}`,
    });
    if (r.status === 200) {
      const d = JSON.parse(r.body) as { id_token: string; refresh_token: string; expires_in: string; user_id: string };
      auth = { apiKey: setup.apiKey, uid: d.user_id || mine.uid, refreshToken: d.refresh_token, idToken: d.id_token, expiresAt: now + Number(d.expires_in) * 1000 };
    } else if (r.status === 0) return { ok: false, message: explainFirebaseError(0, "") };
  }
  if (!auth) {
    const r = await call(fetchFn, `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(setup.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
    const d = JSON.parse(r.body) as { idToken: string; refreshToken: string; expiresIn: string; localId: string };
    auth = { apiKey: setup.apiKey, uid: d.localId, refreshToken: d.refreshToken, idToken: d.idToken, expiresAt: now + Number(d.expiresIn) * 1000 };
  }
  writeJson(PORTAL_AUTH_KEY, auth);
  // this phone's uid goes in the rules he copies
  const store = loadPortalStore();
  if (store.setup && !store.setup.owners.includes(auth.uid)) savePortalStore({ ...store, setup: withOwner(store.setup, auth.uid) });
  return { ok: true, value: { token: auth.idToken, uid: auth.uid } };
}

function reqPath(setup: PortalSetup, id?: string): string {
  return `portal/${setup.space}/requests${id ? `/${id}` : ""}`;
}

function viewPath(setup: PortalSetup, token: string): string {
  return `portal/${setup.space}/views/${token}`;
}

// ---- setup ----

/** «💾 احفظ»: his pasted firebaseConfig → a new key pair and folder, and this phone signed in (its uid in the rules). */
export async function savePortalSetup(configText: string): Promise<Result<PortalSetup>> {
  const config = parseFirebaseConfig(configText);
  if (!config) return { ok: false, message: "لم أجد apiKey و projectId - الصق firebaseConfig كما هو من إعدادات المشروع" };
  const store = loadPortalStore();
  const same = store.setup && store.setup.projectId === config.projectId;
  const keys = same ? null : await makeOwnerKeys();
  const setup: PortalSetup = same
    ? { ...store.setup!, apiKey: config.apiKey }
    : { ...config, space: randomToken(9), publicKey: keys!.publicKey, privateJwk: keys!.privateJwk, owners: [], createdAt: new Date().toISOString() };
  savePortalStore({ ...store, setup, ...(same ? {} : { links: {} }) });
  const signed = await portalToken(setup);
  if (!signed.ok) return signed;
  return { ok: true, value: loadPortalStore().setup! };
}

/** «📋 نسخت القواعد ونشرتها». */
export function markRulesPublished(): void {
  const store = loadPortalStore();
  if (store.setup) savePortalStore({ ...store, setup: { ...store.setup, rulesOwners: [...store.setup.owners] } });
}

export function removePortalSetup(): void {
  savePortalStore({ links: {} });
  writeJson(PORTAL_AUTH_KEY, null);
}

/** «✅ جرّب»: a sealed request as a customer would send it (no sign-in) → read back and deleted by this phone; a page
 * written by this phone → read with no sign-in → deleted. */
export async function testPortal(fetchFn: FetchFn = timedFetch): Promise<Result<string>> {
  const setup = loadPortalStore().setup;
  if (!setup) return { ok: false, message: "احفظ إعداد المشروع أولًا" };
  const auth = await portalToken(setup, fetchFn);
  if (!auth.ok) return auth;
  const sealed = await sealForOwner(setup.publicKey, { test: true });
  const created = await call(fetchFn, `${documentUrl(setup, reqPath(setup))}?key=${encodeURIComponent(setup.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { c: { stringValue: sealed } } }),
  });
  if (created.status !== 200) return { ok: false, message: `الزبون لا يستطيع الإرسال: ${explainFirebaseError(created.status, created.body)}` };
  const name = (JSON.parse(created.body) as { name: string }).name.split("/").pop()!;
  const removed = await call(fetchFn, documentUrl(setup, reqPath(setup, name)), { method: "DELETE", headers: { Authorization: `Bearer ${auth.value.token}` } });
  if (removed.status !== 200) return { ok: false, message: `هاتفك لا يستطيع قراءة الطلبات: ${explainFirebaseError(removed.status, removed.body)}` };
  const token = `test-${randomToken(9)}`;
  const put = await call(fetchFn, documentUrl(setup, viewPath(setup, token)), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.value.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { c: { stringValue: "test" } } }),
  });
  if (put.status !== 200) return { ok: false, message: `هاتفك لا يستطيع نشر صفحة الزبون: ${explainFirebaseError(put.status, put.body)}` };
  const read = await call(fetchFn, `${documentUrl(setup, viewPath(setup, token))}?key=${encodeURIComponent(setup.apiKey)}`);
  await call(fetchFn, documentUrl(setup, viewPath(setup, token)), { method: "DELETE", headers: { Authorization: `Bearer ${auth.value.token}` } });
  if (read.status !== 200) return { ok: false, message: `الزبون لا يستطيع فتح صفحته: ${explainFirebaseError(read.status, read.body)}` };
  return { ok: true, value: "✓ كل شيء يعمل: الزبون يرسل، وهاتفك يقرأ وينشر صفحة الزبون" };
}

export function portalJoinLink(): string | null {
  const setup = loadPortalStore().setup;
  return setup ? joinLink(setup, portalBusinessName()) : null;
}

// ---- requests ----

/** The requests on the server → the waiting list (each opened with his key, then deleted there) + a notification each. */
export async function drainPortalRequests(fetchFn: FetchFn = timedFetch): Promise<Result<number>> {
  const setup = loadPortalStore().setup;
  if (!setup) return { ok: true, value: 0 };
  const auth = await portalToken(setup, fetchFn);
  if (!auth.ok) return auth;
  const r = await call(fetchFn, `${documentUrl(setup, reqPath(setup))}?pageSize=50`, { headers: { Authorization: `Bearer ${auth.value.token}` } });
  if (r.status === 404 && !/does not exist/i.test(r.body)) return { ok: true, value: 0 };
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  const docs = (JSON.parse(r.body || "{}") as { documents?: { name: string; createTime?: string; fields?: { c?: { stringValue?: string } } }[] }).documents ?? [];
  const fresh: PortalWaiting[] = [];
  for (const d of docs) {
    const id = d.name.split("/").pop()!;
    let request = null;
    try {
      request = cleanRequest(await openFromCustomer(setup.privateJwk, d.fields?.c?.stringValue ?? ""));
    } catch {
      request = null; // not sealed for him (or broken) - dropped
    }
    if (request) fresh.push({ id, at: d.createTime ?? new Date().toISOString(), request });
    await call(fetchFn, documentUrl(setup, reqPath(setup, id)), { method: "DELETE", headers: { Authorization: `Bearer ${auth.value.token}` } });
  }
  if (fresh.length) {
    const before = loadPortalWaiting();
    const next = addWaiting(before, fresh);
    saveWaiting(next);
    for (const w of next.slice(before.length)) await notifyPhone(requestNotice(w.request), "/");
  }
  return { ok: true, value: fresh.length };
}

export type PortalAcceptResult = { made: true; name: string } | { made: false; existing: string } | { made: false; existing?: undefined };

/** «➕ أضف». */
export function acceptPortalRequest(id: string): PortalAcceptResult {
  const list = loadPortalWaiting();
  const w = list.find((x) => x.id === id);
  if (!w) return { made: false };
  const now = new Date().toISOString();
  const result = addPortalRequest(loadDemoAccounts(demoAccounts), loadClientStore(), w, now, () => crypto.randomUUID());
  saveWaiting(list.filter((x) => x.id !== id));
  if (result.existing) return { made: false, existing: result.existing.name || result.existing.expectedEmail };
  if (result.newClient) saveClientStore(result.clients);
  if (result.created) {
    saveDemoAccounts(result.accounts);
    addLocalEvent(`🌐 أُضيف جهاز من رابط الزبائن: ${result.created.name}${w.request.kind === "new" ? " («غير مفعّل»)" : ""}`, "/");
    requestDataReload();
  }
  return { made: true, name: result.created?.name ?? w.request.name };
}

/** «✕ لا». */
export function dismissPortalRequest(id: string): void {
  saveWaiting(loadPortalWaiting().filter((x) => x.id !== id));
}

// ---- «حسابي» ----

function viewOf(clientId: string) {
  const client = loadClientStore()[clientId];
  if (!client) return null;
  const accounts = loadDemoAccounts(demoAccounts);
  const ledger = loadLedgerStore();
  const moves = loadClientMoves();
  const invoices = loadInvoices();
  const adjustments = loadPartyAdjustments();
  const withHistory = clientDevicesWithHistory(accounts, clientId, moves);
  const owed = Object.fromEntries(Object.entries(computeClientCombinedTotals(invoices, adjustments, clientId, withHistory, ledger, moves)).map(([c, t]) => [c, t.remaining]));
  return buildPortalView({
    business: portalBusinessName(),
    client,
    devices: accounts.filter((a) => a.clientId === clientId),
    owed,
    rows: buildClientCombinedStatement(invoices, adjustments, clientId, withHistory, ledger, moves),
    payLines: paymentInstructions(),
    usualPrice: (d) => lastChargePrice(ledger[d.id] ?? []),
    now: new Date().toISOString(),
  });
}

async function sendView(setup: PortalSetup, clientId: string, link: PortalClientLink, force: boolean, fetchFn: FetchFn): Promise<Result<PortalClientLink>> {
  const view = viewOf(clientId);
  if (!view) return { ok: false, message: "الزبون غير موجود" };
  const print = viewFingerprint(view);
  if (!force && print === link.sent) return { ok: true, value: link };
  const auth = await portalToken(setup, fetchFn);
  if (!auth.ok) return auth;
  const r = await call(fetchFn, documentUrl(setup, viewPath(setup, link.token)), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.value.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { c: { stringValue: await sealView(link.key, view) } } }),
  });
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  return { ok: true, value: { ...link, sent: print, sentAt: view.at } };
}

function saveLink(clientId: string, link: PortalClientLink | null): void {
  const store = loadPortalStore();
  const links = { ...store.links };
  if (link) links[clientId] = link;
  else delete links[clientId];
  savePortalStore({ ...store, links });
}

/** «🔗 رابط حسابه»: his link (made once), his page sent now. */
export async function clientPortalLink(clientId: string, fetchFn: FetchFn = timedFetch): Promise<Result<string>> {
  const store = loadPortalStore();
  if (!store.setup) return { ok: false, message: "فعّل «🌐 رابط الزبائن» من الإعدادات ← البوتات أولًا" };
  const link = store.links[clientId] ?? { token: randomToken(), key: randomToken(), createdAt: new Date().toISOString() };
  const sent = await sendView(store.setup, clientId, link, true, fetchFn);
  if (!sent.ok) return sent;
  saveLink(clientId, sent.value);
  return { ok: true, value: clientLink(store.setup, sent.value, portalBusinessName()) };
}

/** «🚫 أوقف رابطه»: his page deleted - the old link opens nothing. */
export async function stopClientPortalLink(clientId: string, fetchFn: FetchFn = timedFetch): Promise<Result<true>> {
  const store = loadPortalStore();
  const link = store.links[clientId];
  if (!store.setup || !link) return { ok: true, value: true };
  const auth = await portalToken(store.setup, fetchFn);
  if (!auth.ok) return auth;
  const r = await call(fetchFn, documentUrl(store.setup, viewPath(store.setup, link.token)), { method: "DELETE", headers: { Authorization: `Bearer ${auth.value.token}` } });
  if (r.status !== 200 && r.status !== 404) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  saveLink(clientId, null);
  return { ok: true, value: true };
}

/** Every customer's page that changed since it was last sent. */
export async function refreshPortalViews(fetchFn: FetchFn = timedFetch): Promise<number> {
  const store = loadPortalStore();
  if (!store.setup) return 0;
  let sent = 0;
  for (const [clientId, link] of Object.entries(store.links)) {
    const r = await sendView(store.setup, clientId, link, false, fetchFn);
    if (!r.ok) break;
    if (r.value !== link) {
      saveLink(clientId, r.value);
      sent++;
    }
  }
  return sent;
}
