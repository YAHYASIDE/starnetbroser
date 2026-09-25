"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StarlinkAccountSummary } from "@starnet/shared";
import {
  computeRepCashHeldByCurrency,
  computeRepCommissionEarnedByCurrency,
  computeRepCommissionOwedByCurrency,
  computeRepManualBalanceByCurrency,
  createRepresentative,
  CreateRepresentativeInput,
  listRepInvoiceCommissions,
  listRepresentatives,
  loadRepresentativeStore,
  loadRepSettlements,
  recordRepSettlement,
  Representative,
  RepInvoiceCommissionRow,
  RepresentativeStore,
  RepSettlementKind,
  RepSettlementList,
  saveRepresentativeStore,
  saveRepSettlements,
  updateRepresentative,
} from "@/lib/repStore";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { getStoreItem, loadStoreItems, StoreItemRegistry } from "@/lib/storeStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RepresentativesPage() {
  const [representativeStore, setRepresentativeStore] = useState<RepresentativeStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [settlements, setSettlements] = useState<RepSettlementList>([]);
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [openRepId, setOpenRepId] = useState<string | null>(null);

  useEffect(() => {
    setRepresentativeStore(loadRepresentativeStore());
    setInvoices(loadInvoices());
    setSettlements(loadRepSettlements());
    setStoreItems(loadStoreItems());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const representatives = useMemo(() => listRepresentatives(representativeStore), [representativeStore]);

  function handleCreate(input: CreateRepresentativeInput) {
    const result = createRepresentative(representativeStore, input);
    setRepresentativeStore(result.store);
    saveRepresentativeStore(result.store);
    setShowAddForm(false);
    return result.representative;
  }

  function handleUpdate(id: string, input: CreateRepresentativeInput) {
    const next = updateRepresentative(representativeStore, id, input);
    setRepresentativeStore(next);
    saveRepresentativeStore(next);
  }

  function handleSettlement(representativeId: string, kind: RepSettlementKind, amount: number, currencyCode: string, note: string) {
    const result = recordRepSettlement(settlements, {
      representativeId,
      kind,
      amount,
      currencyCode,
      date: todayDateInputValue(),
      note,
    });
    if (!result.ok) return result;
    setSettlements(result.settlements);
    saveRepSettlements(result.settlements);
    return result;
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
        <div className="store-items-header">
          <span />
          <button type="button" className="btn-icon" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? "إلغاء" : "+ إضافة مندوب"}
          </button>
        </div>

        {showAddForm && <RepresentativeForm onSubmit={handleCreate} onCancel={() => setShowAddForm(false)} />}

        {representatives.length === 0 && !showAddForm ? (
          <p className="empty-state">لا يوجد مندوبون بعد.</p>
        ) : (
          <ul className="ledger-entry-list">
            {representatives.map((rep) => {
              const cashHeld = computeRepCashHeldByCurrency(rep.id, invoices, settlements);
              const commissionOwed = computeRepCommissionOwedByCurrency(rep.id, invoices, settlements);
              const manualBalance = computeRepManualBalanceByCurrency(rep.id, settlements);
              const linkedDevices = accounts.filter((a) => a.representativeId === rep.id);
              const isOpen = openRepId === rep.id;
              return (
                <li key={rep.id} className="ledger-entry-row">
                  <div className="ledger-entry-row-top">
                    <span className="store-item-name">{rep.name}</span>
                    <span className="settings-hint" dir="ltr">{rep.commissionPercent}%</span>
                    <button type="button" className="text-action" onClick={() => setOpenRepId(isOpen ? null : rep.id)}>
                      {isOpen ? "إخفاء" : "التفاصيل"}
                    </button>
                  </div>
                  <div className="ledger-entry-row-bottom">
                    {Object.entries(cashHeld)
                      .filter(([, amount]) => Math.abs(amount) > 0.0001)
                      .map(([c, amount]) => (
                        <span key={`cash-${c}`} className="badge badge-yellow" dir="ltr">
                          نقد معه: {formatAmount(amount)} {currencyLabel(c)}
                        </span>
                      ))}
                    {Object.entries(commissionOwed)
                      .filter(([, amount]) => Math.abs(amount) > 0.0001)
                      .map(([c, amount]) => (
                        <span key={`comm-${c}`} className="badge badge-red" dir="ltr">
                          عمولة مستحقة: {formatAmount(amount)} {currencyLabel(c)}
                        </span>
                      ))}
                    {Object.entries(manualBalance)
                      .filter(([, amount]) => Math.abs(amount) > 0.0001)
                      .map(([c, amount]) => (
                        <span key={`manual-${c}`} className={`badge ${amount > 0 ? "badge-yellow" : "badge-red"}`} dir="ltr">
                          {amount > 0 ? "له إضافي" : "عليه"}: {formatAmount(Math.abs(amount))} {currencyLabel(c)}
                        </span>
                      ))}
                    <span className="badge badge-gray">
                      {linkedDevices.length > 0 ? `${linkedDevices.length} جهاز مرتبط` : "لا يوجد جهاز مرتبط"}
                    </span>
                  </div>
                  {isOpen && (
                    <RepresentativeDetail
                      representative={rep}
                      commissionEarned={computeRepCommissionEarnedByCurrency(rep.id, invoices)}
                      invoiceCommissions={listRepInvoiceCommissions(rep.id, invoices)}
                      storeItems={storeItems}
                      linkedDevices={linkedDevices}
                      onUpdate={(input) => handleUpdate(rep.id, input)}
                      onSettle={(kind, amount, currencyCode, note) => handleSettlement(rep.id, kind, amount, currencyCode, note)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

interface RepresentativeFormProps {
  initial?: Representative;
  onSubmit: (input: CreateRepresentativeInput) => void;
  onCancel: () => void;
}

function RepresentativeForm({ initial, onSubmit, onCancel }: RepresentativeFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [commissionPercent, setCommissionPercent] = useState(initial ? String(initial.commissionPercent) : "");
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial?.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial?.phone).localNumber);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !commissionPercent) return;
    const phone = combinePhoneNumber(phoneDialCode, phoneLocalNumber);
    onSubmit({ name, phone: phone || undefined, commissionPercent: Number(commissionPercent) });
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
        placeholder="نسبة العمولة % *"
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
            <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
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

interface RepresentativeDetailProps {
  representative: Representative;
  commissionEarned: Record<string, number>;
  invoiceCommissions: RepInvoiceCommissionRow[];
  storeItems: StoreItemRegistry;
  linkedDevices: StarlinkAccountSummary[];
  onUpdate: (input: CreateRepresentativeInput) => void;
  onSettle: (kind: RepSettlementKind, amount: number, currencyCode: string, note: string) => { ok: boolean; message?: string };
}

function invoiceItemNames(row: RepInvoiceCommissionRow, storeItems: StoreItemRegistry): string {
  const names = row.invoice.lines.map((line) => getStoreItem(storeItems, line.itemId)?.name).filter((n): n is string => Boolean(n));
  return names.length ? names.join("، ") : "—";
}

function RepresentativeDetail({
  representative,
  commissionEarned,
  invoiceCommissions,
  storeItems,
  linkedDevices,
  onUpdate,
  onSettle,
}: RepresentativeDetailProps) {
  const [editing, setEditing] = useState(false);
  const [settleKind, setSettleKind] = useState<RepSettlementKind>("cashHandover");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleCurrency, setSettleCurrency] = useState<LedgerCurrency>("MRU");
  const [settleNote, setSettleNote] = useState("");
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleSuccess, setSettleSuccess] = useState(false);

  function submitSettlement(event: FormEvent) {
    event.preventDefault();
    const amount = Number(settleAmount);
    const result = onSettle(settleKind, amount, settleCurrency, settleNote);
    if (!result.ok) {
      setSettleError(result.message ?? "تعذر تسجيل العملية");
      setSettleSuccess(false);
      return;
    }
    setSettleError(null);
    setSettleSuccess(true);
    setSettleAmount("");
    setSettleNote("");
  }

  if (editing) {
    return (
      <RepresentativeForm
        initial={representative}
        onSubmit={(input) => {
          onUpdate(input);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="store-item-panel">
      <div className="account-card-device-name-row">
        <span className="account-card-label">الهاتف:</span>
        <strong dir="ltr">{representative.phone || "—"}</strong>
        <button type="button" className="text-action" onClick={() => setEditing(true)}>تعديل</button>
      </div>

      <form className="ledger-entry-form" onSubmit={submitSettlement}>
        <select className="search-input" value={settleKind} onChange={(e) => setSettleKind(e.target.value as RepSettlementKind)}>
          <option value="cashHandover">تسليم نقد (استلمته منه)</option>
          <option value="commissionPayout">دفع عمولة (سلّمته له)</option>
          <option value="manualCredit">مبلغ له (مكافأة/إضافي)</option>
          <option value="manualDebit">مبلغ عليه (سلفة)</option>
        </select>
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="المبلغ"
          value={settleAmount}
          onChange={(e) => setSettleAmount(e.target.value)}
        />
        <select className="search-input" value={settleCurrency} onChange={(e) => setSettleCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          className="search-input ledger-note-input"
          type="text"
          placeholder="ملاحظة (اختياري)"
          value={settleNote}
          onChange={(e) => setSettleNote(e.target.value)}
        />
        {settleError && <div className="account-card-alert ledger-form-error">{settleError}</div>}
        {settleSuccess && <p className="settings-hint">تم تسجيل العملية.</p>}
        <button className="dialog-primary" type="submit">
          حفظ العملية
        </button>
      </form>

      <div>
        <p className="account-card-label">الأجهزة المرتبطة به ({linkedDevices.length}):</p>
        {linkedDevices.length === 0 ? (
          <p className="settings-hint">لا يوجد جهاز مرتبط بهذا المندوب - يُربط الجهاز به من بطاقة الجهاز نفسه.</p>
        ) : (
          <ul className="ledger-entry-list">
            {linkedDevices.map((device) => (
              <li key={device.id} className="ledger-entry-row">
                <div className="ledger-entry-row-top">
                  <span className="store-item-name">{device.name}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="account-card-device-name-row">
        <span className="account-card-label">ملخص ربحه:</span>
        <strong dir="ltr">
          {Object.entries(commissionEarned).filter(([, amount]) => Math.abs(amount) > 0.0001).length
            ? Object.entries(commissionEarned)
                .filter(([, amount]) => Math.abs(amount) > 0.0001)
                .map(([c, amount]) => `${formatAmount(amount)} ${currencyLabel(c)}`)
                .join(" + ")
            : "0"}
        </strong>
        <span className="settings-hint">({invoiceCommissions.length} فاتورة)</span>
      </div>

      {invoiceCommissions.length > 0 && (
        <div>
          <p className="account-card-label">ربحه من كل جهاز:</p>
          <ul className="ledger-entry-list">
            {invoiceCommissions.map((row) => (
              <li key={row.invoice.id} className="ledger-entry-row">
                <div className="ledger-entry-row-top">
                  <span className="store-item-name">{invoiceItemNames(row, storeItems)}</span>
                  <span className="settings-hint" dir="ltr">{row.invoice.date}</span>
                </div>
                <div className="ledger-entry-row-bottom">
                  <span className="badge badge-red" dir="ltr">
                    عمولة: {formatAmount(row.commissionAmount)} {currencyLabel(row.invoice.currencyCode)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
