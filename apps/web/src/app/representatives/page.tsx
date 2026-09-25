"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PdfButton } from "@/components/PdfButton";
import { PrintableDocument } from "@/lib/pdfDocument";
import { loadCashEntries, postRepSettlementToCash, saveCashEntries } from "@/lib/cashStore";
import { StarlinkAccountSummary } from "@starnet/shared";
import {
  buildRepDailyStatement,
  computeRepCashHeldByCurrency,
  computeRepCommissionOwedByCurrency,
  computeRepManualBalanceByCurrency,
  createRepresentative,
  CreateRepresentativeInput,
  listRepDeviceCommissions,
  listRepresentatives,
  loadRepresentativeStore,
  loadRepSettlements,
  recordRepSettlement,
  Representative,
  RepresentativeStore,
  RepSettlementKind,
  RepSettlementList,
  RepDeviceTotals,
  RepStatementDay,
  RepStatementRow,
  saveRepresentativeStore,
  saveRepSettlements,
  totalRepDeviceCommissions,
  updateRepresentative,
} from "@/lib/repStore";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency, loadLedgerStore } from "@/lib/ledgerStore";
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { getStoreItem, loadStoreItems, StoreItemRegistry } from "@/lib/storeStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { partyHue, partyInitials } from "@/lib/partyColor";
import { buildRepStatementMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PartySheet } from "@/components/AccountsSection";

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function nonZero(values: Record<string, number>): [string, number][] {
  return Object.entries(values).filter(([, v]) => Math.abs(v) > EPSILON);
}

