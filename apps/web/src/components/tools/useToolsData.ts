"use client";

import { useCallback, useEffect, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "@/lib/apiClient";
import { ClientStore, loadClientStore } from "@/lib/clientStore";
import { CurrencyStore, listCurrencies, loadCurrencyStore } from "@/lib/currencyStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { LedgerByAccount, loadLedgerStore } from "@/lib/ledgerStore";
import { loadRepresentativeStore, RepresentativeStore } from "@/lib/repStore";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";

export interface ToolsData {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  ledger: LedgerByAccount;
  currencies: CurrencyStore;
  reps: RepresentativeStore;
  loaded: boolean;
  /** Saves edited devices (phone-only data mode); false when they live on a server. */
  saveAccounts: (accounts: StarlinkAccountSummary[]) => boolean;
}

/** Everything the tools read - loaded once from the phone's stores (never written here). */
export function useToolsData(): ToolsData {
  const [data, setData] = useState<Omit<ToolsData, "saveAccounts">>({ accounts: [], clients: {}, ledger: {}, currencies: {}, reps: {}, loaded: false });
  useEffect(() => {
    const rest = { clients: loadClientStore(), ledger: loadLedgerStore(), currencies: loadCurrencyStore(), reps: loadRepresentativeStore() };
    if (isDemoMode()) {
      setData({ ...rest, accounts: loadDemoAccounts(demoAccounts), loaded: true });
      return;
    }
    setData({ ...rest, accounts: [], loaded: !isLoggedIn() });
    if (isLoggedIn()) {
      listAccounts()
        .then((accounts) => setData({ ...rest, accounts, loaded: true }))
        .catch(() => setData({ ...rest, accounts: [], loaded: true }));
    }
  }, []);
  const saveAccounts = useCallback((accounts: StarlinkAccountSummary[]) => {
    if (!isDemoMode()) return false;
    saveDemoAccounts(accounts);
    setData((current) => ({ ...current, accounts }));
    return true;
  }, []);
  return { ...data, saveAccounts };
}

export function currencyOptions(store: CurrencyStore): { code: string; label: string }[] {
  const list = listCurrencies(store).map((c) => ({ code: c.code, label: c.name }));
  return list.length > 0 ? list : [{ code: "MRU", label: "أوقية" }, { code: "USD", label: "دولار" }];
}

export function currencyLabelFor(store: CurrencyStore): (code: string) => string {
  return (code) => store[code]?.name ?? (code === "MRU" ? "أوقية" : code === "USD" ? "دولار" : code === "SIFA" ? "سيفا" : code);
}

export function moneyText(amounts: Record<string, number>, label: (code: string) => string): string {
  const parts = Object.entries(amounts)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .map(([code, v]) => `${Math.round(v * 100) / 100 === Math.round(v) ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${label(code)}`);
  return parts.join(" + ") || "0";
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
