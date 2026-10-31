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
import { autoCurrencyOf } from "@/lib/partyCurrency";
import { loadPartyCurrencyContext } from "@/lib/partyCurrencyData";
import { repCurrencyOf } from "@/lib/repWallets";
import { buildRepAutoStatementPdf, repChangesCaption, repCurrentStatement, repSentRows, repStatementChanges, type RepStatementSources } from "@/lib/repStatementDoc";
import { tellOwner } from "@/lib/appEvents";
import { listRepresentatives, loadRepresentativeStore, loadRepSettlements } from "@/lib/repStore";
import { loadStoreItems } from "@/lib/storeStore";
import { isRepLinkedToBot, sendRepPdf } from "@/lib/telegram";

const EVERY_MS = 20_000;
/** Per rep, the operations (stamped rows, lib/repStatementDoc.ts repSentRows) of the last statement sent - a phone
 * setting, not business data. */
const SENT_KEY = "starnet.repAutoStatementSent";
/** Per rep, the account reset the last statement was taken after: a new «تصفير» drops rows without deleting them. */
const RESET_KEY = "starnet.repAutoStatementReset";
/** Per rep, how the last automatic statement went (shown on his card). */
export const STATUS_KEY = "starnet.repAutoStatementStatus";
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
 * statement (last 10 operations, what he owes) in the reps bot as soon as an operation on him is added, edited or
 * deleted (his Oct 30 2026 ask).
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
        const pageConvert = makeRepConverter(display === "both" ? ["MRU", "SIFA"] : [display === "SIFA" ? "SIFA" : "MRU"], rates);
        // 💱 each rep's statement in his own one currency (his Oct 31 2026 rule), never the page's toggle
        const currencyCtx = loadPartyCurrencyContext();
        const convertFor = (rep: (typeof reps)[number]) => {
          const c = repCurrencyOf(rep, autoCurrencyOf("rep", rep.id, currencyCtx));
          return c ? makeRepConverter([c], rates) : pageConvert;
        };
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
        const resets = readJson<Record<string, string>>(RESET_KEY, {});
        const status = readJson<Record<string, { at: string; ok: boolean; message?: string }>>(STATUS_KEY, {});
        for (const rep of reps) {
          const convert = convertFor(rep);
          const rows = repSentRows(repCurrentStatement(rep, src, convert).native);
          const stamps = rows.map((r) => r.stamp).slice(0, 600);
          const reset = JSON.stringify(rep.resetFrom ?? null);
          // a new «تصفير»: his old rows leave the statement without being deleted - start again silently
          const resetMoved = sent[rep.id] !== undefined && (resets[rep.id] ?? "null") !== reset;
          resets[rep.id] = reset;
          const changes = resetMoved ? [] : repStatementChanges(rows, sent[rep.id], rep.autoStatementSince);
          if (changes.length > 0) {
            const result = await sendRepPdf(rep.id, buildRepAutoStatementPdf(rep, src, convert, loadStoreItems()), repChangesCaption(changes));
            if (!result.ok) {
              // tried again on the next round - and he's told once why it didn't go
              if (status[rep.id]?.ok !== false) await tellOwner(`⚠️ لم يُرسل كشف ${rep.name} التلقائي: ${result.message}`);
              status[rep.id] = { at: new Date().toISOString(), ok: false, message: result.message };
              continue;
            }
            status[rep.id] = { at: new Date().toISOString(), ok: true };
          }
          // first round, a reset, or nothing he needs to hear about (old keys upgraded to stamps)
          next[rep.id] = stamps;
        }
        try {
          window.localStorage.setItem(RESET_KEY, JSON.stringify(resets));
        } catch {
          // a phone setting only
        }
        try {
          window.localStorage.setItem(STATUS_KEY, JSON.stringify(status));
        } catch {
          // a phone setting only
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
