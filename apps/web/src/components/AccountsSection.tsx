"use client";

import { FrancHint } from "./FrancHint";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { byLastActivity, clientLastActivity } from "@/lib/clientActivity";
import { DuplicateWarning } from "./DuplicateWarning";
import { duplicateQuestion, findClientDuplicates } from "@/lib/duplicates";
import { ClientNotesPanel, clientNoteCount } from "./ClientNotesSheet";
import { DateInput } from "./DateInput";
import { ChangeEvent, CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client, clientDeleteQuestion, CreateClientInput } from "@/lib/clientStore";
import { clientRepNames, clientRepIds, matchesClientOwner, type ClientOwnerFilter } from "@/lib/repDebts";
import { currentRepOfClient } from "@/lib/repClients";
import type { RepresentativeStore } from "@/lib/repStore";
import { CreateSupplierInput, Supplier } from "@/lib/supplierStore";
import { loadAccountsBook, methodSource } from "@/lib/moneyAccounts";
import { fitPayMethod, isFrancAccount, methodLabel, PAY_CURRENCIES, PAY_CURRENCY_LABELS, payFormOf, payMethodsFor, toLedgerPayment, type PayCurrency } from "@/lib/payCurrency";
import { getProof } from "@/lib/paymentProofStore";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { renewalDateLabel } from "@/lib/date";
import {
  computeBalanceByCurrency,
  getAccountEntries,
  LEDGER_CURRENCY_LABELS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  LedgerByAccount,
  LedgerCurrency,
} from "@/lib/ledgerStore";
import {
  buildPartyStatement,
  computePartyStoreTotals,
  InvoiceKind,
  InvoiceList,
  PartyStatementRow,
  PartyStoreTotals,
} from "@/lib/invoiceStore";
import { PdfButton } from "./PdfButton";
import { InvoiceEditSheet } from "./InvoiceEditSheet";
import { invoiceLockReason, type InvoiceEditInput } from "@/lib/invoiceEdit";
import { buildPartyStatementPdf, statementKindLabel } from "@/lib/partyStatementPdf";
import { buildStatementData, statementNetView } from "@/lib/statementDocument";
import { StatementImageButton } from "./StatementImageButton";
import { filterMovements, MOVEMENT_FILTERS, movementView, type MovementFilter } from "@/lib/partyMovements";
import {
  addCategory,
  BUILT_IN_CATEGORIES,
  CATEGORY_COLORS,
  categoriesOf,
  categoryCounts,
  loadClientCategories,
  matchesStanding,
  removeCategory,
  saveClientCategories,
  STANDING_FILTERS,
  STARLINK,
  type ClientCategory,
  type StandingFilter,
} from "@/lib/clientCategories";

import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";
import { partyHue, partyInitials } from "@/lib/partyColor";
import { buildClientCombinedStatement, computeClientCombinedTotals } from "@/lib/clientAccount";
import { buildStoreDebtReminderMessage, buildStoreStatementMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PartyAdjustment, partyAdjustmentCashKind, PartyAdjustmentDirection, PartyKind, RecordPartyAdjustmentInput } from "@/lib/partyBalanceStore";
import { DefaultCurrencyField } from "./CurrencyGuard";
import { autoCurrencyOf } from "@/lib/partyCurrency";
import { foreignRateFromQuote, partyNetIn, partyStanding, type PairQuote, type PartyNet } from "@/lib/partyNet";
import { getCurrency, loadCurrencyStore, saveCurrencyStore, setCurrencyRate } from "@/lib/currencyStore";
import { loadPartyCurrencyContext } from "@/lib/partyCurrencyData";

