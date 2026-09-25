"use client";

import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatProfitMru } from "@/lib/profitMru";
import { useMruRate } from "@/lib/useMruRate";
import { PdfButton } from "@/components/PdfButton";
import { PrintableDocument } from "@/lib/pdfDocument";
import { loadCashEntries, postRepSettlementToCash, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { StarlinkAccountSummary } from "@starnet/shared";
import {
  buildRepDailyStatement,
  computeRepCashHeldByCurrency,
  computeRepCommissionOwedByCurrency,
  computeRepManualBalanceByCurrency,
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
  RepDeviceTotals,
  RepStatementRow,
  saveRepresentativeStore,
  saveRepSettlements,
  setRepresentativeReset,
  totalRepDeviceCommissions,
  updateRepresentative,
  updateRepSettlement,
  UpdateRepSettlementInput,
} from "@/lib/repStore";
import {
  buildRepPeriodStatement,
  makeRepResetPoint,
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
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { getStoreItem, loadStoreItems, StoreItemRegistry } from "@/lib/storeStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { partyHue, partyInitials } from "@/lib/partyColor";
import { buildRepStatementMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PartySheet } from "@/components/AccountsSection";

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Profit figures on this page are shown in أوقية (profitMru.ts): a shipment's own locked MRU
 * rate when given, otherwise today's rate (≈), USD only when no MRU rate is registered. */
function money(usd: number, rate: number | undefined, entry?: LedgerEntry): string {
  const locked = entry?.profitCurrencyRates?.MRU;
  const sign = usd < -EPSILON ? "-" : "";
  return sign + formatProfitMru(usd, rate, locked !== undefined ? Math.abs(usd) * locked : undefined);
}

function nonZero(values: Record<string, number>): [string, number][] {
  return Object.entries(values).filter(([, v]) => Math.abs(v) > EPSILON);
}

/** His running balance in words, per currency: "له" = we owe him, "عليه" = he owes us. */
function balanceParts(values: Record<string, number>, mruRate: number | undefined): { text: string; tone: "due" | "clear" | "zero" }[] {
  const parts = nonZero(values).map(([code, v]) => ({
    text: `${v > 0 ? "له" : "عليه"} ${formatAmount(Math.abs(v))} ${currencyLabel(code)}${
      code === "USD" && mruRate ? ` (≈ ${formatAmount(Math.round(Math.abs(v) * mruRate))} أوقية)` : ""
    }`,
    tone: (v > 0 ? "due" : "clear") as "due" | "clear",
  }));
  return parts.length > 0 ? parts : [{ text: "صفر - الحساب متوازن", tone: "zero" }];
}

function balanceText(values: Record<string, number>, mruRate: number | undefined): string {
  return balanceParts(values, mruRate)
    .map((p) => p.text)
    .join(" · ");
}

const SETTLEMENT_LABELS: Record<RepSettlementKind, string> = {
  cashHandover: "💰 تسليم نقد (استلمته منه)",
  commissionPayout: "💵 دفع عمولة (سلّمته له)",
  manualCredit: "➕ مبلغ له (مكافأة/إضافي)",
  manualDebit: "➖ مبلغ عليه (سلفة)",
};

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
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);

  useEffect(() => {
    setRepresentativeStore(loadRepresentativeStore());
    setInvoices(loadInvoices());
    setSettlements(loadRepSettlements());
    setStoreItems(loadStoreItems());
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const representatives = useMemo(() => listRepresentatives(representativeStore), [representativeStore]);
  const mruRate = useMruRate();

  const overview = useMemo(() => {
    const owed: Record<string, number> = {};
    let repShareUsd = 0;
    let ourShareUsd = 0;
    for (const rep of representatives) {
      const totals = totalRepDeviceCommissions(listRepDeviceCommissions(rep.id, ledgerStore));
      repShareUsd += totals.repShareUsd;
      ourShareUsd += totals.ourShareUsd;
      const active = splitRepRecords(rep, { deviceRows: listRepDeviceCommissions(rep.id, ledgerStore), invoices, settlements }, "active");
      for (const [c, v] of Object.entries(computeRepCommissionOwedByCurrency(rep.id, active.invoices, active.settlements, active.deviceRows))) {
        if (v > EPSILON) owed[c] = (owed[c] ?? 0) + v;
      }
    }
    return { owed, repShareUsd, ourShareUsd };
  }, [representatives, ledgerStore, invoices, settlements]);

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
    const result = recordRepSettlement(settlements, { representativeId, ...input });
    if (!result.ok) return result.message;
    saveSettlementList(result.settlements);
    saveCashEntries(postRepSettlementToCash(loadCashEntries(), result.settlement, representativeStore[representativeId]?.name ?? ""));
    return null;
  }

  // An edited settlement re-posts its own cash entry (removed + posted again from the new values).
  function handleUpdateSettlement(settlementId: string, input: UpdateRepSettlementInput): string | null {
    const result = updateRepSettlement(settlements, settlementId, input);
    if (!result.ok) return result.message;
    saveSettlementList(result.settlements);
    const repName = representativeStore[result.settlement.representativeId]?.name ?? "";
    saveCashEntries(postRepSettlementToCash(removeLinkedCashEntries(loadCashEntries(), settlementId), result.settlement, repName));
    return null;
  }

  function handleDeleteSettlement(settlementId: string) {
    saveSettlementList(deleteRepSettlement(settlements, settlementId));
    saveCashEntries(removeLinkedCashEntries(loadCashEntries(), settlementId));
  }

  function handleShipmentShare(accountId: string, entryId: string, patch: ShipmentRepPatch): string | null {
    const result = setShipmentRepShare(ledgerStore, accountId, entryId, patch);
    if (!result.ok) return result.message;
    setLedgerStore(result.ledgerStore);
    saveLedgerStore(result.ledgerStore);
    return null;
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
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المندوبون</h1>
      </div>

      <section className="section">
        <div className="party-section party-section-reps">
          <div className="rep-overview">
            <div className="rep-overview-item">
              <span>حصة المندوبين من أرباح الأجهزة</span>
              <strong>{money(overview.repShareUsd, mruRate)}</strong>
            </div>
            <div className="rep-overview-item rep-overview-ours">
              <span>حصتي من أرباح أجهزتهم</span>
              <strong>{money(overview.ourShareUsd, mruRate)}</strong>
            </div>
            <div className="rep-overview-item rep-overview-owed">
              <span>مستحق للمندوبين الآن</span>
              <strong dir="ltr">
                {nonZero(overview.owed).length === 0
                  ? "0"
                  : nonZero(overview.owed)
                      .map(([c, v]) => `${formatAmount(v)} ${currencyLabel(c)}`)
                      .join(" + ")}
              </strong>
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
                    storeItems={storeItems}
                    onEdit={() => setEditingRepId(rep.id)}
                    onSettle={(input) => handleSettlement(rep.id, input)}
                    onUpdateSettlement={handleUpdateSettlement}
                    onDeleteSettlement={handleDeleteSettlement}
                    onShipmentShare={handleShipmentShare}
                    onReset={(resetFrom) => handleReset(rep.id, resetFrom)}
                    onDelete={() => handleDeleteRep(rep.id)}
                  />
                ),
              )}
            </ul>
          )}
        </div>
      </section>
    </main>
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
  storeItems: StoreItemRegistry;
  onEdit: () => void;
  onSettle: (input: UpdateRepSettlementInput) => string | null;
  onUpdateSettlement: (settlementId: string, input: UpdateRepSettlementInput) => string | null;
  onDeleteSettlement: (settlementId: string) => void;
  onShipmentShare: (accountId: string, entryId: string, patch: ShipmentRepPatch) => string | null;
  onReset: (resetFrom: RepResetPoint | undefined) => void;
  onDelete: () => void;
}

