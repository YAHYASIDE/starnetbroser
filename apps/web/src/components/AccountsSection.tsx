"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { CreateSupplierInput, Supplier } from "@/lib/supplierStore";
import {
  computeBalanceByCurrency,
  getAccountEntries,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerByAccount,
  LedgerCurrency,
} from "@/lib/ledgerStore";
import {
  buildPartyStatement,
  computePartyStoreTotals,
  InvoiceKind,
  InvoiceList,
  PartyStoreTotals,
} from "@/lib/invoiceStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { partyHue, partyInitials } from "@/lib/partyColor";
import { buildClientCombinedStatement, computeClientCombinedTotals } from "@/lib/clientAccount";
import { buildStoreDebtReminderMessage, buildStoreStatementMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PartyAdjustment, PartyAdjustmentDirection, RecordPartyAdjustmentInput } from "@/lib/partyBalanceStore";

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

type PartyTab = "clients" | "suppliers";

interface Props {
  clients: Client[];
  suppliers: Supplier[];
  invoices: InvoiceList;
  /** Every Starlink device - a client card lists the ones linked to it (account.clientId). */
  accounts: StarlinkAccountSummary[];
  /** Per-device Starlink subscription ledger - shown on a client's devices panel, always kept
   * visually separate from the store figures (a different business). */
  ledgerStore: LedgerByAccount;
  onCreateClient: (input: CreateClientInput) => void;
  onUpdateClient: (clientId: string, input: CreateClientInput) => void;
  onCreateSupplier: (input: CreateSupplierInput) => void;
  onUpdateSupplier: (supplierId: string, input: CreateSupplierInput) => void;
  /** Manual balance entries ("إضافة رصيد", partyBalanceStore.ts) for every client/supplier. */
  adjustments: PartyAdjustment[];
  /** Returns an error message to show, or null on success. */
  onAddAdjustment: (input: RecordPartyAdjustmentInput) => string | null;
  onDeleteAdjustment: (adjustmentId: string) => void;
}

/** حسابات الزبائن والموردين as a collapsible section of المتجر - the same PartyDirectory the
 * dedicated /clients page shows. */
export function AccountsSection(props: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="section">
      <button type="button" className="report-collapse-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        حسابات الزبائن والموردين {expanded ? "▲" : "▼"}
      </button>
      {expanded && <PartyDirectory {...props} />}
    </section>
  );
}

interface PartyDirectoryProps extends Props {
  /** When given, every client card also offers "بطاقة الزبون" (the full per-device accounting
   * card, ClientDialog). */
  onOpenClientCard?: (client: Client) => void;
}

/** Clients and suppliers on two separate tabs (never one mixed list), each party a colour-coded
 * card with its own invoiced/paid/remaining totals, statement, and - for a client - every linked
 * device. */
