/**
 * 🌐 «رابط الزبائن» (his Nov 18 2026 ask «تطبيق للزبائن يفتح من المتصفح برابط»): a light page at starnet.etssadagha.com/c/
 * where a customer sends his account (name, phone, email, كود البريد، كود الواي فاي) or a new device (name, phone, KIT / SN),
 * and - with his own link - sees «حسابي»: his devices, their renewal and what he owes.
 *
 * Nothing is added by itself: a request waits for «➕ أضف / ✕ لا» like the WhatsApp emails. A request is sealed on the
 * customer's phone with the owner's public key (public/c/portal.js) and only his app opens it; a customer's page is sealed
 * with that customer's own key, which lives only in his link. The Firebase project is a separate one, its rules let only
 * the owner's phones (their uids) read requests or write pages. Pure logic here - storage and network in portalLink.ts.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { packJson, type PortalRequest } from "../../public/c/portal.js";
import type { Client, ClientStore } from "./clientStore";
import { daysRemainingNumber } from "./date";
import { formatAmount } from "./formatAmount";
import type { PartyStatementRow } from "./invoiceStore";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import { francPayLine } from "./payCurrency";
import { blankDevice } from "./saleDevices";
import { clientByPhone, phoneKey, statusWords } from "./whatsappDesk";

export type { PortalRequest };

/** Backed up and shared with his own laptop / second phone (the key pair must survive a phone change). */
export const PORTAL_KEY = "starnet_portal_v1";
/** The requests waiting for his «➕ أضف / ✕ لا». */
export const PORTAL_REQUESTS_KEY = "starnet_portal_requests_v1";
/** This phone's own sign-in on the portal project - a token, so phone-only (never backed up). */
export const PORTAL_AUTH_KEY = "starnet.portalAuth";
export const PORTAL_SITE = "https://starnet.etssadagha.com/c/";
export const PORTAL_EVENT = "starnet:portal";

export interface PortalSetup {
  apiKey: string;
  projectId: string;
  /** A random name for his folder on the project. */
  space: string;
  /** ECDH P-256 public key (b64url raw) - goes in every link. */
  publicKey: string;
  privateJwk: JsonWebKey;
  /** The uids of his phones / laptop allowed by the rules (each adds its own on its first sign-in). */
  owners: string[];
  /** The owners the rules he last copied had - a new one means «انشر القواعد من جديد». */
  rulesOwners?: string[];
  createdAt: string;
}

export interface PortalClientLink {
  token: string;
  key: string;
  createdAt: string;
  /** What was last sent (viewFingerprint) - an unchanged page is not sent again. */
  sent?: string;
  sentAt?: string;
}

export interface PortalStore {
  setup?: PortalSetup;
  /** clientId → his «حسابي» link. */
  links: Record<string, PortalClientLink>;
}

export interface PortalWaiting {
  id: string;
  /** ISO - when the customer sent it. */
  at: string;
  request: PortalRequest;
}

export function emptyPortalStore(): PortalStore {
  return { links: {} };
}

export function cleanPortalStore(raw: unknown): PortalStore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PortalStore>;
  const setup = r.setup && typeof r.setup.apiKey === "string" && typeof r.setup.projectId === "string" && typeof r.setup.publicKey === "string" ? r.setup : undefined;
  return { ...(setup ? { setup: { ...setup, owners: Array.isArray(setup.owners) ? setup.owners : [] } } : {}), links: r.links && typeof r.links === "object" ? r.links : {} };
}

/** The «firebaseConfig» he pastes (the whole snippet, JSON, or just the two lines) → what we need. */
export function parseFirebaseConfig(text: string): { apiKey: string; projectId: string } | null {
  const pick = (name: string) => text.match(new RegExp(`["']?${name}["']?\\s*[:=]\\s*["'\`]([^"'\`\\s]+)["'\`]`))?.[1];
  const apiKey = pick("apiKey");
  const projectId = pick("projectId");
  if (!apiKey || !projectId || !/^AIza[\w-]{20,}$/.test(apiKey) || !/^[a-z0-9-]{4,40}$/.test(projectId)) return null;
  return { apiKey, projectId };
}

/** The Firestore rules he pastes in the portal project: anyone with the link may only ADD a sealed request; only his
 * phones read / delete requests and write the customers' pages; a page is read only by its unguessable name. */