const SETTLEMENT_LABELS: Record<RepSettlementKind, string> = {
  cashHandover: "💰 تسليم نقد (استلمته منه)",
  commissionPayout: "💵 دفع عمولة (سلّمته له)",
  manualCredit: "➕ مبلغ له (مكافأة/إضافي)",
  manualDebit: "➖ مبلغ عليه (سلفة)",
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

  const overview = useMemo(() => {
    const owed: Record<string, number> = {};
    let repShareUsd = 0;
    let ourShareUsd = 0;
    for (const rep of representatives) {
      const deviceRows = listRepDeviceCommissions(rep.id, ledgerStore);
      const totals = totalRepDeviceCommissions(deviceRows);
      repShareUsd += totals.repShareUsd;
      ourShareUsd += totals.ourShareUsd;
      for (const [c, v] of Object.entries(computeRepCommissionOwedByCurrency(rep.id, invoices, settlements, deviceRows))) {
        if (v > EPSILON) owed[c] = (owed[c] ?? 0) + v;
      }
    }
    return { owed, repShareUsd, ourShareUsd };
  }, [representatives, ledgerStore, invoices, settlements]);

  function handleCreate(input: CreateRepresentativeInput) {
    const result = createRepresentative(representativeStore, input);
    setRepresentativeStore(result.store);
    saveRepresentativeStore(result.store);
    setShowAddForm(false);
  }

  function handleUpdate(id: string, input: CreateRepresentativeInput) {
    const next = updateRepresentative(representativeStore, id, input);
    setRepresentativeStore(next);
    saveRepresentativeStore(next);
    setEditingRepId(null);
  }

  function handleSettlement(
    representativeId: string,
    kind: RepSettlementKind,
    amount: number,
    currencyCode: string,
    note: string,
  ): string | null {
    const result = recordRepSettlement(settlements, { representativeId, kind, amount, currencyCode, date: todayDateInputValue(), note });
    if (!result.ok) return result.message;
    setSettlements(result.settlements);
    saveRepSettlements(result.settlements);
    saveCashEntries(postRepSettlementToCash(loadCashEntries(), result.settlement, representativeStore[representativeId]?.name ?? ""));
    return null;
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
              <strong dir="ltr">{formatAmount(overview.repShareUsd)} USD</strong>
            </div>
            <div className="rep-overview-item rep-overview-ours">
              <span>حصتي من أرباح أجهزتهم</span>
              <strong dir="ltr">{formatAmount(overview.ourShareUsd)} USD</strong>
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
                    invoices={invoices}
                    settlements={settlements}
                    ledgerStore={ledgerStore}
                    accounts={accounts}
                    clientStore={clientStore}
                    storeItems={storeItems}
                    onEdit={() => setEditingRepId(rep.id)}
                    onSettle={(kind, amount, currencyCode, note) => handleSettlement(rep.id, kind, amount, currencyCode, note)}
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
  invoices: InvoiceList;
  settlements: RepSettlementList;
  ledgerStore: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  storeItems: StoreItemRegistry;
  onEdit: () => void;
  onSettle: (kind: RepSettlementKind, amount: number, currencyCode: string, note: string) => string | null;
}

type RepPanel = "statement" | "devices" | null;
type RepSheet = "settle" | "whatsapp" | null;

function RepCard({
  representative: rep,
  invoices,
  settlements,
  ledgerStore,
  accounts,
  clientStore,
  storeItems,
  onEdit,
  onSettle,
}: RepCardProps) {
  const [panel, setPanel] = useState<RepPanel>(null);
  const [sheet, setSheet] = useState<RepSheet>(null);

  const deviceRows = useMemo(() => listRepDeviceCommissions(rep.id, ledgerStore), [rep.id, ledgerStore]);
  const deviceTotals = useMemo(() => totalRepDeviceCommissions(deviceRows), [deviceRows]);
  const owed = computeRepCommissionOwedByCurrency(rep.id, invoices, settlements, deviceRows);
  const cashHeld = computeRepCashHeldByCurrency(rep.id, invoices, settlements);
  const manual = computeRepManualBalanceByCurrency(rep.id, settlements);
  const devices = accounts.filter((a) => a.representativeId === rep.id);
  const hasOwed = nonZero(owed).some(([, v]) => v > 0);

  const days = panel === "statement" ? buildRepDailyStatement(rep.id, deviceRows, invoices, settlements) : [];
  const canWhatsApp = buildWhatsAppLink(rep.phone) !== null;

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
        <span className="party-stats-currency">أرباح أجهزته (USD)</span>
        <div className="party-stat">
          <span>الربح</span>
          <strong dir="ltr">{formatAmount(deviceTotals.profitUsd)}</strong>
        </div>
        <div className="party-stat party-stat-adjusted">
          <span>حصته</span>
          <strong dir="ltr">{formatAmount(deviceTotals.repShareUsd)}</strong>
        </div>
        <div className="party-stat party-stat-paid">
          <span>حصتي</span>
          <strong dir="ltr">{formatAmount(deviceTotals.ourShareUsd)}</strong>
        </div>
        <div className={`party-stat ${hasOwed ? "party-stat-due" : "party-stat-clear"}`}>
          <span>مستحق له</span>
          <strong dir="ltr">{formatAmount(owed.USD ?? 0)}</strong>
        </div>
      </div>

      <div className="party-chips">
        <span className="party-chip">📡 {devices.length} جهاز</span>
        {deviceTotals.pendingCount > 0 && <span className="party-chip">⏳ {deviceTotals.pendingCount} بانتظار D</span>}
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
        <button type="button" className="party-action party-action-balance" onClick={() => setSheet("settle")}>
          💵 تسوية
        </button>
        {canWhatsApp && (
          <button type="button" className="party-action party-action-whatsapp" onClick={() => setSheet("whatsapp")}>
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
        <button type="button" className="party-action" onClick={onEdit}>
          ✎ تعديل
        </button>
      </div>

      {panel === "statement" && (
        <div className="party-panel">
          <div className="party-panel-tools">
            <PdfButton
              className="party-action party-action-pdf"
              label="🖨️ تصدير الكشف PDF"
              build={() => buildRepStatementPdf(rep, days, deviceTotals, owed, cashHeld, accountName, clientNameFor, storeItems)}
            />
          </div>
          {days.length === 0 ? (
            <p className="party-empty">لا توجد عمليات بعد. تُحتسب حصته من كل عملية جديدة على أجهزته بعد تسديد تكلفة Starlink.</p>
          ) : (
            <div className="rep-days">
              {days.map((day) => (
                <RepDay
                  key={day.date}
                  day={day}
                  accountName={accountName}
                  clientNameFor={clientNameFor}
                  storeItems={storeItems}
                />
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

      {sheet === "settle" && (
        <PartySheet title={`تسوية - ${rep.name}`} onClose={() => setSheet(null)}>
          <SettlementForm
            onCancel={() => setSheet(null)}
            onSubmit={(kind, amount, currencyCode, note) => {
              const error = onSettle(kind, amount, currencyCode, note);
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {sheet === "whatsapp" && (
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

function RepDay({
  day,
  accountName,
  clientNameFor,
  storeItems,
}: {
  day: RepStatementDay;
  accountName: (accountId: string) => string;
  clientNameFor: (accountId: string) => string | undefined;
  storeItems: StoreItemRegistry;
}) {
  return (
    <div className="rep-day">
      <div className="rep-day-head">
        <strong dir="ltr">📅 {day.date}</strong>
        {(Math.abs(day.repShareUsd) > EPSILON || Math.abs(day.ourShareUsd) > EPSILON) && (
          <div className="rep-day-split" dir="ltr">
            <span className="rep-split-rep">حصته {formatAmount(day.repShareUsd)}$</span>
            <span className="rep-split-ours">حصتي {formatAmount(day.ourShareUsd)}$</span>
          </div>
        )}
      </div>
      <ul className="party-statement">
        {day.rows.map((row) => (
          <RepStatementLine
            key={`${row.type}-${row.id}`}
            row={row}
            accountName={accountName}
            clientNameFor={clientNameFor}
            storeItems={storeItems}
          />
        ))}
      </ul>
    </div>
  );
}

function RepStatementLine({
  row,
  accountName,
  clientNameFor,
  storeItems,
}: {
  row: RepStatementRow;
  accountName: (accountId: string) => string;
  clientNameFor: (accountId: string) => string | undefined;
  storeItems: StoreItemRegistry;
}) {
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, ourShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    return (
      <li className="party-statement-row rep-line-device">
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
            <div className="rep-line-calc" dir="ltr">
              <span>بيع {formatAmount(profit.saleValueUsd ?? 0)}$</span>
              <span>− تكلفة {formatAmount(profit.starlinkCostUsd ?? 0)}$</span>
              <span className={(profit.profitUsd ?? 0) >= 0 ? "party-statement-clear" : "party-statement-due"}>
                = ربح {formatAmount(profit.profitUsd ?? 0)}$
              </span>
            </div>
            <div className="rep-day-split" dir="ltr">
              <span className="rep-split-rep">
                حصته ({percent}%) {formatAmount(repShareUsd ?? 0)}$
              </span>
              <span className="rep-split-ours">حصتي {formatAmount(ourShareUsd ?? 0)}$</span>
            </div>
          </>
        ) : (
          <span className="party-statement-note">⏳ بانتظار تسديد تكلفة Starlink (D) - تُحتسب حصته ({percent}%) بعد التسديد</span>
        )}
      </li>
    );
  }
  if (row.type === "invoice") {
    const { invoice, commissionAmount } = row.row;
    const names = invoice.lines.map((l) => getStoreItem(storeItems, l.itemId)?.name).filter(Boolean).join("، ");
    return (
      <li className="party-statement-row rep-line-invoice">
        <div className="party-statement-top">
          <span className="party-statement-kind">🧾 فاتورة متجر{names ? ` · ${names}` : ""}</span>
        </div>
        <div className="rep-day-split" dir="ltr">
          <span className="rep-split-rep">
            عمولته {formatAmount(commissionAmount)} {currencyLabel(invoice.currencyCode)}
          </span>
        </div>
      </li>
    );
  }
  const s = row.settlement;
  return (
    <li className="party-statement-row rep-line-settlement">
      <div className="party-statement-top">
        <span className="party-statement-kind">{SETTLEMENT_LABELS[s.kind]}</span>
        <strong dir="ltr">
          {formatAmount(s.amount)} {currencyLabel(s.currencyCode)}
        </strong>
      </div>
      {s.note && <span className="party-statement-note">{s.note}</span>}
    </li>
  );
}

function SettlementForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (kind: RepSettlementKind, amount: number, currencyCode: string, note: string) => string | null;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<RepSettlementKind>("commissionPayout");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<LedgerCurrency>("USD");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit(kind, Number(amount), currency, note));
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
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          inputMode="decimal"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amount}>
          حفظ العملية
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
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
        type="number"
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
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
): string[] {
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, ourShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    const title = `📡 ${accountName(accountId)}${client ? ` · ${client}` : ""} (${formatAmount(entry.amount)} ${currencyLabel(entry.currency)})`;
    if (profit.status !== "computed") return [row.date, title, `⏳ بانتظار تكلفة Starlink (${percent}%)`, "", ""];
    return [
      row.date,
      title,
      `ربح ${formatAmount(profit.profitUsd ?? 0)}$`,
      `${formatAmount(repShareUsd ?? 0)}$ (${percent}%)`,
      `${formatAmount(ourShareUsd ?? 0)}$`,
    ];
  }
  if (row.type === "invoice") {
    const { invoice, commissionAmount } = row.row;
    const names = invoice.lines.map((l) => getStoreItem(storeItems, l.itemId)?.name).filter(Boolean).join("، ");
    return [row.date, `🧾 فاتورة متجر${names ? ` · ${names}` : ""}`, "", `${formatAmount(commissionAmount)} ${currencyLabel(invoice.currencyCode)}`, ""];
  }
  const s = row.settlement;
  return [row.date, SETTLEMENT_LABELS[s.kind], s.note ?? "", `${formatAmount(s.amount)} ${currencyLabel(s.currencyCode)}`, ""];
}

function buildRepStatementPdf(
  rep: Representative,
  days: RepStatementDay[],
  deviceTotals: RepDeviceTotals,
  owed: Record<string, number>,
  cashHeld: Record<string, number>,
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
): PrintableDocument {
  const rows = days.flatMap((day) => day.rows.map((row) => repRowCells(row, accountName, clientNameFor, storeItems)));
  return {
    title: "كشف حساب مندوب",
    partyName: rep.name,
    partyPhone: rep.phone,
    subtitle: `نسبته ${rep.commissionPercent}%${rep.sharesLosses ? " - يتحمّل نسبته من الخسارة" : ""}`,
    summary: [
      { label: "ربح أجهزته", value: `${formatAmount(deviceTotals.profitUsd)} USD` },
      { label: "حصته", value: `${formatAmount(deviceTotals.repShareUsd)} USD`, tone: "due" },
      { label: "حصتي", value: `${formatAmount(deviceTotals.ourShareUsd)} USD`, tone: "clear" },
      ...nonZero(owed).map(([code, value]) => ({ label: `مستحق له (${currencyLabel(code)})`, value: formatAmount(value), tone: "due" as const })),
      ...nonZero(cashHeld).map(([code, value]) => ({ label: `نقد عنده (${currencyLabel(code)})`, value: formatAmount(value) })),
    ],
    columns: ["التاريخ", "العملية", "التفاصيل", "حصته", "حصتي"],
    rows,
  };
}