type RepPanel = "statement" | "devices" | null;
type RepSheet =
  | { kind: "settle" | "whatsapp" | "manage" | "reset" | "delete" }
  | { kind: "settlement"; settlement: RepSettlement }
  | { kind: "shipment"; row: RepDeviceCommissionRow }
  | null;

function RepCard({
  representative: rep,
  representatives,
  invoices,
  settlements,
  ledgerStore,
  accounts,
  clientStore,
  storeItems,
  onEdit,
  onSettle,
  onUpdateSettlement,
  onDeleteSettlement,
  onShipmentShare,
  onReset,
  onDelete,
}: RepCardProps) {
  const [panel, setPanel] = useState<RepPanel>(null);
  const [sheet, setSheet] = useState<RepSheet>(null);
  const [periodKind, setPeriodKind] = useState<RepPeriodKind>("all");
  const [customPeriod, setCustomPeriod] = useState<RepPeriod>({ from: "", to: "" });
  const [showArchive, setShowArchive] = useState(false);

  const mruRate = useMruRate();
  const allDeviceRows = useMemo(() => listRepDeviceCommissions(rep.id, ledgerStore), [rep.id, ledgerStore]);
  // Only records after his reset (تصفير) count; older ones are the archive.
  const active = useMemo(
    () => splitRepRecords(rep, { deviceRows: allDeviceRows, invoices, settlements }, "active"),
    [rep, allDeviceRows, invoices, settlements],
  );
  const deviceRows = active.deviceRows;
  const deviceTotals = useMemo(() => totalRepDeviceCommissions(deviceRows), [deviceRows]);
  const owed = computeRepCommissionOwedByCurrency(rep.id, active.invoices, active.settlements, deviceRows);
  const cashHeld = computeRepCashHeldByCurrency(rep.id, active.invoices, active.settlements);
  const manual = computeRepManualBalanceByCurrency(rep.id, active.settlements);
  const devices = accounts.filter((a) => a.representativeId === rep.id);
  const hasOwed = nonZero(owed).some(([, v]) => v > 0);

  const allDays = useMemo(() => {
    if (panel !== "statement" && sheet?.kind !== "reset") return [];
    const source = showArchive && rep.resetFrom ? splitRepRecords(rep, { deviceRows: allDeviceRows, invoices, settlements }, "archive") : active;
    return buildRepDailyStatement(rep.id, source.deviceRows, source.invoices, source.settlements);
  }, [panel, sheet, showArchive, rep, allDeviceRows, invoices, settlements, active]);
  const period = repPeriod(periodKind, todayDateInputValue(), customPeriod);
  const statement = useMemo(() => buildRepPeriodStatement(allDays, period), [allDays, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const netBalance = useMemo(
    () => buildRepPeriodStatement(buildRepDailyStatement(rep.id, deviceRows, active.invoices, active.settlements), {}).closing,
    [rep.id, deviceRows, active],
  );
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
        ? `يوم ${period.from}`
        : periodKind === "month"
          ? `شهر ${period.from?.slice(0, 7)}`
          : `من ${period.from || "البداية"} إلى ${period.to || "اليوم"}`;

  return (
    <li className="party-card rep-card" style={{ "--party-hue": partyHue(rep.id) } as CSSProperties}>
      <div className="party-card-head">
        <span className="party-avatar" aria-hidden="true">{partyInitials(rep.name)}</span>
        <div className="party-card-title">
          <strong>🤝 {rep.name}</strong>
          <span dir="ltr">{rep.phone || "بدون هاتف"}</span>
        </div>
        <span className="rep-percent" title={rep.sharesLosses ? "يتحمّل نسبته من الخسارة" : undefined}>
          {rep.commissionPercent}%{rep.sharesLosses ? " ⚖️" : ""}
        </span>
      </div>

      <div className="party-stats">
        <span className="party-stats-currency">أرباح أجهزته ({mruRate ? "أوقية ≈" : "USD"})</span>
        <div className="party-stat">
          <span>الربح</span>
          <strong dir="ltr">{formatAmount(deviceTotals.profitUsd * (mruRate ?? 1))}</strong>
        </div>
        <div className="party-stat party-stat-adjusted">
          <span>حصته</span>
          <strong dir="ltr">{formatAmount(deviceTotals.repShareUsd * (mruRate ?? 1))}</strong>
        </div>
        <div className="party-stat party-stat-paid">
          <span>حصتي</span>
          <strong dir="ltr">{formatAmount(deviceTotals.ourShareUsd * (mruRate ?? 1))}</strong>
        </div>
        <div className={`party-stat ${hasOwed ? "party-stat-due" : "party-stat-clear"}`}>
          <span>مستحق له</span>
          <strong dir="ltr">{formatAmount(owed.USD ?? 0)}</strong>
        </div>
      </div>

      <div className="party-chips">
        <span className="party-chip">📡 {devices.length} جهاز</span>
        {rep.resetFrom && (
          <span className="party-chip rep-chip-reset">
            🔄 حساب جديد منذ <bdi dir="ltr">{rep.resetFrom.date}</bdi>
          </span>
        )}
        {deviceTotals.pendingCount > 0 && (
          <span className="party-chip">
            ⏳ {deviceTotals.pendingCount} بانتظار D
            {deviceTotals.expectedRepShareUsd > 0.0001 && <> · حصته المتوقعة {money(deviceTotals.expectedRepShareUsd, mruRate)}</>}
          </span>
        )}
        {nonZero(owed)
          .filter(([c]) => c !== "USD")
          .map(([c, v]) => (
            <span key={`owed-${c}`} className="party-chip party-chip-alert" dir="ltr">
              مستحق له {formatAmount(v)} {currencyLabel(c)}
            </span>
          ))}
        {nonZero(cashHeld).map(([c, v]) => (
          <span key={`cash-${c}`} className="party-chip rep-chip-cash" dir="ltr">
            💰 نقد معه {formatAmount(v)} {currencyLabel(c)}
          </span>
        ))}
        {nonZero(manual).map(([c, v]) => (
          <span key={`manual-${c}`} className={`party-chip${v < 0 ? " party-chip-alert" : ""}`} dir="ltr">
            {v > 0 ? "له إضافي" : "سلفة عليه"} {formatAmount(Math.abs(v))} {currencyLabel(c)}
          </span>
        ))}
      </div>

      <div className="party-actions">
        <button
          type="button"
          className={`party-action${panel === "statement" ? " party-action-active" : ""}`}
          onClick={() => setPanel((p) => (p === "statement" ? null : "statement"))}
        >
          📄 الكشف
        </button>
        <button type="button" className="party-action party-action-balance" onClick={() => setSheet({ kind: "settle" })}>
          💵 تسوية
        </button>
        {canWhatsApp && (
          <button type="button" className="party-action party-action-whatsapp" onClick={() => setSheet({ kind: "whatsapp" })}>
            💬 واتساب
          </button>
        )}
        <button
          type="button"
          className={`party-action${panel === "devices" ? " party-action-active" : ""}`}
          onClick={() => setPanel((p) => (p === "devices" ? null : "devices"))}
        >
          📡 الأجهزة ({devices.length})
        </button>
        <button type="button" className="party-action" onClick={() => setSheet({ kind: "manage" })}>
          ⚙️ إدارة
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
          {periodKind === "custom" && (
            <div className="rep-period-range">
              <label>
                <span>من</span>
                <input type="date" lang="en-GB" dir="ltr" value={customPeriod.from ?? ""} onChange={(e) => setCustomPeriod((p) => ({ ...p, from: e.target.value }))} />
              </label>
              <label>
                <span>إلى</span>
                <input type="date" lang="en-GB" dir="ltr" value={customPeriod.to ?? ""} onChange={(e) => setCustomPeriod((p) => ({ ...p, to: e.target.value }))} />
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

          <RepStatementSummary statement={statement} period={period} periodLabel={periodLabel} archive={showArchive && !!rep.resetFrom} mruRate={mruRate} />

          <div className="party-panel-tools">
            <PdfButton
              className="party-action party-action-pdf"
              label="🖨️ تصدير الكشف PDF"
              build={() =>
                buildRepStatementPdf(rep, statement, periodLabel + (showArchive && rep.resetFrom ? " (أرشيف)" : ""), accountName, clientNameFor, storeItems, mruRate)
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
                        <span className="rep-split-rep">حصته {money(day.repShareUsd, mruRate)}</span>
                        <span className="rep-split-ours">حصتي {money(day.ourShareUsd, mruRate)}</span>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sheet?.kind === "settle" && (
        <PartySheet title={`تسوية - ${rep.name}`} onClose={() => setSheet(null)}>
          <SettlementForm
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
            mruRate={mruRate}
            onCancel={() => setSheet(null)}
            onSubmit={(patch) => {
              const error = onShipmentShare(sheet.row.accountId, sheet.row.entry.id, patch);
              if (!error) setSheet(null);
              return error;
            }}
          />
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
            balance={balanceText(netBalance, mruRate)}
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
              <li>💰 رصيده الحالي: {balanceText(netBalance, mruRate)}</li>
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
              onClick={() => openWhatsApp(buildRepStatementMessage(rep.name, deviceTotals, owed, cashHeld))}
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
    </li>
  );
}

/** The statement's header: balance brought forward, the period's own figures, and the closing
 * balance - per currency, "له" = we owe him, "عليه" = he owes us. */
function RepStatementSummary({
  statement,
  period,
  periodLabel,
  archive,
  mruRate,
}: {
  statement: RepPeriodStatement;
  period: RepPeriod;
  periodLabel: string;
  archive: boolean;
  mruRate: number | undefined;
}) {
  const t = statement.totals;
  const lines: [string, string][] = [];
  if (t.deviceCount > 0) {
    lines.push(["ربح أجهزته", money(t.deviceProfitUsd, mruRate)]);
    lines.push(["حصته", money(t.repShareUsd, mruRate)]);
    lines.push(["حصتي", money(t.ourShareUsd, mruRate)]);
    if (t.pendingCount > 0) lines.push(["شحنات بانتظار D", String(t.pendingCount)]);
  }
  const list = (values: Record<string, number>) =>
    nonZero(values)
      .map(([c, v]) => `${formatAmount(v)} ${currencyLabel(c)}`)
      .join(" + ");
  if (nonZero(t.commissions).length) lines.push(["عمولات المتجر", list(t.commissions)]);
  if (nonZero(t.cashCollected).length) lines.push(["نقد قبضه من الزبائن", list(t.cashCollected)]);
  if (nonZero(t.settled.commissionPayout).length) lines.push(["دفعتُ له", list(t.settled.commissionPayout)]);
  if (nonZero(t.settled.cashHandover).length) lines.push(["سلّمني نقدًا", list(t.settled.cashHandover)]);
  if (nonZero(t.settled.manualCredit).length) lines.push(["مبالغ له (إضافي)", list(t.settled.manualCredit)]);
  if (nonZero(t.settled.manualDebit).length) lines.push(["سلف عليه", list(t.settled.manualDebit)]);

  return (
    <div className={`rep-summary${archive ? " rep-summary-archive" : ""}`}>
      <div className="rep-summary-head">
        <strong>{archive ? "🗄 الأرشيف" : "📊 ملخص الفترة"}</strong>
        <span dir="auto">{periodLabel}</span>
      </div>
      {period.from && (
        <div className="rep-summary-balance">
          <span>رصيد أول الفترة</span>
          <BalanceValue values={statement.opening} mruRate={mruRate} />
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
        <BalanceValue values={statement.closing} mruRate={mruRate} />
      </div>
    </div>
  );
}

function BalanceValue({ values, mruRate }: { values: Record<string, number>; mruRate: number | undefined }) {
  return (
    <strong className="rep-balance-value">
      {balanceParts(values, mruRate).map((part) => (
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
  const mruRate = useMruRate();
  const delta = nonZero(repRowDelta(row));
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
              <span>بيع {money(profit.saleValueUsd ?? 0, mruRate, entry)}</span>
              <span>− تكلفة {money(profit.starlinkCostUsd ?? 0, mruRate, entry)}</span>
              <span className={(profit.profitUsd ?? 0) >= 0 ? "party-statement-clear" : "party-statement-due"}>
                = ربح {money(profit.profitUsd ?? 0, mruRate, entry)}
              </span>
            </div>
            <div className="rep-day-split">
              <span className="rep-split-rep">
                حصته ({percent}%) {money(repShareUsd ?? 0, mruRate, entry)}
              </span>
              <span className="rep-split-ours">حصتي {money(ourShareUsd ?? 0, mruRate, entry)}</span>
            </div>
          </>
        ) : (
          <span className="party-statement-note">
            ⏳ بانتظار تسديد تكلفة Starlink (D)
            {row.row.expectedRepShareUsd !== undefined ? (
              <>
                {" "}- حصته المتوقعة ({percent}%) {money(row.row.expectedRepShareUsd, mruRate)}، تتأكد بعد التسديد
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
      {balanceAfter && <span className="rep-line-balance">الرصيد: {balanceText(balanceAfter, undefined)}</span>}
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
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: RepSettlement;
  submitLabel?: string;
  onSubmit: (input: UpdateRepSettlementInput) => string | null;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<RepSettlementKind>(initial?.kind ?? "commissionPayout");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState<string>(initial?.currencyCode ?? "USD");
  const [date, setDate] = useState(initial?.date ?? todayDateInputValue());
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit({ kind, amount: Number(amount), currencyCode: currency, date, note }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as RepSettlementKind)}>
        {(Object.keys(SETTLEMENT_LABELS) as RepSettlementKind[]).map((k) => (
          <option key={k} value={k}>
            {SETTLEMENT_LABELS[k]}
          </option>
        ))}
      </select>
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
        <input className="search-input" type="date" lang="en-GB" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} required />
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
  mruRate,
  onSubmit,
  onCancel,
}: {
  row: RepDeviceCommissionRow;
  deviceLabel: string;
  currentRepId: string;
  representatives: Representative[];
  mruRate: number | undefined;
  onSubmit: (patch: ShipmentRepPatch) => string | null;
  onCancel: () => void;
}) {
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
          {profitUsd !== undefined ? `ربح الشحنة ${money(profitUsd, mruRate, entry)}` : "⏳ بانتظار تسديد تكلفة Starlink (D)"}
        </span>
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
          حصته {money(previewShare, mruRate, entry)} · حصتي {money(profitUsd - previewShare, mruRate, entry)}
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
        <input className="search-input" type="date" lang="en-GB" dir="ltr" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !commissionPercent) return;
    const phone = combinePhoneNumber(phoneDialCode, phoneLocalNumber);
    onSubmit({ name, phone: phone || undefined, commissionPercent: Number(commissionPercent), sharesLosses });
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
  mruRate: number | undefined,
): string[] {
  const delta = nonZero(repRowDelta(row))
    .map(([code, v]) => `${v > 0 ? "+" : "-"}${formatAmount(Math.abs(v))} ${currencyLabel(code)}`)
    .join(" / ");
  const balance = balanceAfter ? balanceText(balanceAfter, undefined) : "";
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    const title = `📡 ${accountName(accountId)}${client ? ` · ${client}` : ""} (${formatAmount(entry.amount)} ${currencyLabel(entry.currency)})`;
    if (profit.status !== "computed") {
      const expected = row.row.expectedRepShareUsd;
      return [row.date, title, `⏳ D - حصته المتوقعة ${expected !== undefined ? money(expected, mruRate) : ""} (${percent}%)`, delta, balance];
    }
    return [row.date, title, `ربح ${money(profit.profitUsd ?? 0, mruRate, entry)} · حصته ${money(repShareUsd ?? 0, mruRate, entry)} (${percent}%)`, delta, balance];
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
  mruRate: number | undefined,
): PrintableDocument {
  // Oldest first on paper, so the running balance reads top-down.
  const rows = [...statement.days]
    .reverse()
    .flatMap((day) =>
      [...day.rows].reverse().map((row) => repRowCells(row, statement.balanceAfter[repRowKey(row)], accountName, clientNameFor, storeItems, mruRate)),
    );
  const t = statement.totals;
  const totals: RepDeviceTotals = {
    profitUsd: t.deviceProfitUsd,
    repShareUsd: t.repShareUsd,
    ourShareUsd: t.ourShareUsd,
    pendingCount: t.pendingCount,
    expectedRepShareUsd: 0,
  };
  return {
    title: "كشف حساب مندوب",
    partyName: rep.name,
    partyPhone: rep.phone,
    subtitle: `${periodLabel} - نسبته ${rep.commissionPercent}%${rep.sharesLosses ? " - يتحمّل نسبته من الخسارة" : ""}`,
    summary: [
      ...(Object.keys(statement.opening).length > 0 ? [{ label: "رصيد أول الفترة", value: balanceText(statement.opening, undefined) }] : []),
      { label: "ربح أجهزته", value: money(totals.profitUsd, mruRate) },
      { label: "حصته", value: money(totals.repShareUsd, mruRate), tone: "due" as const },
      { label: "حصتي", value: money(totals.ourShareUsd, mruRate), tone: "clear" as const },
      { label: "الرصيد", value: balanceText(statement.closing, undefined), tone: "due" as const },
    ],
    columns: ["التاريخ", "العملية", "التفاصيل", "الحركة", "الرصيد بعدها"],
    rows,
    footerNote: "«له» = مستحق للمندوب، «عليه» = مستحق عليه.",
  };
}
