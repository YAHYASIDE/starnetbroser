"use client";

/** 💱 Reads what partyCurrency.ts needs from the phone's stores, so any form can ask «what currency
 * is this device's rep / customer dealt with in?» without being handed every store. */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadClientStore } from "./clientStore";
import { loadDemoAccounts } from "./demoAccountStore";
import { loadLedgerStore } from "./ledgerStore";
import { expectedCurrencyFor, type ExpectedCurrency, type PartyCurrencyContext } from "./partyCurrency";
import { isRepWorkspace } from "./repMode";
import { loadRepresentativeStore } from "./repStore";

export function loadPartyCurrencyContext(accounts?: StarlinkAccountSummary[]): PartyCurrencyContext {
  return {
    accounts: accounts ?? loadDemoAccounts([]),
    clients: loadClientStore(),
    reps: loadRepresentativeStore(),
    ledger: loadLedgerStore(),
    repWorkspace: isRepWorkspace(),
  };
}

/** The expected currency of a device (by id, or by the rep / customer picked in a form). */
export function loadExpectedCurrency(link: { accountId?: string; clientId?: string; representativeId?: string }): ExpectedCurrency | undefined {
  if (typeof window === "undefined") return undefined;
  const ctx = loadPartyCurrencyContext();
  const device = link.accountId ? ctx.accounts.find((a) => a.id === link.accountId) : undefined;
  return expectedCurrencyFor(
    {
      clientId: "clientId" in link ? link.clientId : device?.clientId,
      representativeId: "representativeId" in link ? link.representativeId : device?.representativeId,
    },
    ctx,
  );
}
