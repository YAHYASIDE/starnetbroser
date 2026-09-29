/**
 * 📧 البريد المسجّل: every device's email with whether its mailbox is signed in on this phone
 * (native MailSessionStore via listMailSessions) - searchable, signed-in first. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";

export interface MailboxSession {
  accountId: string;
  email: string;
  signedInAt: number;
}

export interface MailboxRow {
  accountId: string;
  email: string;
  /** A Gmail address: read in the app with its app password (the others: Outlook web). */
  gmail: boolean;
  deviceName: string;
  clientName?: string;
  signedIn: boolean;
  signedInAt?: number;
}

export type MailboxFilter = "signed" | "all";

/** Gmail addresses (read in the app over IMAP with an app password). */
export function isGmail(email: string | undefined): boolean {
  return /@(gmail|googlemail)\.com$/i.test((email ?? "").trim());
}

/** The email a device's mailbox opens with. */
export function deviceEmail(account: Pick<StarlinkAccountSummary, "expectedEmail" | "starlinkAccountEmail">): string {
  return (account.expectedEmail || account.starlinkAccountEmail || "").trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildMailboxRows(
  accounts: StarlinkAccountSummary[],
  clientStore: ClientStore,
  sessions: MailboxSession[],
  query = "",
  filter: MailboxFilter = "signed",
): MailboxRow[] {
  const byId = new Map(sessions.map((s) => [s.accountId, s]));
  const q = normalize(query);
  const rows: MailboxRow[] = [];
  for (const account of accounts) {
    if (account.deletedAt) continue;
    const session = byId.get(account.id);
    const email = deviceEmail(account) || session?.email || "";
    if (!email && !session) continue;
    const row: MailboxRow = {
      accountId: account.id,
      email,
      gmail: isGmail(email),
      deviceName: account.name,
      clientName: account.clientId ? clientStore[account.clientId]?.name : undefined,
      signedIn: Boolean(session),
      ...(session ? { signedInAt: session.signedInAt } : {}),
    };
    if (filter === "signed" && !row.signedIn) continue;
    if (q) {
      const haystack = normalize([row.email, row.deviceName, row.clientName ?? "", account.kitNumber ?? ""].join(" "));
      if (!haystack.includes(q)) continue;
    }
    rows.push(row);
  }
  return rows.sort((a, b) => Number(b.signedIn) - Number(a.signedIn) || a.email.localeCompare(b.email));
}

/** How many devices have a signed-in mailbox (only devices still in the app). */
export function signedInCount(accounts: StarlinkAccountSummary[], sessions: MailboxSession[]): number {
  const live = new Set(accounts.filter((a) => !a.deletedAt).map((a) => a.id));
  return sessions.filter((s) => live.has(s.accountId)).length;
}