const EPSILON = 0.0001;
/** 🏷️ A new customer as his Oct 19 2026 form gives it: his categories, his rep, and «حفظ وإضافة جهاز». */
export type NewClientInput = CreateClientInput & { repId?: string; addDevice?: boolean };

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
  onCreateClient: (input: NewClientInput) => void;
  onUpdateClient: (clientId: string, input: CreateClientInput) => void;
  onCreateSupplier: (input: CreateSupplierInput) => void;
  onUpdateSupplier: (supplierId: string, input: CreateSupplierInput) => void;
  /** Manual balance entries ("إضافة رصيد", partyBalanceStore.ts) for every client/supplier. */
  adjustments: PartyAdjustment[];
  /** Returns an error message to show, or null on success. `proofDataUrl` (optional) is a payment
   * photo to save keyed by the new adjustment's id. */
  onAddAdjustment: (input: RecordPartyAdjustmentInput, proofDataUrl?: string) => string | null;
  onDeleteAdjustment: (adjustmentId: string) => void;
  /** A client's payment for one of their devices ("الدفعة عن" in إضافة رصيد) - recorded in that
   * device's own ledger. Returns an error message, or null on success. */
  onAddDevicePayment?: (deviceId: string, input: Omit<BalanceFormInput, "deviceId">) => string | null;
  /** Edits a balance entry. Returns an error message, or null on success. `proofDataUrl` replaces
   * the saved photo when given. */
  onUpdateAdjustment?: (adjustmentId: string, input: Omit<BalanceFormInput, "deviceId">, proofDataUrl?: string) => string | null;
  /** Turns a general "له" balance entry into a payment on one of the client's devices. */
  onMoveAdjustmentToDevice?: (adjustmentId: string, deviceId: string, input: Omit<BalanceFormInput, "deviceId">) => string | null;
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
  /** When given, a client's edit form offers "حذف الزبون" (the page unlinks their devices). */
  onDeleteClient?: (clientId: string) => void;
  /** Representatives - a client whose devices belong to a rep shows that rep's name on the card. */
  representatives?: RepresentativeStore;
  /** 👥 «☑️ تحديد» on the clients tab: delete, zero the accounts of, or start the profit from zero
   * for the chosen clients (one, several or all). The page asks before each. */
  bulk?: {
    onDelete: (ids: string[]) => void;
    onZero: (ids: string[]) => void;
    onProfitFresh: (ids: string[]) => void;
    onProfitClear: (ids: string[]) => void;
    /** Clients whose profit already starts from zero (clientBulk.ts). */
    profitFreshIds: Set<string>;
  };
  /** 📡 A device tapped in a customer's «الأجهزة» opens its full card right there (his Oct 2026
   * request). Absent = the list only. */
  renderDevice?: (device: StarlinkAccountSummary) => React.ReactNode;
  /** 🗑 Deletes a device operation from a customer's statement (his Oct 2026 request) - true once
   * deleted (the caller asks first). */
  onDeleteDeviceEntry?: (entryId: string) => boolean;
  /** ✎ Edits a device operation from a customer's statement, in the device's own operation dialog. */
  onEditDeviceEntry?: (entryId: string) => void;
  /** ✎ / 🗑 A store invoice from a customer's statement (lib/invoiceEdit.ts) - an error, or null once saved. */
  onEditInvoice?: (invoiceId: string, input: InvoiceEditInput) => string | null;
  onDeleteInvoice?: (invoiceId: string) => string | null;
  /** 💵 The page's «دفعة من زبون», shown beside «＋ إضافة زبون». */
  headerAction?: React.ReactNode;
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
  onAddDevicePayment,
  onUpdateAdjustment,
  onMoveAdjustmentToDevice,
  onOpenClientCard,
  onDeleteClient,
  representatives,
  bulk,
  renderDevice,
  onDeleteDeviceEntry,
  onEditDeviceEntry,
  onEditInvoice,
  onDeleteInvoice,
  headerAction,
}: PartyDirectoryProps) {
  const [tab, setTab] = useState<PartyTab>("clients");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  // 👤 / 🤝 whose customers are shown (repDebts.ts) - clients tab only. «زبائني» first and default
  // (his choice): he works with his own customers most, reps' customers are the exception.
  const [owner, setOwner] = useState<ClientOwnerFilter>("mine");
  // 🏷️ His Oct 19 2026 design: a category row (الكل / ستارلينك / عام / his own) and «تصفية» (whose · standing).
  const [balance, setBalance] = useState<StandingFilter>("all");
  const [category, setCategory] = useState<string>("all");
  // Hidden on opening (his choice); ☰ shows a count when a filter differs from the default.
  const [showFilters, setShowFilters] = useState(false);
  const [categoryList, setCategoryList] = useState<ClientCategory[]>([]);
  const [categorySheet, setCategorySheet] = useState(false);
  useEffect(() => setCategoryList(loadClientCategories()), []);
  function commitCategories(next: ClientCategory[]) {
    setCategoryList(next);
    saveClientCategories(next);
  }

  const isClients = tab === "clients";
  const kind: InvoiceKind = isClients ? "sale" : "purchase";
  const parties: (Client | Supplier)[] = isClients ? clients : suppliers;
  // ⚖️ «الصافي بعملته»: today's rates and each party's own currency (partyNet.ts), read once.
  const [ratesVersion, setRatesVersion] = useState(0);
  const netContext = useMemo(() => {
    if (typeof window === "undefined") return null;
    const store = loadCurrencyStore();
    return { rateOf: (code: string) => getCurrency(store, code)?.rateFromUsd, parties: loadPartyCurrencyContext() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratesVersion]);
  /** ✎ His rate «1,000 سيفا = 3,600 أوقية» from the net line: the registry's rate of that currency, going
   * forward only (records keep their locked rates). */
  const setPairRate = (quote: PairQuote) => {
    const store = loadCurrencyStore();
    const mru = getCurrency(store, "MRU")?.rateFromUsd;
    if (!mru || !(quote.mru > 0)) return;
    saveCurrencyStore(setCurrencyRate(store, quote.foreign, foreignRateFromQuote(quote, mru)));
    setRatesVersion((v) => v + 1);
  };
  const netFor = (party: Client | Supplier, totals: Record<string, PartyStoreTotals>): PartyNet | null => {
    if (!netContext) return null;
    const remaining = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
    const base = isClients ? ((party as Client).defaultCurrency ?? autoCurrencyOf("client", party.id, netContext.parties) ?? "MRU") : "MRU";
    return partyNetIn(remaining, base, netContext.rateOf);
  };

  const rows = useMemo(
    () =>
      parties.map((party) => {
        // A client's totals include every operation on their linked devices, not just the store.
        const totals = isClients
          ? computeClientCombinedTotals(invoices, adjustments, party.id, accounts.filter((a) => a.clientId === party.id), ledgerStore)
          : computePartyStoreTotals(invoices, kind, party.id, adjustments);
        // ⚖️ «عليهم دين» follows the net in his currency when he has 2+ currencies.
        const standing = partyStanding(Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining])), netFor(party, totals));
        const due = standing === "due";
        const categories = isClients
          ? categoriesOf(
              {
                deviceCount: accounts.filter((a) => a.clientId === party.id && !a.deletedAt).length,
                hasStoreRecords: invoices.some((i) => i.clientId === party.id),
                tags: (party as Client).categories,
              },
              categoryList,
            )
          : [];
        const repIds = isClients ? clientRepIds(party.id, accounts, party as Client) : [];
        // 🕒 His latest operation or edit - the customer on top is the last one worked on.
        const activity = isClients
          ? clientLastActivity({
              client: party,
              entries: accounts.filter((a) => a.clientId === party.id).flatMap((a) => ledgerStore[a.id] ?? []),
              invoices: invoices.filter((i) => i.clientId === party.id),
              adjustments: adjustments.filter((a) => a.partyKind === "client" && a.partyId === party.id),
            })
          : "";
        return { party, totals, due, standing, categories, repIds, activity };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parties, invoices, kind, adjustments, isClients, accounts, ledgerStore, netContext, categoryList],
  );
  const ownerRows = useMemo(() => (isClients ? rows.filter((r) => matchesClientOwner(r.repIds, owner)) : rows), [rows, owner, isClients]);
  /** «🤝 فلان» chips: every rep with at least one customer, with how many. */
  const repChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const id of r.repIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, count, name: representatives?.[id]?.name ?? "مندوب" }));
  }, [rows, representatives]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let matching = q
      ? ownerRows.filter((r) => r.party.name.toLowerCase().includes(q) || (r.party.phone ?? "").includes(q))
      : ownerRows;
    // 🏷️ The category, then the standing (مدينون لنا / لهم رصيد / حساب متوازن).
    if (isClients && category !== "all") matching = matching.filter((r) => r.categories.includes(category));
    if (isClients) matching = matching.filter((r) => matchesStanding(r.standing, balance));
    // Customers: the last one worked on first (his Oct 2026 choice). Suppliers: who still owe / are
    // owed first, then alphabetical.
    if (isClients) return [...matching].sort((a, b) => byLastActivity({ activity: a.activity, name: a.party.name }, { activity: b.activity, name: b.party.name }));
    return [...matching].sort((a, b) => (a.due === b.due ? a.party.name.localeCompare(b.party.name, "ar") : a.due ? -1 : 1));
  }, [ownerRows, query, isClients, balance, category]);
  const counts = useMemo(() => categoryCounts(ownerRows), [ownerRows]);

  // The summary follows the category and the filters chosen (his design).
  const outstandingByCurrency = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const { totals } of isClients ? filtered : ownerRows) {
      for (const [c, t] of Object.entries(totals)) {
        if (t.remaining > EPSILON) sum[c] = (sum[c] ?? 0) + t.remaining;
      }
    }
    return sum;
  }, [ownerRows, filtered, isClients]);

  function switchTab(next: PartyTab) {
    setTab(next);
    setSelecting(false);
    setSelected(new Set());
    setShowAdd(false);
    setEditingPartyId(null);
    setQuery("");
    setOwner("mine");
    setBalance("all");
    setCategory("all");
  }

  const partyWord = isClients ? "زبون" : "مورد";
  const activeFilters = isClients ? (owner !== "mine" ? 1 : 0) + (balance !== "all" ? 1 : 0) : 0;

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

      <div className="party-head-actions">
        <button type="button" className="party-add-button" onClick={() => setShowAdd(true)}>
          {isClients ? "＋ إضافة زبون" : "＋ إضافة مورد"}
        </button>
        {isClients && headerAction}
      </div>

      <div className="party-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder={`🔍 ابحث عن ${partyWord} بالاسم أو الهاتف`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isClients && (
          <button
            type="button"
            className={`btn-icon party-filter-btn${showFilters ? " is-active" : ""}${activeFilters ? " has-filters" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-label={activeFilters ? `تصفية (${activeFilters} مفعّلة)` : "تصفية"}
            aria-expanded={showFilters}
            title="تصفية"
          >
            ☰ تصفية
            {activeFilters > 0 && <span className="party-filter-badge">{activeFilters}</span>}
          </button>
        )}
        {isClients && bulk && (
          <button
            type="button"
            className={`btn-icon${selecting ? " is-active" : ""}`}
            onClick={() => {
              setSelecting((v) => !v);
              setSelected(new Set());
            }}
            title="تحديد"
          >
            {selecting ? "إنهاء" : "☑️"}
          </button>
        )}
      </div>

      {isClients && (
        <div className="party-category-chips" role="radiogroup" aria-label="التصنيف">
          {[
            { id: "all", label: "الكل", icon: "", color: "" },
            ...BUILT_IN_CATEGORIES.map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color })),
            ...categoryList.map((c) => ({ id: c.id, label: c.name, icon: "🏷️", color: c.color })),
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="radio"
              aria-checked={category === chip.id}
              className={`party-category-chip${category === chip.id ? " is-active" : ""}`}
              style={chip.color ? ({ "--chip": chip.color } as CSSProperties) : undefined}
              onClick={() => {
                setCategory(chip.id);
                setSelected(new Set());
              }}
            >
              {chip.icon && <span aria-hidden="true">{chip.icon} </span>}
              {chip.label} <span className="party-tab-count">{counts[chip.id] ?? 0}</span>
            </button>
          ))}
          <button type="button" className="party-category-chip party-category-add" onClick={() => setCategorySheet(true)}>
            ＋ تصنيف
          </button>
        </div>
      )}

      {isClients && showFilters && (
        <div className="party-filter-row">
          <select
            className="search-input"
            aria-label="زبائن من"
            value={typeof owner === "string" ? owner : `rep:${owner.repId}`}
            onChange={(e) => {
              const v = e.target.value;
              setOwner(v.startsWith("rep:") ? { repId: v.slice(4) } : (v as ClientOwnerFilter));
              setSelected(new Set());
            }}
          >
            <option value="mine">👤 زبائني ({rows.filter((r) => r.repIds.length === 0).length})</option>
            <option value="all">الكل ({rows.length})</option>
            {repChips.length > 0 && <option value="reps">🤝 زبائن المندوبين ({rows.filter((r) => r.repIds.length > 0).length})</option>}
            {repChips.map((c) => (
              <option key={c.id} value={`rep:${c.id}`}>
                🤝 {c.name} ({c.count})
              </option>
            ))}
          </select>
          <select className="search-input" aria-label="الحالة" value={balance} onChange={(e) => setBalance(e.target.value as StandingFilter)}>
            {STANDING_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                الحالة: {f.label}
              </option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button
              type="button"
              className="text-action party-filter-clear"
              onClick={() => {
                setOwner("mine");
                setBalance("all");
                setSelected(new Set());
              }}
            >
              ↺ مسح التصفية
            </button>
          )}
        </div>
      )}

      <div className="party-overview">
        <span className="party-overview-label">
          {!isClients ? "مجموع ما علينا للموردين" : "إجمالي ما لنا في الاختيار المحدد"}
        </span>
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
        {isClients && <span className="party-overview-count">عرض {filtered.length} زبون</span>}
      </div>

      {categorySheet && (
        <CategorySheet
          list={categoryList}
          onAdd={(name, color) => {
            const result = addCategory(categoryList, name, color);
            if (!result.ok) return result.message;
            commitCategories(result.list);
            return null;
          }}
          onRemove={(id) => {
            if (!window.confirm("حذف هذا التصنيف؟ لا يُحذف أي زبون ولا أي حساب - يُزال التصنيف فقط.")) return;
            commitCategories(removeCategory(categoryList, id));
            if (category === id) setCategory("all");
          }}
          onClose={() => setCategorySheet(false)}
        />
      )}

      {isClients && bulk && selecting && (() => {
        const ids = [...selected];
        const allShown = filtered.length > 0 && filtered.every((r) => selected.has(r.party.id));
        const run = (fn: (ids: string[]) => void) => {
          if (!ids.length) return;
          fn(ids);
          setSelected(new Set());
        };
        return (
          <div className="party-bulk-bar">
            <button
              type="button"
              className="text-action"
              onClick={() => setSelected(allShown ? new Set() : new Set(filtered.map((r) => r.party.id)))}
            >
              {allShown ? "إلغاء الكل" : `تحديد الكل (${filtered.length})`}
            </button>
            <span className="party-bulk-count">المحدد: {ids.length}</span>
            <div className="party-bulk-actions">
              <button type="button" disabled={!ids.length} onClick={() => run(bulk.onZero)}>0️⃣ تصفير الحساب</button>
              <button type="button" disabled={!ids.length} onClick={() => run(bulk.onProfitFresh)}>📈 الأرباح من 0</button>
              <button type="button" disabled={!ids.length} onClick={() => run(bulk.onProfitClear)}>↩️ إرجاع الأرباح</button>
              <button type="button" className="danger" disabled={!ids.length} onClick={() => run(bulk.onDelete)}>🗑️ حذف</button>
            </div>
          </div>
        );
      })()}

      {showAdd && (
        <PartySheet title={isClients ? "＋ زبون جديد" : "＋ مورد جديد"} onClose={() => setShowAdd(false)}>
          <PartyForm
            inSheet
            submitLabel={isClients ? "حفظ الزبون" : "حفظ المورد"}
            existing={parties}
            namePlaceholder={isClients ? "اسم الزبون *" : "اسم المورد *"}
            showCreditLimit={isClients}
            categories={isClients ? categoryList : undefined}
            // The category open now is ticked (his choice); «الكل» ticks none.
            initialCategories={isClients && category !== "all" ? [category] : []}
            reps={isClients && representatives ? Object.values(representatives).map((r) => ({ id: r.id, name: r.name })) : undefined}
            onSubmit={(input) => {
              if (isClients) onCreateClient(input);
              else onCreateSupplier(input);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </PartySheet>
      )}

      {filtered.length === 0 ? (
        <p className="empty-state">{query ? "لا توجد نتائج مطابقة." : isClients && owner !== "all" ? "لا زبائن في هذا الاختيار." : isClients ? "لا يوجد زبائن بعد." : "لا يوجد موردون بعد."}</p>
      ) : isClients && bulk && selecting ? (
        <ul className="party-select-list">
          {filtered.map(({ party, totals }) => {
            const owed = Object.entries(totals).filter(([, t]) => Math.abs(t.remaining) > EPSILON);
            return (
              <li key={party.id} className={`party-select-row${selected.has(party.id) ? " is-selected" : ""}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(party.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(party.id)) next.delete(party.id);
                        else next.add(party.id);
                        return next;
                      })
                    }
                  />
                  <span className="party-select-name">{party.name}</span>
                  {bulk.profitFreshIds.has(party.id) && <span className="badge badge-gray">📈 من 0</span>}
                  <span className="party-select-balance">
                    {owed.length === 0
                      ? "0"
                      : owed.map(([c, t]) => (
                          <bdi key={c} dir="ltr">
                            {formatAmount(t.remaining)} {currencyLabel(c)}
                          </bdi>
                        ))}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="party-card-list">
          {filtered.map(({ party, totals }) =>
            editingPartyId === party.id ? (
              <li key={party.id} className="party-card">
                <PartyForm
                  initial={party}
                  submitLabel="حفظ"
                  existing={parties}
                  selfId={party.id}
                  namePlaceholder={isClients ? "اسم الزبون *" : "اسم المورد *"}
                  showCreditLimit={isClients}
                  categories={isClients ? categoryList : undefined}
                  initialCategories={isClients ? ((party as Client).categories ?? []) : []}
                  onSubmit={(input) => {
                    if (isClients) onUpdateClient(party.id, input);
                    else onUpdateSupplier(party.id, input);
                    setEditingPartyId(null);
                  }}
                  onCancel={() => setEditingPartyId(null)}
                  onDelete={
                    isClients && onDeleteClient
                      ? async () => {
                          const remaining = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
                          const linked = accounts.filter((a) => a.clientId === party.id).length;
                          if (!(await askDeleteCode(clientDeleteQuestion(party.name, linked, remaining, currencyLabel)))) return;
                          onDeleteClient(party.id);
                          setEditingPartyId(null);
                        }
                      : undefined
                  }
                />
              </li>
            ) : (
              <PartyCard
                key={party.id}
                kind={kind}
                party={party}
                totals={totals}
                net={netFor(party, totals)}
                onSetPairRate={setPairRate}
                invoices={invoices}
                adjustments={adjustments}
                onAddAdjustment={onAddAdjustment}
                onDeleteAdjustment={onDeleteAdjustment}
                onAddDevicePayment={onAddDevicePayment}
                onUpdateAdjustment={onUpdateAdjustment}
                onMoveAdjustmentToDevice={onMoveAdjustmentToDevice}
                devices={isClients ? accounts.filter((a) => a.clientId === party.id && !a.deletedAt) : []}
                ledgerStore={ledgerStore}
                creditLimit={isClients ? (party as Client).creditLimit : undefined}
                repNames={isClients && representatives ? clientRepNames(party.id, accounts, representatives, party as Client) : []}
                categoryChips={
                  isClients
                    ? (rows.find((r) => r.party.id === party.id)?.categories ?? [])
                        .filter((id) => id !== STARLINK)
                        .map((id) => [...BUILT_IN_CATEGORIES, ...categoryList].find((c) => c.id === id))
                        .filter((c): c is ClientCategory => Boolean(c))
                    : []
                }
                onEdit={() => setEditingPartyId(party.id)}
                onOpenCard={isClients && onOpenClientCard ? () => onOpenClientCard(party as Client) : undefined}
                renderDevice={isClients ? renderDevice : undefined}
                onDeleteDeviceEntry={isClients ? onDeleteDeviceEntry : undefined}
                onEditDeviceEntry={isClients ? onEditDeviceEntry : undefined}
                onEditInvoice={onEditInvoice}
                onDeleteInvoice={onDeleteInvoice}
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
  /** ⚖️ His balances in several currencies as one figure in his own currency (partyNet.ts). */
  net?: PartyNet | null;
  /** ✎ Sets «1,000 سيفا = X أوقية» (the registry's rate, from now on). */
  onSetPairRate?: (quote: PairQuote) => void;
  invoices: InvoiceList;
  adjustments: PartyAdjustment[];
  onAddAdjustment: Props["onAddAdjustment"];
  onDeleteAdjustment: (adjustmentId: string) => void;
  onAddDevicePayment?: Props["onAddDevicePayment"];
  onUpdateAdjustment?: Props["onUpdateAdjustment"];
  onMoveAdjustmentToDevice?: Props["onMoveAdjustmentToDevice"];
  devices: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  creditLimit?: number;
  /** The reps of this client's devices - shown as a tag at the top of the card. */
  repNames?: string[];
  /** 🏷️ His categories besides 📡 (that one is the device count chip). */
  categoryChips?: ClientCategory[];
  onEdit: () => void;
  onOpenCard?: () => void;
  renderDevice?: (device: StarlinkAccountSummary) => React.ReactNode;
  onDeleteDeviceEntry?: (entryId: string) => boolean;
  onEditDeviceEntry?: (entryId: string) => void;
  onEditInvoice?: PartyDirectoryProps["onEditInvoice"];
  onDeleteInvoice?: PartyDirectoryProps["onDeleteInvoice"];
}

type PartyPanel = "statement" | "devices" | null;
type PartySheet = "balance" | "whatsapp" | "detail" | "edit" | "notes" | "export" | "invoice" | null;

const PROFIT_KEY = "starnet.statementShowProfit";

/** A card action: the icon over a tiny label (and a count badge) - one short row of buttons. */
export function ActionFace({ icon, label, count }: { icon: string; label: string; count?: number }) {
  return (
    <>
      <span className="party-action-icon" aria-hidden="true">
        {icon}
        {count ? <span className="party-action-count">{count}</span> : null}
      </span>
      <span className="party-action-label">{label}</span>
    </>
  );
}

function PartyCard({
  kind,
  party,
  totals,
  net,
  onSetPairRate,
  invoices,
  adjustments,
  onAddAdjustment,
  onDeleteAdjustment,
  onAddDevicePayment,
  onUpdateAdjustment,
  onMoveAdjustmentToDevice,
  devices,
  ledgerStore,
  creditLimit,
  repNames = [],
  categoryChips = [],
  onEdit,
  onOpenCard,
  renderDevice,
  onDeleteDeviceEntry,
  onEditDeviceEntry,
  onEditInvoice,
  onDeleteInvoice,
}: PartyCardProps) {
  const [panel, setPanel] = useState<PartyPanel>(null);
  // 📡 The device opened from «الأجهزة» (its card shows in place of the list).
  const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
  const openDevice = openDeviceId ? devices.find((d) => d.id === openDeviceId) : undefined;
  const [sheet, setSheet] = useState<PartySheet>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const isClient = kind === "sale";
  const [noteCount, setNoteCount] = useState(0);
  useEffect(() => {
    if (isClient) setNoteCount(clientNoteCount(party.id));
  }, [isClient, party.id]);
  const partyKind: PartyKind = isClient ? "client" : "supplier";
  const currencies = Object.keys(totals);
  const remainingByCurrency = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
  // ⚖️ 2+ currencies: the net in his currency decides (32,000 سيفا عليه ↔ 118,400 أوقية له = متعادل).
  const standing = partyStanding(remainingByCurrency, net ?? null);
  const hasDue = standing === "due";
  const hasCredit = standing === "credit";
  const overLimit =
    creditLimit !== undefined && Object.values(totals).some((t) => t.remaining > creditLimit + EPSILON);

  // A representative's own customer (repClients.ts) owes HIM - "settled" would be wrong here.
  const ownedByRep = isClient && Boolean(currentRepOfClient(party as Client));
  const status = hasDue
    ? { className: "party-status-due", label: isClient ? "عليه دين" : "مستحق له" }
    : hasCredit
      ? { className: "party-status-credit", label: isClient ? "له رصيد" : "لنا رصيد عنده" }
      : ownedByRep
        ? { className: "party-status-credit", label: "🤝 عند المندوب" }
        : { className: "party-status-clear", label: "مسدَّد ✓" };

  const fullStatement = () =>
    isClient ? buildClientCombinedStatement(invoices, adjustments, party.id, devices, ledgerStore) : buildPartyStatement(invoices, kind, party.id, adjustments);
  const statement = panel !== "statement" ? [] : fullStatement();
  // 📄 His Oct 19 2026 design: each movement in three fixed columns, filtered and searchable (lib/partyMovements.ts).
  const [moveFilter, setMoveFilter] = useState<MovementFilter>("all");
  const [moveQuery, setMoveQuery] = useState("");
  const [moveSearch, setMoveSearch] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showProfit, setShowProfit] = useState(() => {
    try {
      return window.localStorage.getItem(PROFIT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  function toggleProfit() {
    setShowProfit((v) => {
      try {
        window.localStorage.setItem(PROFIT_KEY, v ? "0" : "1");
      } catch {
        // per-viewer convenience only
      }
      return !v;
    });
  }
  const movements = filterMovements(
    statement.map((row) =>
      movementView(row, {
        isClient,
        emailOf: (id) => {
          const d = devices.find((x) => x.id === id);
          return d?.expectedEmail || d?.starlinkAccountEmail || undefined;
        },
        entryOf: (id, entryId) => getAccountEntries(ledgerStore, id).find((e) => e.id === entryId),
      }),
    ),
    moveFilter,
    moveQuery,
  );
  function copyEmail(id: string, email: string) {
    void navigator.clipboard?.writeText(email).catch(() => undefined);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }
  const canWhatsApp = buildWhatsAppLink(party.phone) !== null;
  const deviceNames = devices.map((d) => d.name.trim()).filter(Boolean);

  const detailRow = detailRowId ? statement.find((r) => r.id === detailRowId) : undefined;
  function confirmDeleteAdjustment(adjustment: PartyAdjustment) {
    if (window.confirm(`حذف الرصيد ${formatAmount(adjustment.amount)} ${currencyLabel(adjustment.currencyCode)}؟`)) {
      onDeleteAdjustment(adjustment.id);
      setSheet(null);
    }
  }
  function openDetail(rowId: string) {
    setDetailRowId(rowId);
    setSheet("detail");
  }
  /** ✎ on a movement (his Oct 20 2026 choice): straight to its edit - and delete - of whatever kind it is. */
  function editAction(row: PartyStatementRow): (() => void) | undefined {
    if (row.adjustment) return () => (setDetailRowId(row.id), setSheet("edit"));
    if ((row.type === "device-charge" || row.type === "device-payment") && onEditDeviceEntry) return () => onEditDeviceEntry(row.id);
    if ((row.type === "invoice" || row.type === "return") && row.invoice && onEditInvoice && onDeleteInvoice) return () => (setDetailRowId(row.id), setSheet("invoice"));
    return undefined;
  }

  function togglePanel(next: Exclude<PartyPanel, null>) {
    setPanel((current) => (current === next ? null : next));
  }

  function openWhatsApp(message?: string) {
    const link = buildWhatsAppLink(party.phone, message);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setSheet(null);
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
          <span className="party-card-sub">
            <bdi dir="ltr">{party.phone || "بدون هاتف"}</bdi>
            {isClient && devices.length > 0 && <span className="party-mini-chip">📡 {devices.length}</span>}
            {categoryChips.map((c) => (
              <span key={c.id} className="party-category-tag" style={{ "--chip": c.color } as CSSProperties}>
                {c.name}
              </span>
            ))}
            {repNames.length > 0 && (
              <span className="party-rep-tag" title="مندوب أجهزة هذا الزبون">
                🤝 {repNames.join("، ")}
              </span>
            )}
          </span>
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
                <button
                  type="button"
                  className="party-stat party-stat-adjusted party-stat-button"
                  title="أرصدة سُجّلت يدويًا (رصيد سابق، تصحيح…) - اضغط لتراها"
                  onClick={() => {
                    setPanel("statement");
                    setMoveFilter("adjust");
                  }}
                >
                  <span>تسوية رصيد</span>
                  <strong dir="ltr">
                    {t.adjusted > 0 ? "+" : "-"}
                    {formatAmount(Math.abs(t.adjusted))}
                  </strong>
                </button>
              )}
              <div className={`party-stat ${t.remaining > EPSILON ? "party-stat-due" : "party-stat-clear"}`}>
                <span>{t.remaining < -EPSILON ? (isClient ? "المتبقي له" : "المتبقي لنا") : isClient ? "المتبقي عليه" : "المتبقي له"}</span>
                <strong dir="ltr">{formatAmount(Math.abs(t.remaining))}</strong>
              </div>
            </div>
          );
        })
      )}

      {net && (
        <div className={`party-net ${net.amount > 0.005 ? "party-net-due" : "party-net-clear"}`}>
          <span>⚖️ الصافي بعملته ({currencyLabel(net.currency)})</span>
          <strong>
            {Math.abs(net.amount) < 0.005 ? "متعادل" : `${net.amount > 0 ? (isClient ? "عليه" : "له") : isClient ? "له" : "لنا"} `}
            {Math.abs(net.amount) >= 0.005 && <bdi dir="ltr">{formatAmount(Math.abs(net.amount))}</bdi>}
          </strong>
          {net.converted.map((c) => (
            <small key={c.currency}>
              <bdi dir="ltr">{formatAmount(Math.abs(c.amount))}</bdi> {currencyLabel(c.currency)} ≈ <bdi dir="ltr">{formatAmount(Math.abs(c.inBase))}</bdi> {currencyLabel(net.currency)}
              {c.quote && (
                <PairRateEdit quote={c.quote} onSave={onSetPairRate} />
              )}
            </small>
          ))}
        </div>
      )}

      {creditLimit !== undefined && (
        <div className="party-chips">
          <span className={`party-chip${overLimit ? " party-chip-alert" : ""}`}>
            {overLimit ? "⚠️ " : ""}سقف الدين: <bdi dir="ltr">{formatAmount(creditLimit)}</bdi>
          </span>
        </div>
      )}

      <div className="party-actions">
        <button
          type="button"
          className={`party-action${panel === "statement" ? " party-action-active" : ""}`}
          onClick={() => togglePanel("statement")}
        >
          <ActionFace icon="📄" label="الكشف" />
        </button>
        <button type="button" className="party-action party-action-balance" onClick={() => setSheet("balance")}>
          <ActionFace icon="➕" label="رصيد" />
        </button>
        {canWhatsApp && (
          <button type="button" className="party-action party-action-whatsapp" onClick={() => setSheet("whatsapp")}>
            <ActionFace icon="💬" label="واتساب" />
          </button>
        )}
        {isClient && (
          <button
            type="button"
            className={`party-action${panel === "devices" ? " party-action-active" : ""}`}
            onClick={() => togglePanel("devices")}
          >
            <ActionFace icon="📡" label="الأجهزة" count={devices.length} />
          </button>
        )}
        {onOpenCard && (
          <button type="button" className="party-action" onClick={onOpenCard}>
            <ActionFace icon="💳" label="البطاقة" />
          </button>
        )}
        {isClient && (
          <button type="button" className="party-action" onClick={() => setSheet("notes")}>
            <ActionFace icon="📝" label="ملاحظات" count={noteCount} />
          </button>
        )}
        <button type="button" className="party-action" onClick={onEdit}>
          <ActionFace icon="✎" label="تعديل" />
        </button>
        <button type="button" className="party-action party-action-export" onClick={() => setSheet("export")}>
          <ActionFace icon="⬇️" label="تصدير" />
        </button>
      </div>

      {panel === "statement" && (
        <div className="party-panel">
          <div className="party-move-tools">
            <div className="party-move-filters" role="radiogroup" aria-label="نوع الحركات">
              {MOVEMENT_FILTERS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={moveFilter === f.id} className={moveFilter === f.id ? "active" : ""} onClick={() => setMoveFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" className={`party-move-search-btn${moveSearch || moveQuery ? " active" : ""}`} aria-label="بحث بالبريد أو الجهاز" onClick={() => setMoveSearch((v) => !v)}>
              🔍
            </button>
          </div>
          {(moveSearch || moveQuery) && (
            <input className="search-input party-move-search" type="search" placeholder="ابحث بالبريد أو الجهاز…" value={moveQuery} onChange={(e) => setMoveQuery(e.target.value)} autoFocus />
          )}
          {statement.length === 0 ? (
            <p className="party-empty">لا توجد حركات في كشف الحساب</p>
          ) : movements.length === 0 ? (
            <p className="party-empty">لا حركات بهذا الاختيار</p>
          ) : (
            <>
              <button type="button" className="party-move-profit-toggle" onClick={toggleProfit}>
                {showProfit ? "🙈 إخفاء الربح" : "👁 إظهار الربح"}
              </button>
              <ul className="party-moves">
                {movements.map((m) => {
                  const row = statement.find((r) => r.id === m.id)!;
                  const cur = currencyLabel(row.currencyCode);
                  return (
                    <li key={m.id} className={`party-move party-move-${m.tone}`}>
                      <div className="party-move-head">
                        <button type="button" className="party-move-title" onClick={() => openDetail(m.id)}>
                          <span aria-hidden="true">{m.icon}</span> {m.title}
                          {m.device && <span className="party-move-device"> · {m.device}</span>}
                          {row.adjustment && <span className="party-statement-editable"> ✎</span>}
                        </button>
                        <span className="party-move-date">
                          {m.dateLabel}
                          {m.time && <small> {m.time}</small>}
                        </span>
                      </div>
                      {m.email && (
                        <div className="party-move-email">
                          <bdi dir="ltr">{m.email}</bdi>
                          <button type="button" onClick={() => copyEmail(m.id, m.email!)} aria-label="نسخ البريد">
                            {copiedId === m.id ? "✓" : "⧉"}
                          </button>
                        </div>
                      )}
                      {m.note && <div className="party-move-note">{m.note}</div>}
                      <div className="party-move-cols">
                        <div>
                          <span>الرصيد قبل</span>
                          <strong dir="ltr">{formatAmount(m.before)}</strong>
                        </div>
                        <div className="party-move-mid">
                          <span>{m.middleLabel}</span>
                          <strong dir="ltr">
                            {m.tone === "debt" ? "+" : ""}
                            {formatAmount(m.middle)}
                          </strong>
                        </div>
                        <div className={`party-move-after ${m.after > EPSILON ? "is-due" : "is-clear"}`}>
                          <span>الرصيد بعد</span>
                          <strong dir="ltr">{formatAmount(m.after)}</strong>
                        </div>
                      </div>
                      <div className="party-move-foot">
                        <span className="party-move-cur">{cur}</span>
                        {(() => {
                          const edit = editAction(row);
                          return edit ? (
                            <button type="button" className="party-move-edit" onClick={edit} aria-label="تعديل العملية">
                              ✎ تعديل
                            </button>
                          ) : null;
                        })()}
                        {showProfit && m.profit && (
                          <span className="party-move-profit">
                            {m.profit === "uncomputed" ? (
                              "الربح غير محسوب"
                            ) : m.profit.expected ? (
                              <>الربح المتوقع (D): <bdi dir="ltr">≈ {formatAmount(m.profit.amount)}</bdi> {cur}</>
                            ) : (
                              <>الربح: <bdi dir="ltr">{formatAmount(m.profit.amount)}</bdi> {cur}</>
                            )}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {sheet === "export" && (
        <PartySheet title={`تصدير كشف ${party.name}`} onClose={() => setSheet(null)}>
          <div className="party-export-options">
            <StatementImageButton build={() => buildStatementData(party, isClient, totals, fullStatement(), deviceNames, net)} />
            <PdfButton className="party-action party-action-pdf" label="📄 PDF" build={() => buildPartyStatementPdf(party, isClient, totals, fullStatement(), deviceNames, net)} />
          </div>
        </PartySheet>
      )}

      {panel === "devices" && (
        <div className="party-panel">
          {openDevice && renderDevice ? (
            <div className="party-device-open">
              <button type="button" className="text-action party-device-back" onClick={() => setOpenDeviceId(null)}>
                → كل أجهزته ({devices.length})
              </button>
              {renderDevice(openDevice)}
            </div>
          ) : (
          <>
          <p className="party-panel-note">اشتراكات Starlink - حساب منفصل عن فواتير المتجر{renderDevice && devices.length > 0 ? " · اضغط جهازًا لفتح بطاقته" : ""}</p>
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
                  <li
                    key={device.id}
                    className={`party-device${renderDevice ? " party-device-tappable" : ""}`}
                    {...(renderDevice ? { role: "button", tabIndex: 0, onClick: () => setOpenDeviceId(device.id), onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && setOpenDeviceId(device.id) } : {})}
                  >
                    <div className="party-device-top">
                      <strong>{device.name}</strong>
                      <span className="party-device-date" dir={device.rechargeDate?.trim() ? "ltr" : undefined}>📅 {renewalDateLabel(device.rechargeDate)}</span>
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
          </>
          )}
        </div>
      )}

      {sheet === "balance" && (
        <PartySheet title={`إضافة رصيد - ${party.name}`} onClose={() => setSheet(null)}>
          <BalanceForm
            partyName={party.name}
            partyKind={partyKind}
            devices={
              isClient && onAddDevicePayment
                ? devices.map((d) => ({ id: d.id, name: d.name, email: d.expectedEmail || d.starlinkAccountEmail || undefined }))
                : []
            }
            onCancel={() => setSheet(null)}
            onSubmit={(input) => {
              const { deviceId, proofDataUrl, ...rest } = input;
              const error =
                deviceId && onAddDevicePayment
                  ? onAddDevicePayment(deviceId, rest)
                  : onAddAdjustment({ ...rest, partyKind, partyId: party.id }, proofDataUrl);
              if (!error) setSheet(null);
              return error;
            }}
          />
        </PartySheet>
      )}

      {(sheet === "detail" || sheet === "edit") && detailRow && (
        <PartySheet
          title={sheet === "edit" ? `تعديل الرصيد - ${party.name}` : `تفاصيل العملية - ${party.name}`}
          onClose={() => setSheet(null)}
        >
          {sheet === "detail" ? (
            <StatementRowDetail
              row={detailRow}
              kindLabel={statementKindLabel(detailRow, isClient)}
              isClient={isClient}
              onEdit={
                detailRow.adjustment
                  ? () => setSheet("edit")
                  : onEditDeviceEntry && (detailRow.type === "device-charge" || detailRow.type === "device-payment")
                    ? () => {
                        onEditDeviceEntry(detailRow.id);
                        setSheet(null);
                        setDetailRowId(null);
                      }
                    : detailRow.invoice && onEditInvoice && onDeleteInvoice
                      ? () => setSheet("invoice")
                      : undefined
              }
              onDelete={
                detailRow.adjustment
                  ? () => confirmDeleteAdjustment(detailRow.adjustment!)
                  : onDeleteDeviceEntry && (detailRow.type === "device-charge" || detailRow.type === "device-payment")
                    ? () => {
                        if (onDeleteDeviceEntry(detailRow.id)) {
                          setSheet(null);
                          setDetailRowId(null);
                        }
                      }
                    : undefined
              }
            />
          ) : (
            <BalanceForm
              partyName={party.name}
              partyKind={partyKind}
              devices={
                isClient && onMoveAdjustmentToDevice
                  ? devices.map((d) => ({ id: d.id, name: d.name, email: d.expectedEmail || d.starlinkAccountEmail || undefined }))
                  : []
              }
              initial={{
                direction: detailRow.adjustment!.direction,
                amount: detailRow.adjustment!.amount,
                currencyCode: detailRow.adjustment!.currencyCode,
                date: detailRow.adjustment!.date,
                note: detailRow.adjustment!.note,
                cashMoved: detailRow.adjustment!.cashMoved,
                paymentMethod: detailRow.adjustment!.paymentMethod,
                accountId: detailRow.adjustment!.accountId,
              }}
              proofKey={detailRow.adjustment!.id}
              submitLabel="حفظ التعديل"
              onCancel={() => setSheet("detail")}
              onSubmit={(input) => {
                const { deviceId, proofDataUrl, ...rest } = input;
                const id = detailRow.adjustment!.id;
                const error =
                  deviceId && onMoveAdjustmentToDevice ? onMoveAdjustmentToDevice(id, deviceId, rest) : onUpdateAdjustment?.(id, rest, proofDataUrl) ?? null;
                if (!error) setSheet(null);
                return error;
              }}
            />
          )}
          {sheet === "edit" && (
            <button type="button" className="dialog-danger" onClick={() => confirmDeleteAdjustment(detailRow.adjustment!)}>
              🗑 حذف العملية
            </button>
          )}
        </PartySheet>
      )}

      {sheet === "invoice" && detailRow?.invoice && onEditInvoice && onDeleteInvoice && (
        <PartySheet
          title={`${detailRow.type === "return" ? "مرتجع" : "تعديل الفاتورة"} - ${party.name}`}
          onClose={() => setSheet(null)}
        >
          <InvoiceEditSheet
            invoice={detailRow.invoice}
            currencyLabel={currencyLabel(detailRow.invoice.currencyCode)}
            lock={invoiceLockReason(invoices, detailRow.invoice.id)}
            onSave={(input) => {
              const error = onEditInvoice(detailRow.invoice!.id, input);
              if (!error) setSheet(null);
              return error;
            }}
            onDelete={() => {
              const error = onDeleteInvoice(detailRow.invoice!.id);
              if (!error) {
                setSheet(null);
                setDetailRowId(null);
              }
              return error;
            }}
            onCancel={() => setSheet(null)}
          />
        </PartySheet>
      )}

      {sheet === "notes" && (
        <PartySheet title={`ملاحظات - ${party.name}`} onClose={() => setSheet(null)}>
          <ClientNotesPanel clientId={party.id} onCountChange={setNoteCount} />
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
                // ⚖️ With a net, the reminder asks for the net in his currency only (nothing when متعادل).
                onClick={() => openWhatsApp(buildStoreDebtReminderMessage(party.name, net ? { [net.currency]: net.amount } : remainingByCurrency))}
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
              onClick={() => openWhatsApp(buildStoreStatementMessage(party.name, totals, partyKind, net ? statementNetView(net, isClient) : undefined))}
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
/** «بسعر 1,000 سيفا = 3,642 أوقية ✎» - tap to type his own rate (3,600). */
function PairRateEdit({ quote, onSave }: { quote: PairQuote; onSave?: (quote: PairQuote) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(quote.mru));
  const label = currencyLabel(quote.foreign);
  if (!editing) {
    return (
      <>
        {" "}· بسعر <bdi dir="ltr">{formatAmount(quote.block)}</bdi> {label} = <bdi dir="ltr">{formatAmount(quote.mru)}</bdi> أوقية{" "}
        {onSave && (
          <button type="button" className="text-action party-net-edit" onClick={() => (setText(String(quote.mru)), setEditing(true))}>
            ✎ غيّر
          </button>
        )}
      </>
    );
  }
  const value = Number(text.replace(/[\s,]/g, ""));
  return (
    <span className="party-net-rate">
      <bdi dir="ltr">{formatAmount(quote.block)}</bdi> {label} =
      <input className="search-input" inputMode="decimal" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} aria-label="السعر بالأوقية" />
      أوقية
      <button
        type="button"
        className="text-action"
        disabled={!(value > 0)}
        onClick={() => {
          onSave?.({ ...quote, mru: value });
          setEditing(false);
        }}
      >
        ✓ حفظ
      </button>
      <button type="button" className="text-action" onClick={() => setEditing(false)}>
        إلغاء
      </button>
    </span>
  );
}

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
  partyKind: PartyKind;
  /** A client's devices - a payment ("له") can then be recorded against one of them. */
  devices: { id: string; name: string; email?: string }[];
  /** Editing an existing entry: its current values. */
  initial?: Omit<BalanceFormInput, "deviceId">;
  /** Editing: the adjustment id, so an already-saved 📷 إثبات can be shown/replaced. */
  proofKey?: string;
  submitLabel?: string;
  onCancel: () => void;
  /** Returns an error message, or null on success. */
  onSubmit: (input: BalanceFormInput) => string | null;
}

export interface BalanceFormInput {
  direction: PartyAdjustmentDirection;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  cashMoved?: boolean;
  /** Set when the payment is for one specific device - recorded in that device's ledger. */
  deviceId?: string;
  paymentMethod?: PaymentMethod;
  /** The bank / wallet the money moved through («حسابي»); its balance follows. Mutually exclusive
   * with cashMoved: money is cash, or one app, or didn't move. */
  accountId?: string;
  /** 📷 إثبات الدفع (a new/changed image) - saved by the page keyed by the new adjustment id
   * (paymentProofStore). UI-only, never stored on the adjustment itself. */
  proofDataUrl?: string;
}

/** The usual case is real cash: a client paying us ("له") or us paying a supplier ("عليه"). */
function defaultCashMoved(partyKind: PartyKind, direction: PartyAdjustmentDirection): boolean {
  return partyKind === "client" ? direction === "weOwe" : direction === "owesUs";
}

function cashMovedLabel(partyKind: PartyKind, direction: PartyAdjustmentDirection): string {
  const kind = partyAdjustmentCashKind(partyKind, direction);
  const who = partyKind === "client" ? "الزبون" : "المورد";
  return kind === "in" ? `💵 استلمناها نقدًا من ${who} - تدخل الكاش` : `💵 دفعناها نقدًا إلى ${who} - تخرج من الكاش`;
}

function BalanceForm({ partyName, partyKind, devices, initial, proofKey, submitLabel = "حفظ الرصيد", onCancel, onSubmit }: BalanceFormProps) {
  const [direction, setDirectionState] = useState<PartyAdjustmentDirection>(
    initial?.direction ?? (partyKind === "client" && devices.length > 0 ? "weOwe" : "owesUs"),
  );
  // "" = a general balance entry (store); otherwise the device this payment is for.
  const [deviceId, setDeviceId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "cash");
  // Where the money moved: "none" (a balance entry only), "cash" (الكاش), or a bank/wallet id from
  // «حسابي» (its balance follows the payment, via partyFlows). His Oct 2026 choice.
  const [moneyAccounts] = useState(() => loadAccountsBook().accounts);
  const [source, setSource] = useState<string>(
    initial?.accountId ? initial.accountId : initial ? (initial.cashMoved ? "cash" : "none") : defaultCashMoved(partyKind, direction) ? "cash" : "none",
  );
  function setDirection(next: PartyAdjustmentDirection) {
    setDirectionState(next);
    setSource(defaultCashMoved(partyKind, next) ? "cash" : "none");
    // A payment's money place follows its method (أورانج موني → أورانج, بنكيلي → بنكيلي).
    const nowPayment = partyKind === "client" ? next === "weOwe" : next === "owesUs";
    if (nowPayment) followMethod(method, payCurrency);
  }
  // A payment: money from the client ("له") or to the supplier ("عليه") - it has a channel.
  const isPayment = partyKind === "client" ? direction === "weOwe" : direction === "owesUs";
  const canPickDevice = partyKind === "client" && direction === "weOwe" && devices.length > 0;
  // 🟠 أوقية / سيفا (كاش) / دولار / فرانك (أورانج / نيتا) - فرانك is saved as سيفا ÷5, and a saved
  // سيفا payment by أورانج / نيتا opens back in فرانك (payCurrency.ts).
  const [initialPay] = useState(() =>
    initial ? payFormOf({ currency: initial.currencyCode as LedgerCurrency, amount: initial.amount, paymentMethod: initial.paymentMethod }) : undefined,
  );
  const [amount, setAmount] = useState(initialPay ? String(initialPay.amount) : "");
  const [payCurrency, setPayCurrency] = useState<PayCurrency>(initialPay?.currency ?? "MRU");
  const currencyCode: LedgerCurrency = payCurrency === "FRANC" ? "SIFA" : payCurrency;
  // An older payment keeps its own method listed - except a فرانك app, which only belongs to فرانك.
  const keepMethod = initialPay?.currency === "FRANC" ? undefined : initial?.paymentMethod;
  const method = fitPayMethod(payCurrency, paymentMethod, keepMethod);
  const [date, setDate] = useState(initial?.date ?? todayDateInputValue());
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  // 📷 إثبات دفع (اختياري) - يظهر عند الدفع عبر تطبيق بنكي، يُحفظ بمفتاح معرّف العملية.
  const [proofDraft, setProofDraft] = useState<string | null>(null);
  const [savedProof, setSavedProof] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (proofKey) void getProof(proofKey).then((d) => !cancelled && setSavedProof(d));
    return () => {
      cancelled = true;
    };
  }, [proofKey]);
  // An app only holds its own currency (بنكيلي = أوقية فقط - his Oct 2026 rule): only apps in the
  // chosen currency are offered; a picked app that no longer matches falls back to «لم يتحرك».
  // 🟠 أورانج / نيتا hold فرانك: offered only with «فرانك», never with «سيفا (كاش)».
  const currencyAccounts = moneyAccounts.filter((a) => a.currencyCode === currencyCode && isFrancAccount(a) === (payCurrency === "FRANC"));
  /** 🏦 «من أين تحرّك المال؟» = the method's place in that currency (his Oct 12 2026 rule «دائمًا متناسقة»):
   * also when the method changes by itself with the currency (فرانك starts on أورانج موني). */
  function followMethod(m: PaymentMethod, cur: PayCurrency) {
    const code: LedgerCurrency = cur === "FRANC" ? "SIFA" : cur;
    const place = methodSource(m, code, moneyAccounts.filter((a) => a.currencyCode === code && isFrancAccount(a) === (cur === "FRANC")));
    if (place) setSource(place);
  }
  function changeCurrency(next: PayCurrency) {
    setPayCurrency(next);
    if (isPayment) followMethod(fitPayMethod(next, paymentMethod, keepMethod), next);
  }
  const effectiveSource = source === "none" || source === "cash" || currencyAccounts.some((a) => a.id === source) ? source : "none";
  const viaAccount = currencyAccounts.some((a) => a.id === effectiveSource);

  async function pickProof(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setProofDraft(await resizeImageToDataUrl(file, 1280, 0.72));
    } catch {
      setError("تعذرت قراءة الصورة - جرّب صورة أخرى");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const stored = toLedgerPayment(payCurrency, Number(amount));
    setError(
      onSubmit({
        direction,
        amount: stored.amount,
        currencyCode: stored.currency,
        date,
        note,
        cashMoved: effectiveSource === "cash",
        accountId: viaAccount ? effectiveSource : undefined,
        deviceId: canPickDevice && deviceId ? deviceId : undefined,
        paymentMethod: isPayment ? method : undefined,
        proofDataUrl: viaAccount && proofDraft ? proofDraft : undefined,
      }),
    );
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
      {canPickDevice && (
        <fieldset className="pay-target">
          <legend>الدفعة عن</legend>
          <div className="pay-target-options">
            <button
              type="button"
              className={`pay-target-option${deviceId === "" ? " pay-target-active" : ""}`}
              aria-pressed={deviceId === ""}
              onClick={() => setDeviceId("")}
            >
              <strong>رصيد عام</strong>
              <small>حساب المتجر</small>
            </button>
            {devices.map((device) => (
              <button
                key={device.id}
                type="button"
                className={`pay-target-option${deviceId === device.id ? " pay-target-active" : ""}`}
                aria-pressed={deviceId === device.id}
                onClick={() => setDeviceId(device.id)}
              >
                <strong>📡 {device.name}</strong>
                {device.email && <small dir="ltr">{device.email}</small>}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="party-balance-row">
        <input
          className="search-input"
          type="text" inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder={payCurrency === "FRANC" ? "المبلغ بالفرانك" : "المبلغ"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <select className="search-input" value={payCurrency} onChange={(e) => changeCurrency(e.target.value as PayCurrency)}>
          {PAY_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {PAY_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      {payCurrency === "FRANC" && <FrancHint amount={amount} />}
      {isPayment && (
        <fieldset className="pay-methods">
          <legend>طريقة الدفع</legend>
          <div className="pay-method-options">
            {payMethodsFor(payCurrency, keepMethod).map((m) => (
              <button
                key={m}
                type="button"
                className={`pay-method pay-method-${m}${method === m ? " pay-method-active" : ""}`}
                aria-pressed={method === m}
                onClick={() => {
                  setPaymentMethod(m);
                  // 🏦 «من أين تحرّك المال؟» follows the method (his Oct 12 2026 ask): بنكيلي → the بنكيلي
                  // account, نقدًا → الكاش. He can still change it below.
                  followMethod(m, payCurrency);
                }}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <DateInput className="search-input"  value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" placeholder="ملاحظة (اختياري) - مثال: رصيد افتتاحي" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="form-field party-source-field">
        <span>من أين تحرّك المال؟</span>
        <select className="search-input" value={effectiveSource} onChange={(e) => setSource(e.target.value)}>
          <option value="none">لم يتحرك المال (رصيد فقط)</option>
          <option value="cash">{cashMovedLabel(partyKind, direction)}</option>
          {currencyAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon ? `${a.icon} ` : ""}
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {viaAccount && (
        <div className="ledger-proof-field">
          {proofDraft || savedProof ? (
            <>
              <img src={proofDraft ?? savedProof} alt="صورة إثبات الدفع" className="ledger-proof-thumb" />
              <span>📷 {proofDraft ? "صورة جديدة - تُحفظ مع العملية" : "إثبات محفوظ"}</span>
              <label className="text-action">
                تغيير
                <input type="file" accept="image/*" hidden onChange={pickProof} />
              </label>
            </>
          ) : (
            <label className="ledger-proof-pick">
              📷 إرفاق صورة إثبات الدفع (اختياري)
              <input type="file" accept="image/*" hidden onChange={pickProof} />
            </label>
          )}
        </div>
      )}
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amount}>
          {deviceId ? "حفظ كدفعة على الجهاز" : submitLabel}
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/** 🏷️ «＋ تصنيف»: his own categories - a name and a color; removing one never touches a customer's account. */
function CategorySheet({
  list,
  onAdd,
  onRemove,
  onClose,
}: {
  list: ClientCategory[];
  onAdd: (name: string, color: string) => string | null;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[1]!);
  const [error, setError] = useState<string | null>(null);
  function add(event: FormEvent) {
    event.preventDefault();
    const message = onAdd(name, color);
    setError(message);
    if (!message) setName("");
  }
  return (
    <PartySheet title="🏷️ التصنيفات" onClose={onClose}>
      <ul className="category-list">
        {BUILT_IN_CATEGORIES.map((c) => (
          <li key={c.id}>
            <span className="category-dot" style={{ background: c.color }} aria-hidden="true" />
            <span>
              {c.icon} {c.name}
            </span>
            <small>{c.id === STARLINK ? "تلقائي: له أجهزة" : "تلقائي: بدون أجهزة أو له مبيعات"}</small>
          </li>
        ))}
        {list.map((c) => (
          <li key={c.id}>
            <span className="category-dot" style={{ background: c.color }} aria-hidden="true" />
            <span>{c.name}</span>
            <button type="button" className="btn-icon" aria-label={`حذف ${c.name}`} onClick={() => onRemove(c.id)}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      <form className="auth-form" onSubmit={add}>
        <input className="search-input" placeholder="اسم التصنيف (مثل: المحل، الجملة)" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        <div className="category-colors" role="radiogroup" aria-label="اللون">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={`category-swatch${color === c ? " is-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        {error && <p className="ledger-form-error">{error}</p>}
        <button type="submit" className="dialog-primary" disabled={!name.trim()}>
          ＋ إضافة التصنيف
        </button>
      </form>
    </PartySheet>
  );
}

interface PartyFormProps {
  initial?: { id?: string; name: string; phone?: string; creditLimit?: number; defaultCurrency?: LedgerCurrency };
  submitLabel: string;
  namePlaceholder: string;
  /** Client-only (see Client.creditLimit's own doc) - a credit ceiling only ever applies to money a
   * client can owe US. */
  showCreditLimit?: boolean;
  onSubmit: (input: NewClientInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** The same list (clients or suppliers) to warn about a repeated name or phone. */
  existing?: { id: string; name: string; phone?: string }[];
  selfId?: string;
  /** 🏷️ Clients: his own categories to tick (with «عام»), and the ones ticked at first. */
  categories?: ClientCategory[];
  initialCategories?: string[];
  /** ＋ A new customer in his own sheet: the rarely used fields fold under «خيارات أخرى». */
  inSheet?: boolean;
  /** 🤝 A new customer can be given to a rep. */
  reps?: { id: string; name: string }[];
}

function PartyForm({
  initial,
  submitLabel,
  namePlaceholder,
  showCreditLimit,
  onSubmit,
  onCancel,
  onDelete,
  existing = [],
  selfId,
  categories,
  initialCategories = [],
  inSheet,
  reps,
}: PartyFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial?.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial?.phone).localNumber);
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit ? String(initial.creditLimit) : "");
  // 💱 A customer's currency (clients only): automatic, or fixed by him (partyCurrency.ts).
  const [defaultCurrency, setDefaultCurrency] = useState<LedgerCurrency | undefined>(initial?.defaultCurrency);
  const [tags, setTags] = useState<string[]>(initialCategories);
  // 📡 «حفظ وإضافة جهاز» for a new Starlink customer.
  const canAddDevice = !initial && tags.includes(STARLINK);
  const [repId, setRepId] = useState("");
  const toggleTag = (id: string) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const autoCurrency = useMemo(
    () => (showCreditLimit && initial?.id ? autoCurrencyOf("client", initial.id, loadPartyCurrencyContext()) : undefined),
    [showCreditLimit, initial?.id],
  );

  const duplicates = useMemo(
    () => findClientDuplicates({ id: selfId, name, phone: combinePhoneNumber(phoneDialCode, phoneLocalNumber) }, existing),
    [selfId, name, phoneDialCode, phoneLocalNumber, existing],
  );

  function submit(event: FormEvent, addDevice = false) {
    event.preventDefault();
    if (!name.trim()) return;
    if (duplicates.length > 0 && !window.confirm(duplicateQuestion(duplicates))) return;
    const input: NewClientInput = {
      name,
      phone: combinePhoneNumber(phoneDialCode, phoneLocalNumber) || undefined,
      creditLimit: showCreditLimit && creditLimit ? Number(creditLimit) : undefined,
      ...(showCreditLimit ? { defaultCurrency } : {}),
      ...(categories ? { categories: tags } : {}),
      ...(repId ? { repId } : {}),
      ...(addDevice ? { addDevice } : {}),
    };
    onSubmit(input);
  }

  return (
    <form className={`auth-form store-item-form${inSheet ? " party-add-form" : ""}`} onSubmit={submit}>
      {inSheet && <span className="party-form-label">الاسم</span>}
      <input className="search-input" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      {inSheet && <span className="party-form-label">الهاتف</span>}
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
      <DuplicateWarning hits={duplicates} />
      {categories && (
        <div className="party-form-categories" role="group" aria-label="التصنيف">
          <span className="party-form-label">🏷️ التصنيف</span>
          <div className="party-form-main-categories">
            {BUILT_IN_CATEGORIES.map((c) => (
              <label key={c.id} className={`party-category-option${tags.includes(c.id) ? " is-active" : ""}`} style={{ "--chip": c.color } as CSSProperties}>
                <input type="checkbox" checked={tags.includes(c.id)} onChange={() => toggleTag(c.id)} />
                <span aria-hidden="true">{c.icon}</span>
                {c.name}
              </label>
            ))}
          </div>
          {categories.map((c) => (
            <label key={c.id} className={`party-category-chip${tags.includes(c.id) ? " is-active" : ""}`} style={{ "--chip": c.color } as CSSProperties}>
              <input type="checkbox" checked={tags.includes(c.id)} onChange={() => toggleTag(c.id)} />
              {c.name}
            </label>
          ))}
          <small className="settings-hint">حساب واحد للزبون مهما تعدّدت تصنيفاته. 📡 يُضاف تلقائيًا عندما يكون له جهاز.</small>
        </div>
      )}
      {reps && reps.length > 0 && (
        <select className="search-input" aria-label="المندوب" value={repId} onChange={(e) => setRepId(e.target.value)}>
          <option value="">🤝 المندوب: بدون (زبوني)</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              🤝 {r.name}
            </option>
          ))}
        </select>
      )}
      {showCreditLimit &&
        (() => {
          const more = (
            <>
              <input
                className="search-input"
                type="text" inputMode="decimal"
                min="0"
                step="0.01"
                dir="ltr"
                placeholder="سقف الدين (اختياري)"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
              <DefaultCurrencyField value={defaultCurrency} auto={autoCurrency} onChange={setDefaultCurrency} />
            </>
          );
          return inSheet ? (
            <details className="party-form-more">
              <summary>⚙️ خيارات أخرى (سقف الدين، العملة)</summary>
              {more}
            </details>
          ) : (
            more
          );
        })()}
      <div className={inSheet ? "party-add-actions" : "settings-actions"}>
        <button className="dialog-primary" type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
        {canAddDevice && (
          <button className="dialog-primary party-save-device" type="button" disabled={!name.trim()} onClick={(e) => submit(e, true)}>
            📡 حفظ وإضافة جهاز
          </button>
        )}
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
      {onDelete && (
        <button type="button" className="dialog-danger party-delete" onClick={onDelete}>
          🗑 حذف الزبون
        </button>
      )}
    </form>
  );
}

/** Full details of one statement line, with the balance before and after it. Only manual balance
 * entries are edited here - invoices belong to the store, device operations to the device ledger. */
function StatementRowDetail({
  row,
  kindLabel,
  isClient,
  onEdit,
  onDelete,
}: {
  row: PartyStatementRow;
  kindLabel: string;
  isClient: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const adj = row.adjustment;
  const before = row.balanceAfter - row.delta;
  const cur = currencyLabel(row.currencyCode);
  const balanceWord = (v: number) => (v > EPSILON ? (isClient ? "عليه" : "له") : v < -EPSILON ? (isClient ? "له" : "لنا عنده") : "صفر");
  const details: [string, string][] = [
    ["النوع", kindLabel],
    ["التاريخ", row.date],
    ["المبلغ", `${formatAmount(row.amount)} ${cur}`],
  ];
  if (row.deviceName) details.push(["الجهاز", row.deviceName]);
  if (adj?.paymentMethod) details.push(["طريقة الدفع", methodLabel(adj.paymentMethod, adj.currencyCode, adj.amount)]);
  if (adj) details.push(["الكاش", adj.cashMoved ? "دخلت/خرجت من الكاش" : "لم تمر بالكاش"]);
  if (row.type === "invoice") details.push(["المدفوع من الفاتورة", `${formatAmount(row.paid)} ${cur}`]);
  if (row.note) details.push(["ملاحظة", row.note]);
  if (adj) details.push(["سُجّلت في", adj.createdAt.slice(0, 16).replace("T", " ")]);

  return (
    <div className="statement-detail">
      <div className="statement-balance-flow">
        <div className="statement-balance-box">
          <small>الرصيد قبل</small>
          <strong>
            <bdi dir="ltr">{formatAmount(Math.abs(before))}</bdi> {cur}
          </strong>
          <small>{balanceWord(before)}</small>
        </div>
        <div className={`statement-balance-delta ${row.delta < 0 ? "statement-delta-down" : "statement-delta-up"}`}>
          <bdi dir="ltr">
            {row.delta < 0 ? "-" : "+"}
            {formatAmount(Math.abs(row.delta))}
          </bdi>
          <span aria-hidden="true">←</span>
        </div>
        <div className="statement-balance-box statement-balance-after">
          <small>الرصيد بعد</small>
          <strong>
            <bdi dir="ltr">{formatAmount(Math.abs(row.balanceAfter))}</bdi> {cur}
          </strong>
          <small>{balanceWord(row.balanceAfter)}</small>
        </div>
      </div>
      <dl className="statement-detail-list">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!adj && (
        <p className="settings-hint">
          {row.type === "device-charge" || row.type === "device-payment"
            ? onEdit
              ? "هذه عملية على الجهاز - «تعديل» يفتحها في نافذة عمليات الجهاز نفسها."
              : "هذه عملية على الجهاز - تُعدَّل من سجل الجهاز في الصفحة الرئيسية."
            : onEdit
              ? "هذه فاتورة من المتجر - «تعديل» يفتحها: الكمية والسعر والخصم والمدفوع، أو حذفها."
              : "هذه فاتورة من المتجر - تُعدَّل أو تُرجَع من قسم الفواتير في المتجر."}
        </p>
      )}
      {(onEdit || onDelete) && (
        <div className="statement-detail-actions">
          {onEdit && (
            <button type="button" className="dialog-primary" onClick={onEdit}>
              ✎ تعديل
            </button>
          )}
          {onDelete && (
            <button type="button" className="dialog-danger" onClick={onDelete}>
              🗑 حذف العملية
            </button>
          )}
        </div>
      )}
    </div>
  );
}
