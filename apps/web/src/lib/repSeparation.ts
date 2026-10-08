/**
 * 🔒 «زبائنه عنده فقط» - a rep's customers separated from the operator (his Oct 2026 request after
 * the council: «أريد أن أسجّل فقط على المندوب، ولا أعرف حسابات زبائنه»). Per rep, a switch hides
 * his customers from every operator screen: the clients page, the customer name on his devices'
 * cards, customer reminders and WhatsApp (they go to the rep instead). His devices stay (the
 * operator pays Starlink for them) and so does everything the rep owes. Nothing is deleted - the
 * customer stays on the device in the data, only hidden. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client } from "./clientStore";
import { currentRepOfClient } from "./repClients";
import type { Representative, RepresentativeStore } from "./repStore";

/** The reps whose customers are hidden. */
export function hiddenRepIds(reps: RepresentativeStore): Set<string> {
  return new Set(Object.values(reps).filter((r) => r.customersHidden).map((r) => r.id));
}

/** A device of a rep whose customers are hidden: shown under the rep's name, no customer. */
export function isHiddenRepDevice(account: Pick<StarlinkAccountSummary, "representativeId">, hidden: Set<string>): boolean {
  return Boolean(account.representativeId && hidden.has(account.representativeId));
}

/** A customer of such a rep (by who he belongs to now). */
export function isHiddenRepClient(client: Pick<Client, "repSegments"> | undefined, hidden: Set<string>): boolean {
  const rep = currentRepOfClient(client);
  return Boolean(rep && hidden.has(rep));
}

/** The customers the operator still sees. */
export function visibleClients<T extends Pick<Client, "repSegments">>(clients: T[], hidden: Set<string>): T[] {
  return hidden.size ? clients.filter((c) => !isHiddenRepClient(c, hidden)) : clients;
}

/** Who a hidden device's messages go to: its rep (name + phone). */
export function repContact(account: Pick<StarlinkAccountSummary, "representativeId">, reps: RepresentativeStore): Pick<Representative, "name" | "phone"> | undefined {
  const rep = account.representativeId ? reps[account.representativeId] : undefined;
  return rep ? { name: rep.name, phone: rep.phone } : undefined;
}

/** 🤝 Any rep's device - the rep follows it up, so it stays out of the operator's «خطة اليوم» and
 * reminders (his Oct 2026 ask «ازل عني فيها اجهزة المندوبين»); it stays on the home and rep pages. */
export function isRepDevice(account: Pick<StarlinkAccountSummary, "representativeId">): boolean {
  return Boolean(account.representativeId);
}

/** A customer who belongs to a rep now. */
export function isRepClient(client: Pick<Client, "repSegments"> | undefined): boolean {
  return Boolean(currentRepOfClient(client));
}

/** The operator's own devices and customers (no rep's). */
export function ownerOnly<A extends Pick<StarlinkAccountSummary, "representativeId">, C extends Pick<Client, "repSegments">>(
  accounts: A[],
  clients: Record<string, C>,
): { accounts: A[]; clients: Record<string, C> } {
  return {
    accounts: accounts.filter((a) => !isRepDevice(a)),
    clients: Object.fromEntries(Object.entries(clients).filter(([, c]) => !isRepClient(c))),
  };
}