export function PartyDirectory({
  clients,
  suppliers,
  invoices,
  accounts,
  ledgerStore,
  onCreateClient,
  onUpdateClient,
  onCreateSupplier,
  onUpdateSupplier,
  adjustments,
  onAddAdjustment,
  onDeleteAdjustment,
  onOpenClientCard,
}: PartyDirectoryProps) {
  const [tab, setTab] = useState<PartyTab>("clients");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);

  const isClients = tab === "clients";
  const kind: InvoiceKind = isClients ? "sale" : "purchase";
  const parties: (Client | Supplier)[] = isClients ? clients : suppliers;

  const rows = useMemo(
    () =>
      parties.map((party) => {
        // A client's totals include every operation on their linked devices, not just the store.
        const totals = isClients
          ? computeClientCombinedTotals(invoices, adjustments, party.id, accounts.filter((a) => a.clientId === party.id), ledgerStore)
          : computePartyStoreTotals(invoices, kind, party.id, adjustments);
        const due = Object.values(totals).some((t) => t.remaining > EPSILON);
        return { party, totals, due };
      }),
    [parties, invoices, kind, adjustments, isClients, accounts, ledgerStore],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? rows.filter((r) => r.party.name.toLowerCase().includes(q) || (r.party.phone ?? "").includes(q))
      : rows;
    // Parties who still owe / are owed first, then alphabetical - the ones needing attention on top.
    return [...matching].sort((a, b) => (a.due === b.due ? a.party.name.localeCompare(b.party.name, "ar") : a.due ? -1 : 1));
  }, [rows, query]);

  const outstandingByCurrency = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const { totals } of rows) {
      for (const [c, t] of Object.entries(totals)) {
        if (t.remaining > EPSILON) sum[c] = (sum[c] ?? 0) + t.remaining;
      }
    }
    return sum;
  }, [rows]);

  function switchTab(next: PartyTab) {
    setTab(next);
    setShowAdd(false);
    setEditingPartyId(null);
    setQuery("");
  }

  const partyWord = isClients ? "زبون" : "مورد";

  return (
    <div className={`party-section party-section-${tab}`}>
      <div className="party-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isClients}
          className={`party-tab party-tab-clients${isClients ? " party-tab-active" : ""}`}
          onClick={() => switchTab("clients")}
        >
          👥 الزبائن <span className="party-tab-count">{clients.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isClients}
          className={`party-tab party-tab-suppliers${!isClients ? " party-tab-active" : ""}`}
          onClick={() => switchTab("suppliers")}
        >
          🏭 الموردون <span className="party-tab-count">{suppliers.length}</span>
        </button>
      </div>

      <div className="party-overview">
        <span className="party-overview-label">{isClients ? "مجموع ما لنا عند الزبائن" : "مجموع ما علينا للموردين"}</span>
        <div className="party-overview-values">
          {Object.keys(outstandingByCurrency).length === 0 ? (
            <strong>لا يوجد مستحق ✓</strong>
          ) : (
            Object.entries(outstandingByCurrency).map(([c, v]) => (
              <strong key={c} dir="ltr">
                {formatAmount(v)} {currencyLabel(c)}
              </strong>
            ))
          )}
        </div>
      </div>

      <div className="party-toolbar">
        <input
          className="search-input"
          placeholder={`ابحث عن ${partyWord} بالاسم أو الهاتف`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn-icon" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "إلغاء" : `+ ${partyWord}`}
        </button>
      </div>

      {showAdd && (
        <PartyForm
          submitLabel={isClients ? "إضافة الزبون" : "إضافة المورد"}
          namePlaceholder={isClients ? "اسم الزبون *" : "اسم المورد *"}
          showCreditLimit={isClients}
          onSubmit={(input) => {
            if (isClients) onCreateClient(input);
            else onCreateSupplier(input);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="empty-state">{query ? "لا توجد نتائج مطابقة." : isClients ? "لا يوجد زبائن بعد." : "لا يوجد موردون بعد."}</p>
      ) : (
        <ul className="party-card-list">
          {filtered.map(({ party, totals }) =>
            editingPartyId === party.id ? (
              <li key={party.id} className="party-card">
                <PartyForm
                  initial={party}
                  submitLabel="حفظ"
                  namePlaceholder={isClients ? "اسم الزبون *" : "اسم المورد *"}
                  showCreditLimit={isClients}
                  onSubmit={(input) => {
                    if (isClients) onUpdateClient(party.id, input);
                    else onUpdateSupplier(party.id, input);
                    setEditingPartyId(null);
                  }}
                  onCancel={() => setEditingPartyId(null)}
                />
              </li>
            ) : (
              <PartyCard
                key={party.id}
                kind={kind}
                party={party}
                totals={totals}
                invoices={invoices}
                adjustments={adjustments}
                onAddAdjustment={onAddAdjustment}
                onDeleteAdjustment={onDeleteAdjustment}
                devices={isClients ? accounts.filter((a) => a.clientId === party.id) : []}
                ledgerStore={ledgerStore}
                creditLimit={isClients ? (party as Client).creditLimit : undefined}
                onEdit={() => setEditingPartyId(party.id)}
                onOpenCard={isClients && onOpenClientCard ? () => onOpenClientCard(party as Client) : undefined}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

interface PartyCardProps {
  kind: InvoiceKind;
  party: { id: string; name: string; phone?: string };
  totals: Record<string, PartyStoreTotals>;
  invoices: InvoiceList;
  adjustments: PartyAdjustment[];
  onAddAdjustment: (input: RecordPartyAdjustmentInput) => string | null;
  onDeleteAdjustment: (adjustmentId: string) => void;
  devices: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  creditLimit?: number;
  onEdit: () => void;
  onOpenCard?: () => void;
}

type PartyPanel = "statement" | "devices" | null;
type PartySheet = "balance" | "whatsapp" | null;

function PartyCard({
  kind,
  party,
  totals,
  invoices,
  adjustments,
  onAddAdjustment,
  onDeleteAdjustment,
  devices,
  ledgerStore,
  creditLimit,
  onEdit,
  onOpenCard,
}: PartyCardProps) {
  const [panel, setPanel] = useState<PartyPanel>(null);
  const [sheet, setSheet] = useState<PartySheet>(null);
  const isClient = kind === "sale";
  const partyKind = isClient ? "client" : "supplier";
  const currencies = Object.keys(totals);
  const remainingByCurrency = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
  const hasDue = Object.values(totals).some((t) => t.remaining > EPSILON);
  const hasCredit = !hasDue && Object.values(totals).some((t) => t.remaining < -EPSILON);
  const overLimit =
    creditLimit !== undefined && Object.values(totals).some((t) => t.remaining > creditLimit + EPSILON);

  const status = hasDue
    ? { className: "party-status-due", label: isClient ? "عليه دين" : "مستحق له" }
    : hasCredit
      ? { className: "party-status-credit", label: isClient ? "له رصيد" : "لنا رصيد عنده" }
      : { className: "party-status-clear", label: "مسدَّد ✓" };

  const statement =
    panel !== "statement"
      ? []
      : isClient
        ? buildClientCombinedStatement(invoices, adjustments, party.id, devices, ledgerStore)
        : buildPartyStatement(invoices, kind, party.id, adjustments);
  const canWhatsApp = buildWhatsAppLink(party.phone) !== null;

  function togglePanel(next: Exclude<PartyPanel, null>) {
    setPanel((current) => (current === next ? null : next));
  }

  function openWhatsApp(message?: string) {
    const link = buildWhatsAppLink(party.phone, message);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setSheet(null);
  }

  function confirmDeleteAdjustment(adjustment: PartyAdjustment) {
    if (window.confirm(`حذف الرصيد ${formatAmount(adjustment.amount)} ${currencyLabel(adjustment.currencyCode)}؟`)) {
      onDeleteAdjustment(adjustment.id);
    }
  }

  return (
    <li
      className={`party-card party-card-${isClient ? "client" : "supplier"}`}
      style={{ "--party-hue": partyHue(party.id) } as CSSProperties}
    >
      <div className="party-card-head">
        <span className="party-avatar" aria-hidden="true">{partyInitials(party.name)}</span>
        <div className="party-card-title">
          <strong>{party.name}</strong>
          <span dir="ltr">{party.phone || "بدون هاتف"}</span>
        </div>
        <span className={`party-status ${status.className}`}>{status.label}</span>
      </div>

      {currencies.length === 0 ? (
        <p className="party-empty">لا توجد فواتير أو أرصدة بعد</p>
      ) : (
        currencies.map((c) => {
          const t = totals[c];
          return (
            <div key={c} className="party-stats">
              <span className="party-stats-currency">{currencyLabel(c)}</span>
              <div className="party-stat">
                <span>{isClient ? "المبيعات" : "المشتريات"}</span>
                <strong dir="ltr">{formatAmount(t.total)}</strong>
              </div>
              <div className="party-stat party-stat-paid">
                <span>{isClient ? "المدفوع" : "دفعنا"}</span>
                <strong dir="ltr">{formatAmount(t.paid)}</strong>
              </div>
              {t.returned > EPSILON && (
                <div className="party-stat party-stat-returned">
                  <span>المرتجع</span>
                  <strong dir="ltr">{formatAmount(t.returned)}</strong>
                </div>
              )}
              {Math.abs(t.adjusted) > EPSILON && (
                <div className="party-stat party-stat-adjusted">
                  <span>رصيد يدوي</span>
                  <strong dir="ltr">
                    {t.adjusted > 0 ? "+" : "-"}
                    {formatAmount(Math.abs(t.adjusted))}
                  </strong>
                </div>
              )}
              <div className={`party-stat ${t.remaining > EPSILON ? "party-stat-due" : "party-stat-clear"}`}>
                <span>{t.remaining < -EPSILON ? (isClient ? "له" : "لنا") : isClient ? "عليه" : "له"}</span>
                <strong dir="ltr">{formatAmount(Math.abs(t.remaining))}</strong>
              </div>
            </div>
          );
        })
      )}

      {(creditLimit !== undefined || (isClient && devices.length > 0)) && (
        <div className="party-chips">
          {isClient && devices.length > 0 && <span className="party-chip">📡 {devices.length} جهاز</span>}
          {creditLimit !== undefined && (
            <span className={`party-chip${overLimit ? " party-chip-alert" : ""}`} dir="ltr">
              {overLimit ? "⚠️ " : ""}سقف الدين: {formatAmount(creditLimit)}
            </span>
          )}
        </div>
      )}

      <div className="party-actions">
        <button
          type="button"
          className={`party-action${panel === "statement" ? " party-action-active" : ""}`}
          onClick={() => togglePanel("statement")}
        >
          📄 الكشف
        </button>
        <button type="button" className="party-action party-action-balance" onClick={() => setSheet("balance")}>
          ➕ رصيد
        </button>
        {canWhatsApp && (
          <button type="button" className="party-action party-action-whatsapp" onClick={() => setSheet("whatsapp")}>
            💬 واتساب
          </button>
        )}
        {isClient && (
          <button
            type="button"
            className={`party-action${panel === "devices" ? " party-action-active" : ""}`}
            onClick={() => togglePanel("devices")}
          >
            📡 الأجهزة ({devices.length})
          </button>
        )}
        {onOpenCard && (
          <button type="button" className="party-action" onClick={onOpenCard}>
            💳 البطاقة
          </button>
        )}
        <button type="button" className="party-action" onClick={onEdit}>
          ✎ تعديل
        </button>
      </div>

      {panel === "statement" && (
        <div className="party-panel">
          {statement.length === 0 ? (
            <p className="party-empty">لا توجد حركات في كشف الحساب</p>
          ) : (
            <ul className="party-statement">
              {statement.map((row) => {
                const adjustment = row.adjustment;
                const kindLabel =
                  row.type === "return"
                    ? "↩ مرتجع"
                    : row.type === "adjustment" && adjustment
                      ? adjustment.direction === "owesUs"
                        ? "➕ رصيد عليه"
                        : "➖ رصيد له"
                      : row.type === "device-charge"
                        ? `📡 شحن - ${row.deviceName ?? ""}`
                        : row.type === "device-payment"
                          ? `💵 دفعة - ${row.deviceName ?? ""}`
                          : isClient
                            ? "🧾 فاتورة بيع (المتجر)"
                            : "🧾 فاتورة شراء";
                return (
                  <li
                    key={row.id}
                    className={`party-statement-row party-statement-${row.type}`}
                  >
                    <div className="party-statement-top">
                      <span className="party-statement-kind">{kindLabel}</span>
                      <span className="party-statement-date" dir="ltr">{row.date}</span>
                    </div>
                    {row.note && <span className="party-statement-note">{row.note}</span>}
                    <div className="party-statement-figures" dir="ltr">
                      <span className={row.delta < 0 ? "party-statement-clear" : undefined}>
                        <bdi dir="ltr">
                          {row.delta < 0 ? "-" : "+"}
                          {formatAmount(row.amount)}
                        </bdi>{" "}
                        {currencyLabel(row.currencyCode)}
                      </span>
                      {row.type === "invoice" && <span className="party-statement-paid">مدفوع {formatAmount(row.paid)}</span>}
                      <span className={row.balanceAfter > EPSILON ? "party-statement-due" : "party-statement-clear"}>
                        الرصيد {formatAmount(row.balanceAfter)}
                      </span>
                      {adjustment && (
                        <button
                          type="button"
                          className="party-statement-delete"
                          onClick={() => confirmDeleteAdjustment(adjustment)}
                          aria-label="حذف الرصيد"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {panel === "devices" && (
        <div className="party-panel">
          <p className="party-panel-note">اشتراكات Starlink - حساب منفصل عن فواتير المتجر</p>
          {devices.length === 0 ? (
            <p className="party-empty">لا يوجد جهاز مرتبط بهذا الزبون - يُربط من بطاقة الجهاز في الصفحة الرئيسية</p>
          ) : (
            <ul className="party-devices">
              {devices.map((device) => {
                const balance = computeBalanceByCurrency(getAccountEntries(ledgerStore, device.id));
                const owed = Object.entries(balance).filter(([, v]) => v !== undefined && Math.abs(v) > EPSILON) as [
                  LedgerCurrency,
                  number,
                ][];
                return (
                  <li key={device.id} className="party-device">
                    <div className="party-device-top">
                      <strong>{device.name}</strong>
                      <span className="party-device-date" dir="ltr">📅 {device.rechargeDate || "—"}</span>
                    </div>
                    <div className="party-device-balances">
                      {owed.length === 0 ? (
                        <span className="badge badge-green">لا يوجد مستحق</span>
                      ) : (
                        owed.map(([c, v]) =>
                          v > 0 ? (
                            <span key={c} className="badge badge-red" dir="ltr">
                              عليه {formatAmount(v)} {currencyLabel(c)}
                            </span>
                          ) : (
                            <span key={c} className="badge badge-green" dir="ltr">
                              له {formatAmount(-v)} {currencyLabel(c)}
                            </span>
                          ),
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {sheet === "balance" && (
        <PartySheet title={`إضافة رصيد - ${party.name}`} onClose={() => setSheet(null)}>
          <BalanceForm
            partyName={party.name}
            onCancel={() => setSheet(null)}
            onSubmit={(input) => {
              const error = onAddAdjustment({ ...input, partyKind, partyId: party.id });
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {sheet === "whatsapp" && (
        <PartySheet title={`واتساب - ${party.name}`} onClose={() => setSheet(null)}>
          <div className="party-sheet-options">
            <button type="button" className="party-sheet-option" onClick={() => openWhatsApp()}>
              <span aria-hidden="true">💬</span>
              <span>
                <strong>مراسلة فقط</strong>
                <small>فتح المحادثة بدون رسالة جاهزة</small>
              </span>
            </button>
            {isClient && (
              <button
                type="button"
                className="party-sheet-option"
                onClick={() => openWhatsApp(buildStoreDebtReminderMessage(party.name, remainingByCurrency))}
              >
                <span aria-hidden="true">🔔</span>
                <span>
                  <strong>تذكير بالدين</strong>
                  <small>{hasDue ? "رسالة بالمبلغ المتبقي وطرق الدفع" : "لا يوجد دين حاليًا - سيُرسل إشعار بعدم وجود مستحق"}</small>
                </span>
              </button>
            )}
            <button
              type="button"
              className="party-sheet-option"
              onClick={() => openWhatsApp(buildStoreStatementMessage(party.name, totals, partyKind))}
            >
              <span aria-hidden="true">📄</span>
              <span>
                <strong>إرسال كشف الحساب</strong>
                <small>الفواتير والمدفوع والمتبقي لكل عملة</small>
              </span>
            </button>
          </div>
        </PartySheet>
      )}
    </li>
  );
}

/** A bottom sheet (fixed to the viewport, never inside the card) - so opening it never makes the
 * card itself any taller. */
export function PartySheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BalanceFormProps {
  partyName: string;
  onCancel: () => void;
  /** Returns an error message, or null on success. */
  onSubmit: (input: {
    direction: PartyAdjustmentDirection;
    amount: number;
    currencyCode: string;
    date: string;
    note?: string;
  }) => string | null;
}

function BalanceForm({ partyName, onCancel, onSubmit }: BalanceFormProps) {
  const [direction, setDirection] = useState<PartyAdjustmentDirection>("owesUs");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>("MRU");
  const [date, setDate] = useState(todayDateInputValue());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit({ direction, amount: Number(amount), currencyCode, date, note }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <div className="party-direction">
        <button
          type="button"
          className={`party-direction-btn party-direction-owes${direction === "owesUs" ? " party-direction-active" : ""}`}
          onClick={() => setDirection("owesUs")}
          aria-pressed={direction === "owesUs"}
        >
          <strong>عليه</strong>
          <small>{partyName} مدين لنا</small>
        </button>
        <button
          type="button"
          className={`party-direction-btn party-direction-we${direction === "weOwe" ? " party-direction-active" : ""}`}
          onClick={() => setDirection("weOwe")}
          aria-pressed={direction === "weOwe"}
        >
          <strong>له</strong>
          <small>دفعة منه أو مبلغ لصالحه</small>
        </button>
      </div>
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
        <select className="search-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <input className="search-input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" placeholder="ملاحظة (اختياري) - مثال: رصيد افتتاحي" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amount}>
          حفظ الرصيد
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

interface PartyFormProps {
  initial?: { name: string; phone?: string; creditLimit?: number };
  submitLabel: string;
  namePlaceholder: string;
  /** Client-only (see Client.creditLimit's own doc) - a credit ceiling only ever applies to money a
   * client can owe US. */
  showCreditLimit?: boolean;
  onSubmit: (input: CreateClientInput) => void;
  onCancel: () => void;
}

function PartyForm({ initial, submitLabel, namePlaceholder, showCreditLimit, onSubmit, onCancel }: PartyFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial?.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial?.phone).localNumber);
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit ? String(initial.creditLimit) : "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      phone: combinePhoneNumber(phoneDialCode, phoneLocalNumber) || undefined,
      creditLimit: showCreditLimit && creditLimit ? Number(creditLimit) : undefined,
    });
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <input className="search-input" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
      {showCreditLimit && (
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="سقف الدين (اختياري)"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
        />
      )}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
