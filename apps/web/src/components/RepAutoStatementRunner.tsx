"use client";

import { useEffect } from "react";
import { getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { loadClientStore } from "@/lib/clientStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { loadInvoices } from "@/lib/invoiceStore";
import { loadLedgerStore } from "@/lib/ledgerStore";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { makeRepConverter } from "@/lib/repAccount";
import { loadRepBook } from "@/lib/repClients";
import { isRepWorkspace } from "@/lib/repMode";
import { ACCOUNTS_CHANGED_EVENT } from "@/lib/repMenuRecords";
import { applyRepRatePlans } from "@/lib/repRates";
import { buildRepAutoStatementPdf, newDebtRows, repCurrentStatement, repDebtRowKeys, type RepStatementSources } from "@/lib/repStatementDoc";
import { listRepresentatives, loadRepresentativeStore, loadRepSettlements } from "@/lib/repStore";
import { loadStoreItems } from "@/lib/storeStore";
import { isRepLinkedToBot, sendRepPdf } from "@/lib/telegram";

const EVERY_MS = 20_000;
/** Per rep, the operations (row keys) of the last statement sent - a phone setting, not business data. */
const SENT_KEY = "starnet.repAutoStatementSent";
/** The reps page's display currency (أوقية / سيفا / both). */
const DISPLAY_KEY = "starnet.repDisplayCurrency";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 📄 «كشف بعد كل عملية» (lib/repStatementDoc.ts): while the app is open, a rep who has it on gets his
 * statement (last 10 operations, what he owes) in the reps bot as soon as a new operation is on him.
 */
export function RepAutoStatementRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp() || isRepWorkspace()) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      const allReps = listRepresentatives(loadRepresentativeStore());
      const reps = allReps.filter((r) => r.autoStatement && isRepLinkedToBot(r.id));
      if (reps.length === 0) return;
      busy = true;
      try {
        const currencies = loadCurrencyStore();
        const rates: Record<string, number | undefined> = {};
        for (const c of Object.values(currencies)) rates[c.code] = c.rateFromUsd;
        rates.MRU = getCurrency(currencies, "MRU")?.rateFromUsd;
        rates.SIFA = getCurrency(currencies, "SIFA")?.rateFromUsd;
        const display = readJson<string>(DISPLAY_KEY, "MRU");
        const convert = makeRepConverter(display === "both" ? ["MRU", "SIFA"] : [display === "SIFA" ? "SIFA" : "MRU"], rates);
        const src: RepStatementSources = {
          accounts: loadDemoAccounts(demoAccounts),
          ledger: applyRepRatePlans(loadLedgerStore(), allReps).ledger,
          clients: loadClientStore(),
          repBook: loadRepBook(),
          invoices: loadInvoices(),
          settlements: loadRepSettlements(),
        };
        const sent = readJson<Record<string, string[]>>(SENT_KEY, {});
        const next = { ...sent };
        for (const rep of reps) {
          const keys = repDebtRowKeys(repCurrentStatement(rep, src, convert).statement);
          const fresh = newDebtRows(keys, sent[rep.id]);
          if (!sent[rep.id] || fresh.length > 0) {
            if (sent[rep.id]) {
              const result = await sendRepPdf(rep.id, buildRepAutoStatementPdf(rep, src, convert, loadStoreItems()), `📄 كشف حسابك - ${fresh.length === 1 ? "عملية جديدة" : `${fresh.length} عمليات جديدة`}`);
              if (!result.ok) continue; // tried again on the next round
            }
            next[rep.id] = keys.slice(0, 300);
          } else if (keys.length !== sent[rep.id]!.length) {
            next[rep.id] = keys.slice(0, 300); // an operation removed: nothing to send
          }
        }
        try {
          window.localStorage.setItem(SENT_KEY, JSON.stringify(next));
        } catch {
          // storage full - sent again next round at worst
        }
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => void tick(), 6000);
    const timer = window.setInterval(() => void tick(), EVERY_MS);
    const onChange = () => window.setTimeout(() => void tick(), 1500);
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    };
  }, []);
  return null;
}
