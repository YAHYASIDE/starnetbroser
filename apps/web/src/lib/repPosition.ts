/**
 * ⚖️ A representative's whole position, computed ONE way for his card on the reps page and for his
 * money bot (his Oct 2026 report «بوت الأموال غير جيد»: the bot said «متعادل ✓» while the card said
 * he owes 46,000 سيفا, and «ديون زبائني» listed debts from before his reset). Everything starts at
 * his reset («من 0 إلى 0»): what he owes us for his devices, his confirmed and expected (D) share,
 * the net, his book with his customers, and the operations behind it. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import {
  bookAfterRepReset,
  buildRepPeriodStatement,
  ledgerAfterRepReset,
  repNetPosition,
  splitRepRecords,
  type RepConvert,
} from "./repAccount";
import {
  listRepClients,
  operationsBalance,
  operationsByDevice,
  replayRepClients,
  repOperations,
  sumBalances,
  type Balances,
  type RepBookEntry,
  type RepClientRow,
  type RepOperation,
} from "./repClients";
import {
  buildRepDailyStatement,
  listRepDeviceCommissions,
  totalRepDeviceCommissions,
  type Representative,
  type RepSettlementList,
} from "./repStore";
import { repWallets } from "./repWallets";

export interface RepPositionInput {
  rep: Representative;
  clients: ClientStore;
  accounts: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  book: RepBookEntry[];
  invoices: Invoice[];
  settlements: RepSettlementList;
  /** Into the currencies the operator shows his reps in (أوقية / سيفا). */
  convert: RepConvert;
}

export interface RepPosition {
  /** yyyy-mm-dd of his reset, when he has one. */
  since?: string;
  /** His current customers with their balance in his book (since the reset). */
  customers: RepClientRow[];
  /** Every operation that is his debt to us (newest first) - since the reset. */
  operations: RepOperation[];
  /** What he owes us for his devices, each currency as recorded. */
  owed: Balances;
  owedByDevice: Map<string, Balances>;
  /** His confirmed share since the reset, and what is left of it after payouts (+ = we owe him). */
  share: Record<string, number>;
  shareBalance: Record<string, number>;
  /** Still-D shipments: how many, and his expected share of them. */
  expectedCount: number;
  expectedShare: Record<string, number>;
  /** ⚖️ owed − share balance, in the display currencies (+ = he owes us). */
  net: Record<string, number>;
  /** 📂 His accounts (repWallets.ts): 🟠 شخصي, 💰 الربح, 🟢 الأوقية - + = له, − = عليه. */
  wallets: RepWalletBalance[];
}

export interface RepWalletBalance {
  /** "SIFA" / "MRU" (another currency when it has records) or "profit". */
  id: string;
  balance: Record<string, number>;
}

export function repPosition(input: RepPositionInput): RepPosition {
  const { rep, clients, accounts, convert } = input;
  const hidden = Boolean(rep.customersHidden);
  const ledger = ledgerAfterRepReset(rep.resetFrom, input.ledgerStore);
  const replays = replayRepClients(clients, accounts, ledger, bookAfterRepReset(rep.resetFrom, input.book));
  const rows = listRepClients(rep.id, clients, accounts, replays);
  const operations = repOperations(rep.id, replays, accounts, ledger, { allHisDevices: hidden });
  const owed = hidden ? operationsBalance(operations) : sumBalances(rows.map((r) => r.owedToUs));

  const active = splitRepRecords(rep, { deviceRows: listRepDeviceCommissions(rep.id, input.ledgerStore), invoices: input.invoices, settlements: input.settlements }, "active");
  const account = buildRepPeriodStatement(buildRepDailyStatement(rep.id, active.deviceRows, active.invoices, active.settlements), {}, convert);
  const totals = totalRepDeviceCommissions(active.deviceRows);
  const wallets = repWallets(buildRepDailyStatement(rep.id, active.deviceRows, active.invoices, active.settlements, operations), convert);
  return {
    ...(rep.resetFrom ? { since: rep.resetFrom.date } : {}),
    customers: rows.filter((r) => r.current),
    operations,
    owed,
    owedByDevice: operationsByDevice(operations),
    share: account.totals.repShare,
    shareBalance: account.closing,
    expectedCount: totals.pendingCount,
    expectedShare: totals.expectedRepShareUsd ? convert(totals.expectedRepShareUsd, "USD") : {},
    net: repNetPosition(owed, account.closing, convert),
    // سيفا وأورانج first, then the profit, then أوقية (the order of «📂 حساباته» in the app).
    wallets: [...wallets.money.filter((w) => w.id === "SIFA"), wallets.profit, ...wallets.money.filter((w) => w.id !== "SIFA")].map((w) => ({ id: w.id, balance: w.balance })),
  };
}

/** The currencies the operator shows his reps in (the reps page's choice, saved on this phone). */
export function loadRepDisplayCodes(): string[] {
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem("starnet.repDisplayCurrency");
    return saved === "SIFA" ? ["SIFA"] : saved === "both" ? ["MRU", "SIFA"] : ["MRU"];
  } catch {
    return ["MRU"];
  }
}

/** 🧾 His whole balance with me in each record's own currency - his three accounts (سيفا وأورانج,
 * أوقية, ربحه) added per currency, never converted. + = له (I owe him), − = عليه. For «حسابي»
 * (his Oct 12 2026 report: «لك عند المندوبين» stayed 0 while he owed - his customers' renewals were
 * left out). Pass a position computed with `keepCurrency`. */
export function repTotalByCurrency(wallets: RepWalletBalance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of wallets) for (const [code, v] of Object.entries(w.balance)) out[code] = (out[code] ?? 0) + v;
  for (const code of Object.keys(out)) if (Math.abs(out[code]!) < 0.005) delete out[code];
  return out;
}
