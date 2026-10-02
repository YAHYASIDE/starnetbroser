/**
 * 📋 «نسخة المندوب»: everything about one representative's devices, sent from the operator's
 * phone to the rep's app (through the reps bot, encrypted with the rep's own code - the same code
 * his «وضع المندوب» already uses). The rep opens the file in STAR NET and sees his devices exactly
 * as the operator does: status, dates, the customer, every amount, his share - and opens each
 * device's Starlink account, whose session travels inside the file.
 *
 * Each new copy REPLACES the old one: a device moved to another rep (or a rep stopped) simply isn't
 * in the next copy, and the rep's app removes it - with its Starlink session.
 *
 * Pure helpers + the rep-side store (`starnet_` data on the rep's phone).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup, type EncryptedBackup } from "./backupCrypto";
import { computeBalanceByCurrency, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";
import { buildProfitRows, type ProfitRow } from "./profitStatement";

/** url -> cookie string, as exportSessionCookies gives it. */
export type DeviceCookies = Record<string, string>;

export interface RepCopyDevice {
  account: StarlinkAccountSummary;
  /** Every operation of the device (shipments and payments), as the operator has them. */
  entries: LedgerEntry[];
  clientName?: string;
  clientPhone?: string;
}

export interface RepCopy {
  repId: string;
  repName: string;
  commissionPercent: number;
  /** ISO time the operator made this copy - an older file never replaces a newer copy. */
  sentAt: string;
  devices: RepCopyDevice[];
  /** 1 USD in each registered currency (for showing amounts in أوقية / سيفا). */
  rates: Record<string, number>;
  /** The rep's slice of the app's own stores (lib/repWorkspace.ts) - the full app runs on it. */
  stores?: Record<string, unknown>;
}

export interface RepCopyPayload extends RepCopy {
  /** accountId (or "mail:<accountId>") -> its session. */
  sessions: Record<string, DeviceCookies>;
}

export interface RepCopyInput {
  repId: string;
  repName: string;
  commissionPercent: number;
  accounts: StarlinkAccountSummary[];
  ledger: LedgerByAccount;
  clients: Record<string, { name: string; phone?: string }>;
  rates: Record<string, number>;
  now?: Date;
}

/** The rep's devices: linked to him, not deleted or archived. */
export function repCopyAccounts(accounts: StarlinkAccountSummary[], repId: string): StarlinkAccountSummary[] {
  return accounts.filter((a) => a.representativeId === repId && !a.deletedAt && !a.archivedAt);
}

export function buildRepCopy(input: RepCopyInput): RepCopy {
  const devices = repCopyAccounts(input.accounts, input.repId).map((account) => {
    const client = account.clientId ? input.clients[account.clientId] : undefined;
    return {
      account,
      entries: input.ledger[account.id] ?? [],
      ...(client?.name ? { clientName: client.name } : {}),
      ...(client?.phone ? { clientPhone: client.phone } : {}),
    };
  });
  return {
    repId: input.repId,
    repName: input.repName,
    commissionPercent: input.commissionPercent,
    sentAt: (input.now ?? new Date()).toISOString(),
    devices,
    rates: input.rates,
  };
}

// ---- what the rep's card shows ----

export interface RepDeviceSummary {
  /** What the customer still owes, per currency (only positive balances). */
  debt: Record<string, number>;
  confirmedMru: number;
  expectedMru: number;
  /** The rep's share of the confirmed profit. */
  repShareMru: number;
  /** Every shipment with a known profit, newest first (confirmed and still-D). */
  rows: ProfitRow[];
}

