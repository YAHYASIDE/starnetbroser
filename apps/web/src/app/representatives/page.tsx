"use client";

import { DateInput } from "@/components/DateInput";
import { createContext, CSSProperties, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LedgerEntryEditor } from "@/components/LedgerEntryEditor";
import { getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { PdfButton } from "@/components/PdfButton";
import { RepAppCodePanel } from "@/components/RepAppCodePanel";
import { RepRequestsSection } from "@/components/RepRequestsSection";
import { PrintableDocument } from "@/lib/pdfDocument";
import { loadCashEntries, postRepSettlementToCash, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { StarlinkAccountSummary } from "@starnet/shared";
import {
  buildRepDailyStatement,
  createRepresentative,
  CreateRepresentativeInput,
  deleteRepresentative,
  deleteRepSettlement,
  listRepDeviceCommissions,
  listRepresentatives,
  loadRepresentativeStore,
  loadRepSettlements,
  recordRepSettlement,
  RepDeviceCommissionRow,
  Representative,
  RepresentativeStore,
  RepResetPoint,
  RepSettlement,
  RepSettlementKind,
  RepSettlementList,
  RepStatementDay,
  RepStatementRow,
  saveRepresentativeStore,
  saveRepSettlements,
  setRepresentativeReset,
  totalRepDeviceCommissions,
  updateRepresentative,
  updateRepSettlement,
  REP_COLORS,
  UpdateRepSettlementInput,
} from "@/lib/repStore";
import {
  buildRepPeriodStatement,
  keepCurrency,
  makeRepConverter,
  makeRepResetPoint,
  RepConvert,
  planRepDeletion,
  repPeriod,
  RepPeriod,
  RepPeriodKind,
  RepPeriodStatement,
  repRowDelta,
  repRowKey,
  setShipmentRepShare,
  ShipmentRepPatch,
  splitRepRecords,
} from "@/lib/repAccount";
import { InvoiceList, loadInvoices, saveInvoices } from "@/lib/invoiceStore";
import {
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerByAccount,
  LedgerCurrency,
  LedgerEntry,
  loadLedgerStore,
  saveLedgerStore,
} from "@/lib/ledgerStore";
import { ClientStore, getClient, loadClientStore, saveClientStore } from "@/lib/clientStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { getStoreItem, loadStoreItems, StoreItemRegistry } from "@/lib/storeStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import { ACCOUNTS_CHANGED_EVENT } from "@/lib/repMenuRecords";
import { refreshTelegramReplies } from "@/lib/telegramCommands";
import { listAccounts } from "@/lib/apiClient";
import { partyHue, partyInitials } from "@/lib/partyColor";
import { buildRepSummaryMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { ActionFace, PartySheet } from "@/components/AccountsSection";
import { repDevicesDebt } from "@/lib/repDebts";
import {
  listRepClients,
  loadRepBook,
  replayRepClients,
  repTransferCandidates,
  sumBalances,
  transferClientsToRep,
  type BookLine,
  type ClientReplay,
  type RepBookEntry,
} from "@/lib/repClients";
import { recordRepMoneyHandover } from "@/lib/repClientsSave";
import { confirmClosedMonthChange, ledgerEntryMonthDates, monthLabel, monthRange, recentMonths } from "@/lib/monthClosing";

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Keeps a date's own order inside Arabic text (Unicode isolate). */
function ltrText(value: string): string {
  return `\u2066${value}\u2069`;
}

function nonZero(values: Record<string, number>): [string, number][] {
  return Object.entries(values).filter(([, v]) => Math.abs(v) > EPSILON);
}

/** His running balance in words: "له" = we owe him, "عليه" = he owes us. */
function balanceParts(values: Record<string, number>): { text: string; tone: "due" | "clear" | "zero" }[] {
  const parts = nonZero(values).map(([code, v]) => ({
    text: `${v > 0 ? "له" : "عليه"} ${formatAmount(Math.abs(v))} ${currencyLabel(code)}`,
    tone: (v > 0 ? "due" : "clear") as "due" | "clear",
  }));
  return parts.length > 0 ? parts : [{ text: "صفر - الحساب متوازن", tone: "zero" }];
}

function balanceText(values: Record<string, number>): string {
  return balanceParts(values)
    .map((p) => p.text)
    .join(" · ");
}

/** Everything on this page is shown in the currency the operator picked (أوقية, سيفا or both),
 * converted at each record's own locked rates (repAccount.ts's makeRepConverter). */
type RepDisplay = "MRU" | "SIFA" | "both";

const DISPLAY_KEY = "starnet.repDisplayCurrency";
const DISPLAY_LABELS: Record<RepDisplay, string> = { MRU: "أوقية", SIFA: "سيفا", both: "الاثنين" };

interface Fx {
  convert: RepConvert;
  /** A USD figure (profit/share) in the display currencies, at the shipment's locked rates. */
  usd: (usd: number, entry?: LedgerEntry) => string;
  /** Converted values joined, e.g. "1,000 أوقية · 15,000 سيفا". */
  list: (values: Record<string, number>) => string;
  /** One amount in its own currency, converted. */
  amount: (amount: number, code: string, locked?: Record<string, number>) => string;
}

function makeFx(convert: RepConvert): Fx {
  const list = (values: Record<string, number>) => {
    const parts = Object.entries(values).map(([c, v]) => `${v < -EPSILON ? "-" : ""}${formatAmount(Math.abs(v))} ${currencyLabel(c)}`);
    return parts.length > 0 ? parts.join(" · ") : "0";
  };
  return {
    convert,
    usd: (usd, entry) => list(convert(usd, "USD", entry?.profitCurrencyRates)),
    list,
    amount: (amount, code, locked) => list(convert(amount, code, locked)),
  };
}

const FxContext = createContext<Fx>(makeFx(keepCurrency));

function useFx(): Fx {
  return useContext(FxContext);
}

/** The operator only ever picks "له" or "عليه" (plus whether cash went through الصندوق); the
 * stored kind keeps both facts so the till entry and older records stay exact. */
const SETTLEMENT_LABELS: Record<RepSettlementKind, string> = {
  cashHandover: "➕ له · استلمت منه نقدًا",
  commissionPayout: "➖ عليه · دفعت له نقدًا",
  manualCredit: "➕ له",
  manualDebit: "➖ عليه",
};

function settlementKind(direction: "credit" | "debit", cash: boolean): RepSettlementKind {
  if (direction === "credit") return cash ? "cashHandover" : "manualCredit";
  return cash ? "commissionPayout" : "manualDebit";
}

const PERIOD_LABELS: Record<RepPeriodKind, string> = {
  day: "اليوم",
  month: "الشهر",
  custom: "من - إلى",
  all: "الكل",
};

export default function RepresentativesPage() {
  const [representativeStore, setRepresentativeStore] = useState<RepresentativeStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [settlements, setSettlements] = useState<RepSettlementList>([]);
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [repBook, setRepBook] = useState<RepBookEntry[]>([]);
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  // Opened from "إقفال الشهر" (reports): ?rep=<id>&month=yyyy-mm opens that rep's statement for
  // that month, ready for its PDF.
  const [focus, setFocus] = useState<{ repId: string; month: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repId = params.get("rep");
    const month = params.get("month");
    if (repId && month && /^\d{4}-\d{2}$/.test(month)) setFocus({ repId, month });
  }, []);

  /** Everything this page shows, read again from the phone - after a request is approved, a
   * record from the bot, coming back to the app, or 🔄 تحديث. */
  const reloadAll = useCallback(() => {
    setRepresentativeStore(loadRepresentativeStore());
    setInvoices(loadInvoices());
    setSettlements(loadRepSettlements());
    setStoreItems(loadStoreItems());
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setRepBook(loadRepBook());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    reloadAll();
    // A rep's ✏️ / 📝 / 💵 from the bot changed something meanwhile, or the app came back.
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadAll();
    };
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, reloadAll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, reloadAll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadAll]);

  const [refreshing, setRefreshing] = useState(false);
  async function refreshNow() {
    setRefreshing(true);
    reloadAll();
    // The reps' bots answer from a prepared copy - hand them the new figures now too.
    await refreshTelegramReplies().catch(() => {});
    setRefreshing(false);
  }

  const representatives = useMemo(() => listRepresentatives(representativeStore), [representativeStore]);
  // His own customers (repClients.ts): what they owe him, and what he owes us for them.
  const replays = useMemo(() => replayRepClients(clientStore, accounts, ledgerStore, repBook), [clientStore, accounts, ledgerStore, repBook]);

  // Display currency (أوقية / سيفا / both) - a per-phone view setting, not business data.
  const [display, setDisplay] = useState<RepDisplay>("MRU");
  const [rates, setRates] = useState<Record<string, number | undefined>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DISPLAY_KEY);
      if (saved === "MRU" || saved === "SIFA" || saved === "both") setDisplay(saved);
    } catch {
      // storage unavailable - keep أوقية
    }
    const store = loadCurrencyStore();
    const next: Record<string, number | undefined> = {};
    for (const c of Object.values(store)) next[c.code] = c.rateFromUsd;
    next.MRU = getCurrency(store, "MRU")?.rateFromUsd;
    next.SIFA = getCurrency(store, "SIFA")?.rateFromUsd;
    setRates(next);
  }, []);
  function chooseDisplay(next: RepDisplay) {
    setDisplay(next);
    try {
      window.localStorage.setItem(DISPLAY_KEY, next);
    } catch {
      // ignore
    }
  }
  const fx = useMemo(() => makeFx(makeRepConverter(display === "both" ? ["MRU", "SIFA"] : [display], rates)), [display, rates]);

  /** Today's rates, locked onto a new settlement so it always converts the same way. */
  function lockedRates(currencyCode: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const code of ["MRU", "SIFA", currencyCode]) {
      const rate = code === "USD" ? 1 : rates[code];
      if (rate) result[code] = rate;
    }
    return result;
  }

  const overview = useMemo(() => {
    const owed: Record<string, number> = {};
    const repShare: Record<string, number> = {};
    const ourShare: Record<string, number> = {};
    for (const rep of representatives) {
      const active = splitRepRecords(rep, { deviceRows: listRepDeviceCommissions(rep.id, ledgerStore), invoices, settlements }, "active");
      const st = buildRepPeriodStatement(buildRepDailyStatement(rep.id, active.deviceRows, active.invoices, active.settlements), {}, fx.convert);
      for (const [c, v] of Object.entries(st.totals.repShare)) repShare[c] = (repShare[c] ?? 0) + v;
      for (const [c, v] of Object.entries(st.totals.ourShare)) ourShare[c] = (ourShare[c] ?? 0) + v;
      for (const [c, v] of Object.entries(st.closing)) if (v > EPSILON) owed[c] = (owed[c] ?? 0) + v;
    }
    return { owed, repShare, ourShare };
  }, [representatives, ledgerStore, invoices, settlements, fx]);

  function saveReps(next: RepresentativeStore) {
    setRepresentativeStore(next);
    saveRepresentativeStore(next);
  }

  function saveSettlementList(next: RepSettlementList) {
    setSettlements(next);
    saveRepSettlements(next);
  }

  function handleCreate(input: CreateRepresentativeInput) {
    saveReps(createRepresentative(representativeStore, input).store);
    setShowAddForm(false);
  }

  function handleUpdate(id: string, input: CreateRepresentativeInput) {
    saveReps(updateRepresentative(representativeStore, id, input));
    setEditingRepId(null);
  }

  function handleSettlement(representativeId: string, input: UpdateRepSettlementInput): string | null {
    if (!confirmClosedMonthChange([input.date])) return "لم تُحفظ العملية (الشهر مُقفل)";
    if (input.kind === "cashHandover") {
      // First what he owes us for his own customers' devices, then (the rest) a cash handover.
      const handover = recordRepMoneyHandover(representativeId, { ...input, rates: lockedRates(input.currencyCode) }, accounts);
      if (!handover.ok) return handover.message;
      reloadAll();
      return null;
    }
    const result = recordRepSettlement(settlements, { representativeId, ...input, rates: lockedRates(input.currencyCode) });
    if (!result.ok) return result.message;
    saveSettlementList(result.settlements);
    saveCashEntries(postRepSettlementToCash(loadCashEntries(), result.settlement, representativeStore[representativeId]?.name ?? ""));
    return null;
  }

  // An edited settlement re-posts its own cash entry (removed + posted again from the new values).
  function handleUpdateSettlement(settlementId: string, input: UpdateRepSettlementInput): string | null {
    const current = settlements.find((s) => s.id === settlementId);
    if (!confirmClosedMonthChange([current?.date, input.date])) return "لم يُحفظ التعديل (الشهر مُقفل)";
    const result = updateRepSettlement(settlements, settlementId, { ...input, rates: lockedRates(input.currencyCode) });
    if (!result.ok) return result.message;
    saveSettlementList(result.settlements);
    const repName = representativeStore[result.settlement.representativeId]?.name ?? "";
    saveCashEntries(postRepSettlementToCash(removeLinkedCashEntries(loadCashEntries(), settlementId), result.settlement, repName));
    return null;
  }

  function handleDeleteSettlement(settlementId: string) {
    if (!confirmClosedMonthChange([settlements.find((s) => s.id === settlementId)?.date])) return;
    saveSettlementList(deleteRepSettlement(settlements, settlementId));
    saveCashEntries(removeLinkedCashEntries(loadCashEntries(), settlementId));
  }

  function handleShipmentShare(accountId: string, entryId: string, patch: ShipmentRepPatch): string | null {
    const entry = ledgerStore[accountId]?.find((e) => e.id === entryId);
    if (entry && !confirmClosedMonthChange(ledgerEntryMonthDates(entry))) return "لم يُحفظ التعديل (الشهر مُقفل)";
    const result = setShipmentRepShare(ledgerStore, accountId, entryId, patch);
    if (!result.ok) return result.message;
    setLedgerStore(result.ledgerStore);
    saveLedgerStore(result.ledgerStore);
    return null;
  }

  // "نقل ديون زبائنه عليه": each customer (with all his devices) becomes the rep's, his balance too.
  function handleTransferClients(repId: string, clientIds: string[]) {
    const next = transferClientsToRep(clientStore, repId, clientIds, new Date().toISOString());
    saveClientStore(next);
    setClientStore(next);
    const ids = new Set(clientIds);
    const nextAccounts = accounts.map((a) => (a.clientId && ids.has(a.clientId) && !a.deletedAt ? { ...a, representativeId: repId } : a));
    setAccounts(nextAccounts);
    if (isDemoMode()) saveDemoAccounts(nextAccounts);
    void refreshTelegramReplies().catch(() => {});
  }

  function handleReset(repId: string, resetFrom: RepResetPoint | undefined) {
    saveReps(setRepresentativeReset(representativeStore, repId, resetFrom));
  }

  // Deleting a rep removes his settlements (and their cash entries) and his share of every
  // shipment/sale; his devices stay, without a representative.
  function handleDeleteRep(repId: string) {
    const plan = planRepDeletion(repId, { settlements, ledgerStore, invoices, accounts });
    saveSettlementList(plan.settlements);
    let cash = loadCashEntries();
    for (const id of plan.removedSettlementIds) cash = removeLinkedCashEntries(cash, id);
    saveCashEntries(cash);
    setLedgerStore(plan.ledgerStore);
    saveLedgerStore(plan.ledgerStore);
    setInvoices(plan.invoices);
    saveInvoices(plan.invoices);
    setAccounts(plan.accounts);
    if (isDemoMode()) saveDemoAccounts(plan.accounts);
    saveReps(deleteRepresentative(representativeStore, repId));
  }

  return (
    <FxContext.Provider value={fx}>
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المندوبون</h1>
        <button type="button" className="btn-link rep-refresh" onClick={() => void refreshNow()} disabled={refreshing}>
          {refreshing ? "⏳" : "🔄 تحديث"}
        </button>
      </div>

      <RepRequestsSection
        representatives={representatives}
        accounts={accounts}
        clientStore={clientStore}
        onChanged={() => {
          reloadAll();
          // The rep's bot shows his new balance / debts right away, not a minute later.
          void refreshTelegramReplies().catch(() => {});
        }}
      />

      <section className="section">
        <div className="party-section party-section-reps">
          <div className="rep-display" role="radiogroup" aria-label="عرض المبالغ بـ">
            <span>عرض المبالغ بـ</span>
            {(["MRU", "SIFA", "both"] as RepDisplay[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={display === d}
                className={`rep-display-option${display === d ? " rep-display-option-active" : ""}`}
                onClick={() => chooseDisplay(d)}
              >
                {DISPLAY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="rep-overview">
            <div className="rep-overview-item">
              <span>حصة المندوبين من أرباح الأجهزة</span>
              <strong>{fx.list(overview.repShare)}</strong>
            </div>
            <div className="rep-overview-item rep-overview-ours">
              <span>حصتي من أرباح أجهزتهم</span>
              <strong>{fx.list(overview.ourShare)}</strong>
            </div>
            <div className="rep-overview-item rep-overview-owed">
              <span>مستحق للمندوبين الآن</span>
              <strong>{fx.list(nonZero(overview.owed).length ? overview.owed : {})}</strong>
            </div>
          </div>

          <div className="party-toolbar">
            <span className="settings-hint">{representatives.length} مندوب</span>
            <button type="button" className="btn-icon" onClick={() => setShowAddForm((v) => !v)}>
              {showAddForm ? "إلغاء" : "+ إضافة مندوب"}
            </button>
          </div>

          {showAddForm && <RepresentativeForm onSubmit={handleCreate} onCancel={() => setShowAddForm(false)} />}

          {representatives.length === 0 && !showAddForm ? (
            <p className="empty-state">لا يوجد مندوبون بعد.</p>
          ) : (
            <ul className="party-card-list">
              {representatives.map((rep) =>
                editingRepId === rep.id ? (
                  <li key={rep.id} className="party-card">
                    <RepresentativeForm
                      initial={rep}
                      onSubmit={(input) => handleUpdate(rep.id, input)}
                      onCancel={() => setEditingRepId(null)}
                    />
                  </li>
                ) : (
                  <RepCard
                    key={rep.id}
                    representative={rep}
                    representatives={representatives}
                    invoices={invoices}
                    settlements={settlements}
                    ledgerStore={ledgerStore}
                    accounts={accounts}
                    clientStore={clientStore}
                    replays={replays}
                    onTransferClients={(ids) => handleTransferClients(rep.id, ids)}
                    storeItems={storeItems}
                    onEdit={() => setEditingRepId(rep.id)}
                    onSettle={(input) => handleSettlement(rep.id, input)}
                    onUpdateSettlement={handleUpdateSettlement}
                    onDeleteSettlement={handleDeleteSettlement}
                    onShipmentShare={handleShipmentShare}
                    onReset={(resetFrom) => handleReset(rep.id, resetFrom)}
                    onDelete={() => handleDeleteRep(rep.id)}
                    onLedgerChange={setLedgerStore}
                    focusMonth={focus?.repId === rep.id ? focus.month : undefined}
                  />
                ),
              )}
            </ul>
          )}
        </div>
      </section>
    </main>
    </FxContext.Provider>
  );
}

interface RepCardProps {
  representative: Representative;
  representatives: Representative[];
  invoices: InvoiceList;
  settlements: RepSettlementList;
  ledgerStore: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  replays: Map<string, ClientReplay>;
  onTransferClients: (clientIds: string[]) => void;
  storeItems: StoreItemRegistry;
  onEdit: () => void;
  onSettle: (input: UpdateRepSettlementInput) => string | null;
  onUpdateSettlement: (settlementId: string, input: UpdateRepSettlementInput) => string | null;
  onDeleteSettlement: (settlementId: string) => void;
  onShipmentShare: (accountId: string, entryId: string, patch: ShipmentRepPatch) => string | null;
  onReset: (resetFrom: RepResetPoint | undefined) => void;
  onDelete: () => void;
  onLedgerChange: (next: LedgerByAccount) => void;
  /** Open the statement on this month (yyyy-mm) and scroll to this card. */
  focusMonth?: string;
}

type RepPanel = "statement" | "devices" | "clients" | null;
type RepSheet =
  | { kind: "settle" | "whatsapp" | "manage" | "reset" | "delete" | "appCode" }
  | { kind: "settlement"; settlement: RepSettlement }
  | { kind: "shipment"; row: RepDeviceCommissionRow }
  | { kind: "repClient"; clientId: string }
  | { kind: "transfer" }
  | null;

function RepCard({
  representative: rep,
  representatives,
  invoices,
  settlements,
  ledgerStore,
  accounts,
  clientStore,
  replays,
  onTransferClients,
  storeItems,
  onEdit,
  onSettle,
  onUpdateSettlement,
  onDeleteSettlement,
  onShipmentShare,
  onReset,
  onDelete,
  onLedgerChange,
  focusMonth,
}: RepCardProps) {
  const [panel, setPanel] = useState<RepPanel>(null);
  const [sheet, setSheet] = useState<RepSheet>(null);
  const [periodKind, setPeriodKind] = useState<RepPeriodKind>("all");
  const [customPeriod, setCustomPeriod] = useState<RepPeriod>({ from: "", to: "" });
  const thisMonth = todayDateInputValue().slice(0, 7);
  const [periodMonth, setPeriodMonth] = useState(thisMonth);
  const monthChoices = useMemo(() => {
    const recent = recentMonths(todayDateInputValue(), 12);
    return recent.includes(periodMonth) ? recent : [periodMonth, ...recent];
  }, [periodMonth]);
  const cardRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!focusMonth) return;
    setPanel("statement");
    setPeriodKind("month");
    setPeriodMonth(focusMonth);
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [focusMonth]);
  const [showArchive, setShowArchive] = useState(false);

  const fx = useFx();
  const [editingShipment, setEditingShipment] = useState<RepDeviceCommissionRow | null>(null);
  const allDeviceRows = useMemo(() => listRepDeviceCommissions(rep.id, ledgerStore), [rep.id, ledgerStore]);
  // Only records after his reset (تصفير) count; older ones are the archive.
  const active = useMemo(
    () => splitRepRecords(rep, { deviceRows: allDeviceRows, invoices, settlements }, "active"),
    [rep, allDeviceRows, invoices, settlements],
  );
  const deviceRows = active.deviceRows;
  const deviceTotals = useMemo(() => totalRepDeviceCommissions(deviceRows), [deviceRows]);
  const devices = accounts.filter((a) => a.representativeId === rep.id);
  // His own customers (repClients.ts) - what they owe him, and what he owes us for them.
  const repClients = useMemo(() => listRepClients(rep.id, clientStore, accounts, replays), [rep.id, clientStore, accounts, replays]);
  const owedToUsForClients = useMemo(() => sumBalances(repClients.map((r) => r.owedToUs)), [repClients]);
  const clientsOweHim = useMemo(() => sumBalances(repClients.map((r) => r.book)), [repClients]);
  const transferCandidates = useMemo(
    () => repTransferCandidates(rep.id, clientStore, accounts, ledgerStore),
    [rep.id, clientStore, accounts, ledgerStore],
  );
  // What the customers of his devices still owe US - only those not yet his own customers.
  const devicesDebt = useMemo(
    () => repDevicesDebt(rep.id, accounts.filter((a) => !a.clientId || !replays.has(a.clientId)), ledgerStore),
    [rep.id, accounts, ledgerStore, replays],
  );
  const owedByDevice = new Map(devicesDebt.rows.map((row) => [row.accountId, row.owed]));

  const allDays = useMemo(() => {
    if (panel !== "statement" && sheet?.kind !== "reset") return [];
    const source = showArchive && rep.resetFrom ? splitRepRecords(rep, { deviceRows: allDeviceRows, invoices, settlements }, "archive") : active;
    return buildRepDailyStatement(rep.id, source.deviceRows, source.invoices, source.settlements);
  }, [panel, sheet, showArchive, rep, allDeviceRows, invoices, settlements, active]);
  const period = periodKind === "month" ? monthRange(periodMonth) : repPeriod(periodKind, todayDateInputValue(), customPeriod);
  const statement = useMemo(() => buildRepPeriodStatement(allDays, period, fx.convert), [allDays, period.from, period.to, fx]); // eslint-disable-line react-hooks/exhaustive-deps
  // His whole current account (since the reset), in the display currency: profit, his share, and
  // the running balance - every له/عليه entry and payout counted against his share.
  const account = useMemo(
    () => buildRepPeriodStatement(buildRepDailyStatement(rep.id, deviceRows, active.invoices, active.settlements), {}, fx.convert),
    [rep.id, deviceRows, active, fx],
  );
  const netBalance = account.closing;
  const balanceSign = Object.values(netBalance).find((v) => Math.abs(v) > EPSILON) ?? 0;
  const canWhatsApp = buildWhatsAppLink(rep.phone) !== null;
  const deletion = useMemo(
    () => (sheet?.kind === "delete" ? planRepDeletion(rep.id, { settlements, ledgerStore, invoices, accounts }).counts : null),
    [sheet, rep.id, settlements, ledgerStore, invoices, accounts],
  );

  function openWhatsApp(message?: string) {
    const link = buildWhatsAppLink(rep.phone, message);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setSheet(null);
  }

  function accountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name ?? "جهاز محذوف";
  }

  function clientNameFor(accountId: string): string | undefined {
    return getClient(clientStore, accounts.find((a) => a.id === accountId)?.clientId)?.name;
  }

  function openRow(row: RepStatementRow) {
    if (row.type === "device") setSheet({ kind: "shipment", row: row.row });
    else if (row.type === "settlement") setSheet({ kind: "settlement", settlement: row.settlement });
  }

  const periodLabel =
    periodKind === "all"
      ? "كل العمليات"
      : periodKind === "day"
        ? `يوم ${ltrText(period.from ?? "")}`
        : periodKind === "month"
          ? `شهر ${monthLabel(periodMonth)}`
          : `من ${period.from ? ltrText(period.from) : "البداية"} إلى ${period.to ? ltrText(period.to) : "اليوم"}`;

  return (
    <li ref={cardRef} className="party-card rep-card" style={{ "--party-hue": partyHue(rep.id) } as CSSProperties}>
      <div className="party-card-head">
        <span className="party-avatar" aria-hidden="true">{partyInitials(rep.name)}</span>
        <div className="party-card-title">
          <strong>🤝 {rep.name}</strong>
          <span className="party-card-sub">
            <bdi dir="ltr">{rep.phone || "بدون هاتف"}</bdi>
            <span className="party-mini-chip">📡 {devices.length}</span>
          </span>
        </div>
        <span className="rep-percent" title={rep.sharesLosses ? "يتحمّل نسبته من الخسارة" : undefined}>
          {rep.commissionPercent}%{rep.sharesLosses ? " ⚖️" : ""}
        </span>
      </div>

      <div className="party-stats rep-stats">
        <div className="party-stat">
          <span>الربح</span>
          <StatValues values={account.totals.deviceProfit} />
        </div>
        <div className="party-stat party-stat-adjusted">
          <span>حصته</span>
          <StatValues values={account.totals.repShare} />
        </div>
        <div className={`party-stat ${balanceSign > EPSILON ? "party-stat-due" : balanceSign < -EPSILON ? "party-stat-clear" : ""}`}>
          <span>{balanceSign < -EPSILON ? "عليه" : "مستحق له"}</span>
          <StatValues values={netBalance} absolute />
        </div>
      </div>

      {repClients.length > 0 && (
        <div className={`rep-devices-debt${Object.values(owedToUsForClients).some((v) => v > EPSILON) ? " rep-devices-debt-due" : ""}`}>
          <span>🧾 عليه لك عن زبائنه ({repClients.filter((r) => r.current).length})</span>
          {Object.keys(owedToUsForClients).length === 0 ? <strong>لا شيء ✓</strong> : <StatValues values={owedToUsForClients} />}
        </div>
      )}
      {(repClients.length === 0 || devicesDebt.rows.length > 0) && (
        <div className={`rep-devices-debt${devicesDebt.rows.length > 0 ? " rep-devices-debt-due" : ""}`}>
          <span>💳 ديون أجهزته على الزبائن{devicesDebt.rows.length > 0 ? ` (${devicesDebt.rows.length} جهاز)` : ""}</span>
          {devicesDebt.rows.length === 0 ? <strong>لا ديون ✓</strong> : <StatValues values={devicesDebt.totalByCurrency} />}
        </div>
      )}

      {(rep.resetFrom || deviceTotals.pendingCount > 0) && (
        <div className="party-chips">
          {rep.resetFrom && (
            <span className="party-chip rep-chip-reset">
              🔄 حساب جديد منذ <bdi dir="ltr">{rep.resetFrom.date}</bdi>
            </span>
          )}
          {deviceTotals.pendingCount > 0 && (
            <span className="party-chip">
              ⏳ {deviceTotals.pendingCount} بانتظار D
              {deviceTotals.expectedRepShareUsd > 0.0001 && <> · حصته المتوقعة {fx.usd(deviceTotals.expectedRepShareUsd)}</>}
            </span>
          )}
        </div>
      )}

      <div className="party-actions">
        <button
          type="button"
          className={`party-action${panel === "statement" ? " party-action-active" : ""}`}
          onClick={() => setPanel((p) => (p === "statement" ? null : "statement"))}
        >
          <ActionFace icon="📄" label="الكشف" />
        </button>
        <button type="button" className="party-action party-action-balance" onClick={() => setSheet({ kind: "settle" })}>
          <ActionFace icon="💵" label="تسوية" />
        </button>
        {canWhatsApp && (
          <button type="button" className="party-action party-action-whatsapp" onClick={() => setSheet({ kind: "whatsapp" })}>
            <ActionFace icon="💬" label="واتساب" />
          </button>
        )}
        <button
          type="button"
          className={`party-action${panel === "devices" ? " party-action-active" : ""}`}
          onClick={() => setPanel((p) => (p === "devices" ? null : "devices"))}
        >
          <ActionFace icon="📡" label="الأجهزة" count={devices.length} />
        </button>
        <button
          type="button"
          className={`party-action${panel === "clients" ? " party-action-active" : ""}`}
          onClick={() => setPanel((p) => (p === "clients" ? null : "clients"))}
        >
          <ActionFace icon="👥" label="زبائنه" count={repClients.filter((r) => r.current).length} />
        </button>
        <button type="button" className="party-action" onClick={() => setSheet({ kind: "manage" })}>
          <ActionFace icon="⚙️" label="إدارة" />
        </button>
      </div>

      {panel === "statement" && (
        <div className="party-panel rep-statement">
          <div className="rep-period-chips" role="tablist" aria-label="فترة الكشف">
            {(["day", "month", "custom", "all"] as RepPeriodKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={periodKind === kind}
                className={`rep-period-chip${periodKind === kind ? " rep-period-chip-active" : ""}`}
                onClick={() => setPeriodKind(kind)}
              >
                {PERIOD_LABELS[kind]}
              </button>
            ))}
          </div>
          {periodKind === "month" && (
            <select className="month-closing-select rep-period-month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} aria-label="الشهر">
              {monthChoices.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
          {periodKind === "custom" && (
            <div className="rep-period-range">
              <label>
                <span>من</span>
                <DateInput  value={customPeriod.from ?? ""} onChange={(e) => setCustomPeriod((p) => ({ ...p, from: e.target.value }))} />
              </label>
              <label>
                <span>إلى</span>
                <DateInput  value={customPeriod.to ?? ""} onChange={(e) => setCustomPeriod((p) => ({ ...p, to: e.target.value }))} />
              </label>
            </div>
          )}
          {rep.resetFrom && (
            <label className="ledger-d-toggle rep-archive-toggle">
              <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
              <span>
                عرض الأرشيف (العمليات قبل التصفير <bdi dir="ltr">{rep.resetFrom.date}</bdi>)
              </span>
            </label>
          )}

          <RepStatementSummary statement={statement} period={period} periodLabel={periodLabel} archive={showArchive && !!rep.resetFrom} />

          <div className="party-panel-tools">
            <PdfButton
              className="party-action party-action-pdf"
              label="🖨️ تصدير الكشف PDF"
              build={() =>
                buildRepStatementPdf(rep, statement, periodLabel + (showArchive && rep.resetFrom ? " (أرشيف)" : ""), accountName, clientNameFor, storeItems, fx)
              }
            />
          </div>
          {statement.days.length === 0 ? (
            <p className="party-empty">
              {allDays.length === 0
                ? "لا توجد عمليات بعد. تُحتسب حصته من كل عملية جديدة على أجهزته بعد تسديد تكلفة Starlink."
                : "لا توجد عمليات في هذه الفترة."}
            </p>
          ) : (
            <div className="rep-days">
              {statement.days.map((day) => (
                <div key={day.date} className="rep-day">
                  <div className="rep-day-head">
                    <strong dir="ltr">📅 {day.date}</strong>
                    {(Math.abs(day.repShareUsd) > EPSILON || Math.abs(day.ourShareUsd) > EPSILON) && (
                      <div className="rep-day-split">
                        <span className="rep-split-rep">حصته {fx.list(dayShares(day, "rep", fx.convert))}</span>
                        <span className="rep-split-ours">حصتي {fx.list(dayShares(day, "ours", fx.convert))}</span>
                      </div>
                    )}
                  </div>
                  <ul className="party-statement">
                    {day.rows.map((row) => (
                      <RepStatementLine
                        key={repRowKey(row)}
                        row={row}
                        balanceAfter={statement.balanceAfter[repRowKey(row)]}
                        accountName={accountName}
                        clientNameFor={clientNameFor}
                        storeItems={storeItems}
                        onOpen={row.type === "invoice" ? undefined : () => openRow(row)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === "clients" && (
        <div className="party-panel rep-clients">
          {transferCandidates.length > 0 && (
            <button type="button" className="btn-secondary rep-transfer-btn" onClick={() => setSheet({ kind: "transfer" })}>
              🔁 نقل ديون زبائنه عليه ({transferCandidates.length})
            </button>
          )}
          {repClients.length === 0 ? (
            <p className="party-empty">
              لا زبائن له بعد في الدفتر.{transferCandidates.length > 0 ? " «نقل ديون زبائنه عليه» يجعل زبائن أجهزته زبائنه، وديونهم عليه." : ""}
            </p>
          ) : (
            <>
              <div className="rep-clients-total">
                <span>زبائنه عليهم له</span>
                <StatValues values={clientsOweHim} />
              </div>
              <ul className="party-devices">
                {repClients.map((row) => (
                  <li key={row.clientId}>
                    <button type="button" className="party-device rep-client-row" onClick={() => setSheet({ kind: "repClient", clientId: row.clientId })}>
                      <div className="party-device-top">
                        <strong>
                          {row.name}
                          {!row.current && <span className="party-mini-chip rep-client-former">سابق</span>}
                        </strong>
                        <span className="party-device-date">📡 {row.deviceCount}</span>
                      </div>
                      <span className="rep-client-balances">
                        <span>في دفتره: {bookText(row.book)}</span>
                        {Object.keys(row.owedToUs).length > 0 && <span className="rep-client-ours">عليه لك: {bookText(row.owedToUs)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {panel === "devices" && (
        <div className="party-panel">
          {devices.length === 0 ? (
            <p className="party-empty">لا يوجد جهاز مرتبط - يُربط من نافذة تعديل الجهاز في الصفحة الرئيسية.</p>
          ) : (
            <ul className="party-devices">
              {devices.map((device) => (
                <li key={device.id} className="party-device">
                  <div className="party-device-top">
                    <strong>{device.name}</strong>
                    <span className="party-device-date" dir="ltr">📅 {device.rechargeDate || "—"}</span>
                  </div>
                  <span className="party-statement-note">{getClient(clientStore, device.clientId)?.name ?? "بدون زبون"}</span>
                  {owedByDevice.has(device.id) && (
                    <span className="rep-device-owed">
                      عليه{" "}
                      {Object.entries(owedByDevice.get(device.id)!).map(([code, v], i) => (
                        <span key={code}>
                          {i > 0 && " · "}
                          <bdi dir="ltr">{formatAmount(v)}</bdi> {currencyLabel(code)}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sheet?.kind === "transfer" && (
        <PartySheet title={`نقل ديون زبائنه عليه - ${rep.name}`} onClose={() => setSheet(null)}>
          <RepTransferForm
            candidates={transferCandidates}
            onConfirm={(ids) => {
              onTransferClients(ids);
              setSheet(null);
              setPanel("clients");
            }}
          />
        </PartySheet>
      )}

      {sheet?.kind === "repClient" && (
        <PartySheet title={`دفتر ${rep.name} - ${getClient(clientStore, sheet.clientId)?.name ?? "زبون"}`} onClose={() => setSheet(null)}>
          <RepClientBook
            lines={(replays.get(sheet.clientId)?.bookLines ?? []).filter((l) => l.repId === rep.id)}
            balance={replays.get(sheet.clientId)?.book[rep.id] ?? {}}
            owedToUs={replays.get(sheet.clientId)?.owedToUs[rep.id] ?? {}}
            accountName={accountName}
          />
        </PartySheet>
      )}

      {sheet?.kind === "settle" && (
        <PartySheet title={`تسوية - ${rep.name}`} onClose={() => setSheet(null)}>
          <SettlementForm
            defaultCurrency={Object.keys(fx.convert(1, "USD"))[0] ?? "MRU"}
            onCancel={() => setSheet(null)}
            onSubmit={(input) => {
              const error = onSettle(input);
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {sheet?.kind === "settlement" && (
        <PartySheet title={`تعديل عملية - ${rep.name}`} onClose={() => setSheet(null)}>
          <SettlementForm
            initial={sheet.settlement}
            submitLabel="حفظ التعديل"
            onCancel={() => setSheet(null)}
            onDelete={() => {
              if (!window.confirm("حذف هذه العملية؟ يُحذف قيدها في الصندوق أيضًا.")) return;
              onDeleteSettlement(sheet.settlement.id);
              setSheet(null);
            }}
            onSubmit={(input) => {
              const error = onUpdateSettlement(sheet.settlement.id, input);
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {sheet?.kind === "shipment" && (
        <PartySheet title="حصة المندوب من الشحنة" onClose={() => setSheet(null)}>
          <ShipmentShareForm
            row={sheet.row}
            deviceLabel={`${accountName(sheet.row.accountId)}${clientNameFor(sheet.row.accountId) ? ` · ${clientNameFor(sheet.row.accountId)}` : ""}`}
            currentRepId={rep.id}
            representatives={representatives}
            onEditShipment={() => {
              setEditingShipment(sheet.row);
              setSheet(null);
            }}
            onCancel={() => setSheet(null)}
            onSubmit={(patch) => {
              const error = onShipmentShare(sheet.row.accountId, sheet.row.entry.id, patch);
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {sheet?.kind === "appCode" && (
        <PartySheet title={`تطبيق المندوب - ${rep.name}`} onClose={() => setSheet(null)}>
          <RepAppCodePanel rep={rep} />
        </PartySheet>
      )}

      {sheet?.kind === "manage" && (
        <PartySheet title={`إدارة - ${rep.name}`} onClose={() => setSheet(null)}>
          <div className="party-sheet-options">
            <button type="button" className="party-sheet-option" onClick={() => { setSheet(null); onEdit(); }}>
              <span aria-hidden="true">✎</span>
              <span>
                <strong>تعديل البيانات</strong>
                <small>الاسم والهاتف والنسبة وتحمّل الخسارة</small>
              </span>
            </button>
            <button type="button" className="party-sheet-option" onClick={() => setSheet({ kind: "appCode" })}>
              <span aria-hidden="true">📱</span>
              <span>
                <strong>رمز تطبيق المندوب</strong>
                <small>يضيف أجهزته ويسجّل دخولها من هاتفه، وتصلك جاهزة</small>
              </span>
            </button>
            <button type="button" className="party-sheet-option" onClick={() => setSheet({ kind: "reset" })}>
              <span aria-hidden="true">🔄</span>
              <span>
                <strong>{rep.resetFrom ? "التصفير وإلغاؤه" : "تصفير الحساب"}</strong>
                <small>بداية جديدة من تاريخ - العمليات القديمة تبقى في الأرشيف</small>
              </span>
            </button>
            <button type="button" className="party-sheet-option party-sheet-option-danger" onClick={() => setSheet({ kind: "delete" })}>
              <span aria-hidden="true">🗑</span>
              <span>
                <strong>حذف المندوب</strong>
                <small>يحذف عملياته، وتبقى أجهزته بدون مندوب</small>
              </span>
            </button>
          </div>
        </PartySheet>
      )}

      {sheet?.kind === "reset" && (
        <PartySheet title={`تصفير الحساب - ${rep.name}`} onClose={() => setSheet(null)}>
          <RepResetForm
            rep={rep}
            balance={balanceText(netBalance)}
            onCancel={() => setSheet(null)}
            onReset={(point) => {
              onReset(point);
              setShowArchive(false);
              setSheet(null);
            }}
          />
        </PartySheet>
      )}

      {sheet?.kind === "delete" && deletion && (
        <PartySheet title={`حذف المندوب - ${rep.name}`} onClose={() => setSheet(null)}>
          <div className="rep-delete">
            {deletion.devices > 0 && (
              <p className="account-card-alert">
                ⚠️ عليه {deletion.devices} جهاز - ستبقى الأجهزة كما هي لكن بدون مندوب.
              </p>
            )}
            <ul className="rep-delete-list">
              <li>🗑 تُحذف {deletion.settlements} تسوية (ويُحذف قيدها في الصندوق)</li>
              <li>📡 تُلغى حصته من {deletion.shipments} شحنة - يصبح ربحها كله لك</li>
              {deletion.invoices > 0 && <li>🧾 تُلغى عمولته من {deletion.invoices} فاتورة متجر</li>}
              <li>💰 رصيده الحالي: {balanceText(netBalance)}</li>
            </ul>
            <p className="settings-hint">لا يمكن التراجع إلا من النسخة الاحتياطية.</p>
            <div className="settings-actions">
              <button
                type="button"
                className="dialog-danger"
                onClick={() => {
                  if (!window.confirm(`تأكيد حذف المندوب "${rep.name}" وكل عملياته؟`)) return;
                  setSheet(null);
                  onDelete();
                }}
              >
                حذف المندوب نهائيًا
              </button>
              <button type="button" className="text-action" onClick={() => setSheet(null)}>
                إلغاء
              </button>
            </div>
          </div>
        </PartySheet>
      )}

      {sheet?.kind === "whatsapp" && (
        <PartySheet title={`واتساب - ${rep.name}`} onClose={() => setSheet(null)}>
          <div className="party-sheet-options">
            <button type="button" className="party-sheet-option" onClick={() => openWhatsApp()}>
              <span aria-hidden="true">💬</span>
              <span>
                <strong>مراسلة فقط</strong>
                <small>فتح المحادثة بدون رسالة جاهزة</small>
              </span>
            </button>
            <button
              type="button"
              className="party-sheet-option"
              onClick={() =>
                openWhatsApp(
                  buildRepSummaryMessage(rep.name, {
                    profit: fx.list(account.totals.deviceProfit),
                    share: fx.list(account.totals.repShare),
                    balance: balanceText(netBalance),
                    pendingCount: deviceTotals.pendingCount,
                  }),
                )
              }
            >
              <span aria-hidden="true">📄</span>
              <span>
                <strong>إرسال ملخص حسابه</strong>
                <small>حصته من الأرباح والمستحق له والنقد الذي معه</small>
              </span>
            </button>
          </div>
        </PartySheet>
      )}

      {editingShipment && (
        <LedgerEntryEditor
          accountId={editingShipment.accountId}
          entry={editingShipment.entry}
          deviceName={accountName(editingShipment.accountId)}
          ledgerStore={ledgerStore}
          onSaved={onLedgerChange}
          onClose={() => setEditingShipment(null)}
        />
      )}
    </li>
  );
}

/** A day's device-profit split in the display currency, each shipment at its own locked rates. */
function dayShares(day: RepStatementDay, side: "rep" | "ours", convert: RepConvert): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of day.rows) {
    if (row.type !== "device") continue;
    const usd = side === "rep" ? row.row.repShareUsd : row.row.ourShareUsd;
    if (usd === undefined) continue;
    for (const [c, v] of Object.entries(convert(usd, "USD", row.row.entry.profitCurrencyRates))) result[c] = (result[c] ?? 0) + v;
  }
  return result;
}

/** Stacked figures for a stat tile - one line per display currency. */
function StatValues({ values, absolute = false }: { values: Record<string, number>; absolute?: boolean }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return <strong dir="ltr">0</strong>;
  return (
    <>
      {entries.map(([code, v]) => (
        <strong key={code} className="rep-stat-value">
          <bdi dir="ltr">{formatAmount(absolute ? Math.abs(v) : v)}</bdi> <small>{currencyLabel(code)}</small>
        </strong>
      ))}
    </>
  );
}

/** The statement's header: balance brought forward, the period's own figures, and the closing
 * balance - per currency, "له" = we owe him, "عليه" = he owes us. */
function RepStatementSummary({
  statement,
  period,
  periodLabel,
  archive,
}: {
  statement: RepPeriodStatement;
  period: RepPeriod;
  periodLabel: string;
  archive: boolean;
}) {
  const fx = useFx();
  const t = statement.totals;
  const lines: [string, string][] = [];
  if (t.deviceCount > 0) {
    lines.push(["ربح أجهزته", fx.list(t.deviceProfit)]);
    lines.push(["حصته", fx.list(t.repShare)]);
    lines.push(["حصتي", fx.list(t.ourShare)]);
    if (t.pendingCount > 0) lines.push(["شحنات بانتظار D", String(t.pendingCount)]);
  }
  // Already converted to the display currency by buildRepPeriodStatement.
  const list = (values: Record<string, number>) => fx.list(Object.fromEntries(nonZero(values)));
  if (nonZero(t.commissions).length) lines.push(["عمولات المتجر", list(t.commissions)]);
  if (nonZero(t.cashCollected).length) lines.push(["نقد قبضه من الزبائن", list(t.cashCollected)]);
  const sum = (a: Record<string, number>, b: Record<string, number>) => {
    const r: Record<string, number> = { ...a };
    for (const [c, v] of Object.entries(b)) r[c] = (r[c] ?? 0) + v;
    return r;
  };
  const credits = sum(t.settled.cashHandover, t.settled.manualCredit);
  const debits = sum(t.settled.commissionPayout, t.settled.manualDebit);
  if (nonZero(credits).length) lines.push(["له (أُضيف لرصيده)", list(credits)]);
  if (nonZero(debits).length) lines.push(["عليه (خُصم من رصيده)", list(debits)]);

  return (
    <div className={`rep-summary${archive ? " rep-summary-archive" : ""}`}>
      <div className="rep-summary-head">
        <strong>{archive ? "🗄 الأرشيف" : "📊 ملخص الفترة"}</strong>
        <span dir="auto">{periodLabel}</span>
      </div>
      {period.from && (
        <div className="rep-summary-balance">
          <span>رصيد أول الفترة</span>
          <BalanceValue values={statement.opening} />
        </div>
      )}
      {lines.length > 0 && (
        <dl className="rep-summary-lines">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="rep-summary-balance rep-summary-closing">
        <span>{period.to || period.from ? "رصيد آخر الفترة" : "الرصيد الحالي"}</span>
        <BalanceValue values={statement.closing} />
      </div>
    </div>
  );
}

function BalanceValue({ values }: { values: Record<string, number> }) {
  return (
    <strong className="rep-balance-value">
      {balanceParts(values).map((part) => (
        <span key={part.text} className={`rep-balance-${part.tone}`}>
          {part.text}
        </span>
      ))}
    </strong>
  );
}

function RepStatementLine({
  row,
  balanceAfter,
  accountName,
  clientNameFor,
  storeItems,
  onOpen,
}: {
  row: RepStatementRow;
  balanceAfter?: Record<string, number>;
  accountName: (accountId: string) => string;
  clientNameFor: (accountId: string) => string | undefined;
  storeItems: StoreItemRegistry;
  onOpen?: () => void;
}) {
  const fx = useFx();
  const delta = nonZero(repRowDelta(row, fx.convert));
  let body: ReactNode;
  let className = "";
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, ourShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    className = "rep-line-device";
    body = (
      <>
        <div className="party-statement-top">
          <span className="party-statement-kind">
            📡 {accountName(accountId)}
            {client ? ` · ${client}` : ""}
          </span>
          <span className="party-statement-date" dir="ltr">
            {formatAmount(entry.amount)} {currencyLabel(entry.currency)}
          </span>
        </div>
        {profit.status === "computed" ? (
          <>
            <div className="rep-line-calc">
              <span>بيع {fx.usd(profit.saleValueUsd ?? 0, entry)}</span>
              <span>− تكلفة {fx.usd(profit.starlinkCostUsd ?? 0, entry)}</span>
              <span className={(profit.profitUsd ?? 0) >= 0 ? "party-statement-clear" : "party-statement-due"}>
                = ربح {fx.usd(profit.profitUsd ?? 0, entry)}
              </span>
            </div>
            <div className="rep-day-split">
              <span className="rep-split-rep">
                حصته ({percent}%) {fx.usd(repShareUsd ?? 0, entry)}
              </span>
              <span className="rep-split-ours">حصتي {fx.usd(ourShareUsd ?? 0, entry)}</span>
            </div>
          </>
        ) : (
          <span className="party-statement-note">
            ⏳ بانتظار تسديد تكلفة Starlink (D)
            {row.row.expectedRepShareUsd !== undefined ? (
              <>
                {" "}- حصته المتوقعة ({percent}%) {fx.usd(row.row.expectedRepShareUsd)}، تتأكد بعد التسديد
              </>
            ) : (
              ` - تُحتسب حصته (${percent}%) بعد التسديد`
            )}
          </span>
        )}
      </>
    );
  } else if (row.type === "invoice") {
    const { invoice, commissionAmount } = row.row;
    const names = invoice.lines.map((l) => getStoreItem(storeItems, l.itemId)?.name).filter(Boolean).join("، ");
    className = "rep-line-invoice";
    body = (
      <>
        <div className="party-statement-top">
          <span className="party-statement-kind">🧾 فاتورة متجر{names ? ` · ${names}` : ""}</span>
        </div>
        <div className="rep-day-split">
          <span className="rep-split-rep">
            عمولته <bdi dir="ltr">{formatAmount(commissionAmount)}</bdi> {currencyLabel(invoice.currencyCode)}
          </span>
          {invoice.paidAmount > 0 && (
            <span className="rep-split-ours">
              قبض <bdi dir="ltr">{formatAmount(invoice.paidAmount)}</bdi> {currencyLabel(invoice.currencyCode)}
            </span>
          )}
        </div>
      </>
    );
  } else {
    const s = row.settlement;
    className = "rep-line-settlement";
    body = (
      <>
        <div className="party-statement-top">
          <span className="party-statement-kind">{SETTLEMENT_LABELS[s.kind]}</span>
          <strong dir="ltr">
            {formatAmount(s.amount)} {currencyLabel(s.currencyCode)}
          </strong>
        </div>
        {s.note && <span className="party-statement-note">{s.note}</span>}
      </>
    );
  }
  const footer = (
    <div className="rep-line-foot">
      {delta.length > 0 && (
        <span className="rep-line-delta">
          {delta.map(([code, v]) => (
            <bdi key={code} dir="ltr" className={v > 0 ? "rep-balance-due" : "rep-balance-clear"}>
              {v > 0 ? "+" : "-"}
              {formatAmount(Math.abs(v))} {currencyLabel(code)}
            </bdi>
          ))}
        </span>
      )}
      {balanceAfter && <span className="rep-line-balance">الرصيد: {balanceText(balanceAfter)}</span>}
      {onOpen && <span className="rep-line-edit" aria-hidden="true">✎</span>}
    </div>
  );
  return (
    <li className={`party-statement-row ${className}`}>
      {onOpen ? (
        <button type="button" className="rep-line-open" onClick={onOpen}>
          {body}
          {footer}
        </button>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </li>
  );
}

function SettlementForm({
  initial,
  submitLabel = "حفظ العملية",
  defaultCurrency = "MRU",
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: RepSettlement;
  /** New entries start in the currency the page is shown in. */
  defaultCurrency?: string;
  submitLabel?: string;
  onSubmit: (input: UpdateRepSettlementInput) => string | null;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [direction, setDirection] = useState<"credit" | "debit">(
    initial && (initial.kind === "cashHandover" || initial.kind === "manualCredit") ? "credit" : "debit",
  );
  const [viaCash, setViaCash] = useState(initial ? initial.kind === "cashHandover" || initial.kind === "commissionPayout" : true);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState<string>(initial?.currencyCode ?? defaultCurrency);
  const [date, setDate] = useState(initial?.date ?? todayDateInputValue());
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit({ kind: settlementKind(direction, viaCash), amount: Number(amount), currencyCode: currency, date, note }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <div className="party-direction">
        <button
          type="button"
          className={`party-direction-btn party-direction-we${direction === "credit" ? " party-direction-active" : ""}`}
          onClick={() => setDirection("credit")}
          aria-pressed={direction === "credit"}
        >
          <strong>له</strong>
          <small>يُضاف إلى رصيده</small>
        </button>
        <button
          type="button"
          className={`party-direction-btn party-direction-owes${direction === "debit" ? " party-direction-active" : ""}`}
          onClick={() => setDirection("debit")}
          aria-pressed={direction === "debit"}
        >
          <strong>عليه</strong>
          <small>يُخصم من رصيده</small>
        </button>
      </div>
      <div className="party-balance-row">
        <input
          className="search-input"
          type="number" lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          inputMode="decimal"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus={!initial}
        />
        <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {!LEDGER_CURRENCIES.includes(currency as LedgerCurrency) && <option value={currency}>{currency}</option>}
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <label className="rep-form-field">
        <span>التاريخ</span>
        <DateInput className="search-input"  value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={viaCash} onChange={(e) => setViaCash(e.target.checked)} />
        <span>{direction === "debit" ? "دفعتها له نقدًا (تخرج من الصندوق)" : "استلمتها منه نقدًا (تدخل الصندوق)"}</span>
      </label>
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amount || !date}>
          {submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="dialog-danger" onClick={onDelete}>
            حذف
          </button>
        )}
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/** Edits one past shipment's share: his percent / loss-sharing on it, or moves it to another
 * representative (or none). Every other shipment keeps its own locked values. */
function ShipmentShareForm({
  row,
  deviceLabel,
  currentRepId,
  representatives,
  onEditShipment,
  onSubmit,
  onCancel,
}: {
  row: RepDeviceCommissionRow;
  deviceLabel: string;
  currentRepId: string;
  representatives: Representative[];
  /** Opens the shipment itself (amount, cost, date...) in the device-operation editor. */
  onEditShipment: () => void;
  onSubmit: (patch: ShipmentRepPatch) => string | null;
  onCancel: () => void;
}) {
  const fx = useFx();
  const { entry, profit, percent } = row;
  const [repId, setRepId] = useState<string>(currentRepId);
  const [pct, setPct] = useState(String(percent));
  const [sharesLosses, setSharesLosses] = useState(entry.representativeSharesLosses ?? false);
  const [error, setError] = useState<string | null>(null);

  function pickRep(id: string) {
    setRepId(id);
    // Moving to another rep starts from that rep's own current terms.
    const target = representatives.find((r) => r.id === id);
    if (target && id !== currentRepId) {
      setPct(String(target.commissionPercent));
      setSharesLosses(target.sharesLosses ?? false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit({ representativeId: repId || null, percent: Number(pct), sharesLosses }));
  }

  const profitUsd = profit.status === "computed" ? profit.profitUsd : undefined;
  const previewShare =
    profitUsd !== undefined && repId ? (profitUsd > 0 || sharesLosses ? (profitUsd * (Number(pct) || 0)) / 100 : 0) : undefined;

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <div className="rep-shipment-info">
        <strong>📡 {deviceLabel}</strong>
        <span>
          <bdi dir="ltr">{entry.date}</bdi> · <bdi dir="ltr">{formatAmount(entry.amount)}</bdi> {currencyLabel(entry.currency)}
        </span>
        <span>
          {profitUsd !== undefined ? `ربح الشحنة ${fx.usd(profitUsd, entry)}` : "⏳ بانتظار تسديد تكلفة Starlink (D)"}
        </span>
        <button type="button" className="rep-edit-shipment" onClick={onEditShipment}>
          ✎ تعديل الشحنة نفسها (المبلغ، التكلفة، التاريخ، D)
        </button>
      </div>
      <label className="rep-form-field">
        <span>المندوب</span>
        <select className="search-input" value={repId} onChange={(e) => pickRep(e.target.value)}>
          {representatives.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.commissionPercent}%)
            </option>
          ))}
          <option value="">بدون مندوب (الربح كله لي)</option>
        </select>
      </label>
      {repId && (
        <>
          <label className="rep-form-field">
            <span>نسبته من ربح هذه الشحنة %</span>
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              max="100"
              step="0.1"
              dir="ltr"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </label>
          <label className="ledger-d-toggle party-cash-toggle">
            <input type="checkbox" checked={sharesLosses} onChange={(e) => setSharesLosses(e.target.checked)} />
            <span>يتحمّل نسبته من الخسارة في هذه الشحنة</span>
          </label>
        </>
      )}
      {previewShare !== undefined && profitUsd !== undefined && (
        <p className="rep-shipment-preview">
          حصته {fx.usd(previewShare, entry)} · حصتي {fx.usd(profitUsd - previewShare, entry)}
        </p>
      )}
      <p className="settings-hint">يتغيّر هذا على هذه الشحنة فقط - باقي الشحنات تحتفظ بنسبها.</p>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit">
          حفظ
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/** "تصفير الحساب": a fresh start from a date - older records stay, in the archive. */
function RepResetForm({
  rep,
  balance,
  onReset,
  onCancel,
}: {
  rep: Representative;
  balance: string;
  onReset: (point: RepResetPoint | undefined) => void;
  onCancel: () => void;
}) {
  const today = todayDateInputValue();
  const [date, setDate] = useState(today);

  return (
    <div className="party-balance-form">
      {rep.resetFrom && (
        <div className="rep-reset-current">
          <span>
            الحساب مُصفّر منذ <bdi dir="ltr">{rep.resetFrom.date}</bdi>
          </span>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              if (window.confirm("إلغاء التصفير؟ تعود كل العمليات القديمة إلى الحساب والرصيد.")) onReset(undefined);
            }}
          >
            إلغاء التصفير
          </button>
        </div>
      )}
      <p className="rep-reset-balance">
        رصيده الحالي: <strong>{balance}</strong>
      </p>
      <label className="rep-form-field">
        <span>يبدأ الحساب الجديد من</span>
        <DateInput className="search-input"  max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <p className="settings-hint">
        {date === today
          ? "يبدأ من هذه اللحظة: كل العمليات المسجّلة حتى الآن تنتقل إلى الأرشيف ويصبح رصيده صفرًا."
          : "العمليات قبل هذا التاريخ تنتقل إلى الأرشيف، وعمليات هذا اليوم وما بعده تبقى في حسابه."}{" "}
        لا يُحذف شيء، وتبقى الأرشيف ظاهرًا في الكشف. سوِّ رصيده أولًا إن كان عليه أو له مبلغ.
      </p>
      <div className="settings-actions">
        <button
          type="button"
          className="dialog-primary"
          disabled={!date || date > today}
          onClick={() => {
            if (window.confirm(`تصفير حساب "${rep.name}" وبدء حساب جديد من ${date}؟`)) onReset(makeRepResetPoint(date));
          }}
        >
          🔄 تصفير الحساب
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}

function RepresentativeForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Representative;
  onSubmit: (input: CreateRepresentativeInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [commissionPercent, setCommissionPercent] = useState(initial ? String(initial.commissionPercent) : "");
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial?.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial?.phone).localNumber);
  const [sharesLosses, setSharesLosses] = useState(initial?.sharesLosses ?? false);
  const [color, setColor] = useState<string | undefined>(initial?.color);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !commissionPercent) return;
    const phone = combinePhoneNumber(phoneDialCode, phoneLocalNumber);
    onSubmit({ name, phone: phone || undefined, commissionPercent: Number(commissionPercent), sharesLosses, color });
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <input className="search-input" placeholder="اسم المندوب *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input
        className="search-input"
        type="number" lang="en"
        min="0"
        step="0.1"
        dir="ltr"
        placeholder="نسبته من الربح % *"
        value={commissionPercent}
        onChange={(e) => setCommissionPercent(e.target.value)}
      />
      <div className="phone-input-row">
        <select
          className="phone-country-select"
          dir="ltr"
          value={phoneDialCode}
          onChange={(e) => setPhoneDialCode(e.target.value)}
          aria-label="رمز الدولة"
        >
          {PHONE_COUNTRY_CODES.map((c) => (
            <option key={c.dialCode} value={c.dialCode}>
              {c.country} {c.dialCode}
            </option>
          ))}
        </select>
        <input
          className="phone-local-input"
          dir="ltr"
          type="tel"
          placeholder="رقم الهاتف (اختياري)"
          value={phoneLocalNumber}
          onChange={(e) => setPhoneLocalNumber(e.target.value)}
        />
      </div>
      <div className="rep-color-field">
        <span>🎨 لون بطاقات أجهزته</span>
        <div className="rep-color-swatches" role="radiogroup" aria-label="لون المندوب">
          <button type="button" className={`rep-color-swatch rep-color-none${!color ? " rep-color-active" : ""}`} onClick={() => setColor(undefined)} aria-pressed={!color} title="بدون لون">
            ✕
          </button>
          {REP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`rep-color-swatch${color === c ? " rep-color-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={sharesLosses} onChange={(e) => setSharesLosses(e.target.checked)} />
        <span>يتحمّل نسبته من الخسارة أيضًا (إذا خسر جهاز تُخصم حصته من مستحقاته)</span>
      </label>
      <p className="settings-hint">
        نفس النسبة تُطبَّق على ربح أجهزته (بعد خصم تكلفة Starlink) وعلى فواتير المتجر المنسوبة له. تغيير النسبة لا يغيّر العمليات السابقة.
      </p>
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!name.trim() || !commissionPercent}>
          حفظ
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

function repRowCells(
  row: RepStatementRow,
  balanceAfter: Record<string, number> | undefined,
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
  fx: Fx,
): string[] {
  const delta = nonZero(repRowDelta(row, fx.convert))
    .map(([code, v]) => `${v > 0 ? "+" : "-"}${formatAmount(Math.abs(v))} ${currencyLabel(code)}`)
    .join(" / ");
  const balance = balanceAfter ? balanceText(balanceAfter) : "";
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    const title = `📡 ${accountName(accountId)}${client ? ` · ${client}` : ""} (${formatAmount(entry.amount)} ${currencyLabel(entry.currency)})`;
    if (profit.status !== "computed") {
      const expected = row.row.expectedRepShareUsd;
      return [row.date, title, `⏳ D - حصته المتوقعة ${expected !== undefined ? fx.usd(expected) : ""} (${percent}%)`, delta, balance];
    }
    return [row.date, title, `ربح ${fx.usd(profit.profitUsd ?? 0, entry)} · حصته ${fx.usd(repShareUsd ?? 0, entry)} (${percent}%)`, delta, balance];
  }
  if (row.type === "invoice") {
    const { invoice, commissionAmount } = row.row;
    const names = invoice.lines.map((l) => getStoreItem(storeItems, l.itemId)?.name).filter(Boolean).join("، ");
    const paid = invoice.paidAmount > 0 ? ` · قبض ${formatAmount(invoice.paidAmount)}` : "";
    return [row.date, `🧾 فاتورة متجر${names ? ` · ${names}` : ""}`, `عمولته ${formatAmount(commissionAmount)} ${currencyLabel(invoice.currencyCode)}${paid}`, delta, balance];
  }
  const s = row.settlement;
  return [row.date, SETTLEMENT_LABELS[s.kind], s.note ?? "", delta, balance];
}

function buildRepStatementPdf(
  rep: Representative,
  statement: RepPeriodStatement,
  periodLabel: string,
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
  fx: Fx,
): PrintableDocument {
  // Oldest first on paper, so the running balance reads top-down.
  const rows = [...statement.days]
    .reverse()
    .flatMap((day) =>
      [...day.rows].reverse().map((row) => repRowCells(row, statement.balanceAfter[repRowKey(row)], accountName, clientNameFor, storeItems, fx)),
    );
  const t = statement.totals;
  return {
    title: "كشف حساب مندوب",
    partyName: rep.name,
    partyPhone: rep.phone,
    subtitle: `${periodLabel} - نسبته ${rep.commissionPercent}%${rep.sharesLosses ? " - يتحمّل نسبته من الخسارة" : ""}`,
    summary: [
      ...(Object.keys(statement.opening).length > 0 ? [{ label: "رصيد أول الفترة", value: balanceText(statement.opening) }] : []),
      { label: "ربح أجهزته", value: fx.list(t.deviceProfit) },
      { label: "حصته", value: fx.list(t.repShare), tone: "due" as const },
      { label: "حصتي", value: fx.list(t.ourShare), tone: "clear" as const },
      { label: "الرصيد", value: balanceText(statement.closing), tone: "due" as const },
    ],
    columns: ["التاريخ", "العملية", "التفاصيل", "الحركة", "الرصيد بعدها"],
    rows,
    footerNote: "«له» = مستحق للمندوب، «عليه» = مستحق عليه.",
  };
}

/** "عليه 1,500 أوقية · له 20 دولار" - + = owed. */
function bookText(values: Record<string, number>): string {
  const parts = nonZero(values).map(([code, v]) => `${v > 0 ? "عليه" : "له"} ${formatAmount(Math.abs(v))} ${currencyLabel(code)}`);
  return parts.length ? parts.join(" · ") : "لا شيء ✓";
}

const BOOK_LINE_LABELS: Record<BookLine["kind"], string> = {
  opening: "🔁 رصيده عند النقل",
  renewal: "📡 تجديد",
  charge: "➕ عليه",
  credit: "➖ له",
  payment: "💵 دفع للمندوب",
  movedOut: "↪️ نُقل رصيده",
};

/** The rep's book on one customer - read only: the rep writes it from his bot. */
function RepClientBook({
  lines,
  balance,
  owedToUs,
  accountName,
}: {
  lines: BookLine[];
  balance: Record<string, number>;
  owedToUs: Record<string, number>;
  accountName: (accountId: string) => string;
}) {
  const newestFirst = [...lines].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <div className="rep-client-book">
      <div className="rep-clients-total">
        <span>عليه للمندوب</span>
        <strong>{bookText(balance)}</strong>
      </div>
      <div className="rep-clients-total rep-client-ours">
        <span>المندوب عليه لك عنه</span>
        <strong>{bookText(owedToUs)}</strong>
      </div>
      <p className="settings-hint">دفتر المندوب - للعرض فقط. المندوب يسجّل فيه من البوت (دفعة، له/عليه، تراجع خلال 24 ساعة).</p>
      {newestFirst.length === 0 ? (
        <p className="party-empty">لا عمليات بعد.</p>
      ) : (
        <ul className="party-statement">
          {newestFirst.map((line, i) => (
            <li key={`${line.at}-${i}`} className="party-statement-row">
              <div className="party-statement-top">
                <span>{BOOK_LINE_LABELS[line.kind]}{line.accountId ? ` · ${accountName(line.accountId)}` : ""}</span>
                <span dir="ltr" className="party-statement-date">{line.date}</span>
              </div>
              <div className="party-statement-top">
                <span className="party-statement-note">{line.note ?? ""}</span>
                <strong>
                  {nonZero(line.amounts).map(([code, v]) => (
                    <bdi key={code} dir="ltr">
                      {v > 0 ? "+" : "−"}{formatAmount(Math.abs(v))} {currencyLabel(code)}{" "}
                    </bdi>
                  ))}
                </strong>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Review before moving his customers' debts onto him - each one ticked by default. */
function RepTransferForm({
  candidates,
  onConfirm,
}: {
  candidates: { clientId: string; name: string; balance: Record<string, number>; deviceCount: number }[];
  onConfirm: (clientIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.clientId)));
  const total: Record<string, number> = {};
  for (const c of candidates) {
    if (!picked.has(c.clientId)) continue;
    for (const [code, v] of Object.entries(c.balance)) total[code] = (total[code] ?? 0) + v;
  }
  return (
    <div className="rep-transfer">
      <p className="settings-hint">
        كل زبون مختار يصبح زبون المندوب بكل أجهزته: ما عليه الآن لك يصبح دينًا على المندوب لك، ويُفتح به حسابه في دفتر المندوب.
        التجديدات القادمة تُسجَّل على المندوب، ويختفي هذا الدين من «ديون الزبائن» عندك.
      </p>
      <ul className="party-devices">
        {candidates.map((c) => (
          <li key={c.clientId}>
            <label className="party-device rep-transfer-row">
              <input
                type="checkbox"
                checked={picked.has(c.clientId)}
                onChange={(e) =>
                  setPicked((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(c.clientId);
                    else next.delete(c.clientId);
                    return next;
                  })
                }
              />
              <span className="rep-transfer-name">
                <strong>{c.name}</strong> <span className="party-device-date">📡 {c.deviceCount}</span>
              </span>
              <span className="rep-client-balances">{bookText(c.balance)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="rep-clients-total">
        <span>يصبح على المندوب</span>
        <strong>{bookText(total)}</strong>
      </div>
      <button type="button" className="btn-primary" disabled={picked.size === 0} onClick={() => onConfirm([...picked])}>
        ✅ نقل {picked.size} زبون على المندوب
      </button>
    </div>
  );
}