export function portalRules(owners: string[]): string {
  const ids = owners.length ? owners.map((u) => `'${u.replace(/[^\w-]/g, "")}'`).join(", ") : "'-'";
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function owner() { return request.auth != null && request.auth.uid in [${ids}]; }
    match /portal/{space}/requests/{id} {
      allow create: if request.resource.data.keys().hasOnly(['c']) && request.resource.data.c is string && request.resource.data.c.size() < 8000;
      allow list, get, delete: if owner();
    }
    match /portal/{space}/views/{token} {
      allow get: if true;
      allow create, update, delete: if owner();
    }
  }
}`;
}

export function rulesNeedPublishing(setup: PortalSetup): boolean {
  const done = new Set(setup.rulesOwners ?? []);
  return setup.owners.some((u) => !done.has(u));
}

export function withOwner(setup: PortalSetup, uid: string): PortalSetup {
  return setup.owners.includes(uid) ? setup : { ...setup, owners: [...setup.owners, uid] };
}

/** The link anyone may get (WhatsApp status, ads): the two request forms. */
export function joinLink(setup: PortalSetup, business: string): string {
  return `${PORTAL_SITE}#j.${packJson({ p: setup.projectId, k: setup.apiKey, s: setup.space, e: setup.publicKey, n: business })}`;
}

/** One customer's own «حسابي» link - whoever has it sees his page, so it goes to him alone. */
export function clientLink(setup: PortalSetup, link: PortalClientLink, business: string): string {
  return `${PORTAL_SITE}#v.${packJson({ p: setup.projectId, k: setup.apiKey, s: setup.space, e: setup.publicKey, t: link.token, x: link.key, n: business })}`;
}

// ---- «حسابي»: what his page shows ----

export interface PortalViewDevice {
  name: string;
  status: string;
  /** "YYYY-MM-DD" or "". */
  renewal: string;
  /** daysRemainingNumber (≤ 0 = ended, 1 = ends tonight) - null when not read yet. */
  daysLeft: number | null;
  /** His usual renewal price, e.g. "12,000 أوقية". */
  price?: string;
}

export interface PortalViewRow {
  date: string;
  label: string;
  /** "+ 12,000 أوقية" (عليه) / "- 12,000 أوقية" (دفعة). */
  amount: string;
  paid: boolean;
}

export interface PortalView {
  v: 1;
  business: string;
  name: string;
  devices: PortalViewDevice[];
  /** What he owes, per currency (never added together). Empty = nothing. */
  owed: string[];
  /** What we owe him, per currency. */
  credit: string[];
  rows: PortalViewRow[];
  pay: string;
  /** ISO - when this page was made. */
  at: string;
}

export const VIEW_ROWS = 10;

function money(amount: number, currency: string): string {
  return `${formatAmount(amount)} ${LEDGER_CURRENCY_LABELS[currency as LedgerCurrency] ?? currency}`;
}

function rowLabel(row: PartyStatementRow): string {
  if (row.type === "device-charge") return `📡 تجديد - ${row.deviceName ?? ""}`;
  if (row.type === "device-payment") return `💵 دفعة - ${row.deviceName ?? ""}`;
  if (row.type === "return") return "↩ مرتجع";
  if (row.type === "adjustment") return row.adjustment?.direction === "owesUs" ? "➕ رصيد عليك" : "➖ رصيد لك";
  return "🧾 فاتورة";
}

export function buildPortalView(input: {
  business: string;
  client: Pick<Client, "name">;
  devices: StarlinkAccountSummary[];
  /** currency → remaining (positive = he owes). */
  owed: Record<string, number>;
  /** His statement, newest first (buildClientCombinedStatement). */
  rows: PartyStatementRow[];
  payLines: string;
  usualPrice: (device: StarlinkAccountSummary) => { amount: number; currency: string } | null;
  now: string;
}): PortalView {
  const owedList = Object.entries(input.owed).filter(([, v]) => v > 0.005);
  const creditList = Object.entries(input.owed).filter(([, v]) => v < -0.005);
  const franc = input.owed.SIFA !== undefined ? francPayLine(input.owed.SIFA) : "";
  return {
    v: 1,
    business: input.business,
    name: input.client.name,
    devices: input.devices
      .filter((d) => !d.deletedAt && !d.archivedAt)
      .map((d) => {
        const price = input.usualPrice(d);
        const renewal = d.pendingActivation ? "" : d.rechargeDate || "";
        return {
          name: d.name,
          status: statusWords(d),
          renewal,
          daysLeft: renewal ? daysRemainingNumber(renewal) : null,
          ...(price ? { price: money(price.amount, price.currency) } : {}),
        };
      }),
    owed: owedList.map(([c, v]) => money(v, c)),
    credit: creditList.map(([c, v]) => money(-v, c)),
    rows: input.rows
      .filter((r) => r.type !== "deleted")
      .slice(0, VIEW_ROWS)
      .map((r) => {
        const paid = r.delta < 0;
        const value = r.delta !== 0 ? Math.abs(r.delta) : r.amount;
        const sign = r.delta === 0 ? "" : paid ? "- " : "+ ";
        return { date: (r.date || r.createdAt || "").slice(0, 10), label: rowLabel(r), amount: `${sign}${money(value, r.currencyCode)}`, paid };
      }),
    pay: [input.payLines.trim(), franc].filter(Boolean).join("\n"),
    at: input.now,
  };
}

/** What decides a new send - the page without its time. */
export function viewFingerprint(view: PortalView): string {
  const { at: _at, ...rest } = view;
  return JSON.stringify(rest);
}