export function summarizeRepDevice(device: RepCopyDevice, mruRate: number | undefined): RepDeviceSummary {
  const ledger = { [device.account.id]: device.entries };
  const confirmed = buildProfitRows(ledger, {}, mruRate, "confirmed");
  const expected = buildProfitRows(ledger, {}, mruRate, "expected");
  const debt: Record<string, number> = {};
  for (const [code, value] of Object.entries(computeBalanceByCurrency(device.entries))) {
    if ((value ?? 0) > 0.0001) debt[code] = value!;
  }
  return {
    debt,
    confirmedMru: confirmed.reduce((sum, r) => sum + (r.profitMru ?? 0), 0),
    expectedMru: expected.reduce((sum, r) => sum + (r.profitMru ?? 0), 0),
    repShareMru: confirmed.reduce((sum, r) => sum + (r.rep?.shareMru ?? 0), 0),
    rows: [...confirmed, ...expected].sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : 0)),
  };
}

// ---- the file ----

interface RepCopyFile {
  kind: "starnet-rep-copy";
  v: 1;
  enc: EncryptedBackup;
}

export class NotARepCopyError extends Error {
  constructor() {
    super("هذا ليس ملف نسخة المندوب");
    this.name = "NotARepCopyError";
  }
}

export function repCopyFileName(repId: string): string {
  const slug = repId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "x";
  return `starnet-copy-${slug}.json`;
}

export async function buildRepCopyFile(payload: RepCopyPayload, code: string): Promise<string> {
  const file: RepCopyFile = { kind: "starnet-rep-copy", v: 1, enc: await encryptBackup(payload, code) };
  return JSON.stringify(file);
}

/** True when `text` looks like a copy file (before trying a code on it). */
export function isRepCopyFile(text: string): boolean {
  try {
    const file = JSON.parse(text) as Partial<RepCopyFile>;
    return file?.kind === "starnet-rep-copy" && Boolean(file.enc?.ciphertext);
  } catch {
    return false;
  }
}

/** Throws NotARepCopyError for anything else, WrongPasswordError for another rep's code. */
export async function readRepCopyFile(text: string, code: string): Promise<RepCopyPayload> {
  if (!isRepCopyFile(text)) throw new NotARepCopyError();
  const file = JSON.parse(text) as RepCopyFile;
  const payload = (await decryptBackup(file.enc, code)) as Partial<RepCopyPayload>;
  if (!payload?.repId || !Array.isArray(payload.devices) || !payload.sentAt) throw new NotARepCopyError();
  return { ...payload, sessions: payload.sessions ?? {}, rates: payload.rates ?? {} } as RepCopyPayload;
}

/** Devices in the old copy that the new one no longer has - removed (with their sessions). */
export function removedDeviceIds(previous: RepCopy | null, next: RepCopy): string[] {
  if (!previous) return [];
  const keep = new Set(next.devices.map((d) => d.account.id));
  return previous.devices.map((d) => d.account.id).filter((id) => !keep.has(id));
}

/** A copy older than the one already on the phone is refused (a file opened twice, out of order). */
export function isOlderCopy(current: RepCopy | null, incoming: RepCopy): boolean {
  return Boolean(current && current.repId === incoming.repId && incoming.sentAt < current.sentAt);
}

// ---- rep side store ----

const COPY_KEY = "starnet_rep_copy_v1";

export function loadRepCopy(): RepCopy | null {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(COPY_KEY);
    const parsed = raw ? (JSON.parse(raw) as RepCopy) : null;
    return parsed && Array.isArray(parsed.devices) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRepCopy(copy: RepCopy | null): boolean {
  try {
    if (copy) window.localStorage.setItem(COPY_KEY, JSON.stringify(copy));
    else window.localStorage.removeItem(COPY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** The copy without its sessions (they go into each device's isolated browser, never storage). */
export function withoutSessions(payload: RepCopyPayload): RepCopy {
  const { sessions: _sessions, ...copy } = payload;
  return copy;
}

// ---- operator side: when each rep last got his copy (a convenience, not business data) ----

const SENT_KEY = "starnet.repCopySentAt";

export function loadRepCopySentAt(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markRepCopySent(repId: string, at: string): void {
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify({ ...loadRepCopySentAt(), [repId]: at }));
  } catch {
    // only the "last sent" line is lost
  }
}