// ---- requests ----

export function addWaiting(list: PortalWaiting[], items: PortalWaiting[]): PortalWaiting[] {
  const ids = new Set(list.map((w) => w.id));
  return [...list, ...items.filter((w) => !ids.has(w.id) && (ids.add(w.id), true))];
}

/** KIT… → kit number, anything else → serial number. */
export function kitOrSerial(code: string): { kitNumber: string } | { serialNumber: string } {
  const c = code.trim().toUpperCase();
  return /^KIT/.test(c) ? { kitNumber: c } : { serialNumber: c };
}

/** A device already here with the same email / KIT / SN. */
export function existingFor(accounts: StarlinkAccountSummary[], req: PortalRequest): StarlinkAccountSummary | undefined {
  const live = accounts.filter((a) => !a.deletedAt);
  if (req.kind === "existing") {
    const email = (req.email ?? "").toLowerCase();
    return live.find((a) => [a.expectedEmail, a.starlinkAccountEmail].some((e) => e?.trim().toLowerCase() === email));
  }
  const code = (req.kit ?? "").toUpperCase();
  return live.find((a) => [a.kitNumber, a.serialNumber].some((k) => k?.trim().toUpperCase() === code));
}

export interface PortalAddResult {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  created?: StarlinkAccountSummary;
  existing?: StarlinkAccountSummary;
  newClient?: Client;
}

/** «➕ أضف»: the device on the customer (found by his number, else a new customer). An account he already has = a
 * device with his email and codes; a new KIT / SN = a «غير مفعّل» device. Already here = nothing made. */
export function addPortalRequest(
  accounts: StarlinkAccountSummary[],
  clients: ClientStore,
  waiting: PortalWaiting,
  now: string,
  newId: () => string,
): PortalAddResult {
  const req = waiting.request;
  const existing = existingFor(accounts, req);
  if (existing) return { accounts, clients, existing };
  let client = clientByPhone(clients, req.phone);
  let newClient: Client | undefined;
  const nextClients: ClientStore = { ...clients };
  if (!client) {
    newClient = { id: newId(), name: req.name, ...(phoneKey(req.phone) ? { phone: req.phone } : {}), createdAt: now, updatedAt: now } as Client;
    nextClients[newClient.id] = newClient;
    client = newClient;
  }
  const base = { ...blankDevice(newId(), now), name: client.name, phone: client.phone ?? req.phone ?? "", clientId: client.id, fromPortal: now };
  const device: StarlinkAccountSummary =
    req.kind === "existing"
      ? {
          ...base,
          expectedEmail: req.email ?? "",
          ...(req.emailCode ? { expectedEmailPassword: req.emailCode } : {}),
          ...(req.wifiCode ? { wifiPassword: req.wifiCode } : {}),
        }
      : { ...base, ...kitOrSerial(req.kit ?? ""), pendingActivation: { soldAt: now.slice(0, 10) } };
  return { accounts: [device, ...accounts], clients: nextClients, created: device, ...(newClient ? { newClient } : {}) };
}

/** The lines of one request in his sheet (he sees the codes - they are his to work with). */
export function requestLines(req: PortalRequest): string[] {
  const who = `👤 ${req.name}${req.phone ? ` · ${req.phone}` : ""}`;
  if (req.kind === "new") return [who, `🆕 جهاز جديد: ${req.kit}`];
  return [who, `📧 ${req.email}`, ...(req.emailCode ? [`🔑 كود البريد: ${req.emailCode}`] : []), ...(req.wifiCode ? [`📶 كود الواي فاي: ${req.wifiCode}`] : [])];
}

/** The phone's notification - no codes in the notification bar. */
export function requestNotice(req: PortalRequest): string {
  return req.kind === "new"
    ? `🌐 طلب جهاز جديد من رابط الزبائن\n${req.name}${req.phone ? ` (${req.phone})` : ""}: ${req.kit}\nافتح التطبيق واضغط «➕ أضف» - لا يُضاف شيء وحده.`
    : `🌐 زبون أرسل حسابه من رابط الزبائن\n${req.name}${req.phone ? ` (${req.phone})` : ""}: ${req.email}\nافتح التطبيق واضغط «➕ أضف» - لا يُضاف شيء وحده.`;
}

/** The WhatsApp text that carries a customer's «حسابي» link. */
export function clientLinkMessage(name: string, link: string, business: string): string {
  return `مرحبًا ${name} 👋\nهذا رابط حسابك عند ${business}: أجهزتك وموعد تجديدها وما عليك، محدَّث دائمًا.\n${link}\nالرابط خاص بك - لا ترسله لأحد.`;
}

/** The text that carries the request link (status, groups, ads). */
export function joinLinkMessage(link: string, business: string): string {
  return `📡 ${business}\nسجّل جهاز ستارلينك عندنا من هنا - حسابك الحالي أو جهاز جديد:\n${link}`;
}
