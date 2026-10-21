"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import {
  activeDeskFilters,
  applyDeskFilters,
  DEFAULT_SORT,
  DESK_COLUMNS,
  EXPIRY_FILTERS,
  isStale,
  LOCKED_COLUMN,
  nextSort,
  NO_DESK_FILTERS,
  parseColumns,
  planChoices,
  renewalOf,
  sortDevices,
  starlinkDue,
  statusView,
  toggleColumn,
  type DeskColumnId,
  type DeskFilters,
  type DeskSort,
  type SortKey,
} from "@/lib/deskTable";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime, renewalDateLabel } from "@/lib/date";
import { computeBalanceByCurrency, sortEntriesNewestFirst, type BalanceByCurrency, type LedgerEntry } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { currencyLabel } from "@/lib/telegramMessages";
import type { DeviceNote } from "@/lib/deviceNotes";

/** What the table shows, in the order HomeView already filtered (status ring, day, customer, search). */
interface Props {
  devices: StarlinkAccountSummary[];
  clientName: (device: StarlinkAccountSummary) => string;
  clientCategories: (device: StarlinkAccountSummary) => string[];
  categories: { id: string; name: string }[];
  entries: (device: StarlinkAccountSummary) => LedgerEntry[];
  note: (device: StarlinkAccountSummary) => DeviceNote | undefined;
  /** The full phone card with every action it has (the «كل الإجراءات» tab). */
  renderCard: (device: StarlinkAccountSummary) => ReactNode;
  onOpen: (device: StarlinkAccountSummary) => void;
  onPay: (device: StarlinkAccountSummary) => void;
  onEdit: (device: StarlinkAccountSummary) => void;
  onStatement: (device: StarlinkAccountSummary) => void;
  /** HomeView's status filter («الحالة»), its customer filter («الزبون»). */
  status: string;
  statusOptions: { id: string; label: string }[];
  onStatus: (id: string) => void;
  clientId: string;
  clientOptions: { id: string; name: string }[];
  onClient: (id: string) => void;
  /** Something HomeView filters by that the toolbar doesn't show (a day, a search) - to clear it all. */
  onClearAll: () => void;
  /** Opened from the home page on one device. */
  initialSelectedId?: string | null;
  /** Opened from the home page's follow-up («تنتهي الليلة»…). */
  initialExpiry?: DeskFilters["expiry"];
}

type View = "table" | "cards";
type Tab = "summary" | "device" | "money" | "renewal" | "notes" | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "الملخص" },
  { id: "device", label: "الجهاز" },
  { id: "money", label: "المالية" },
  { id: "renewal", label: "التجديد" },
  { id: "notes", label: "الملاحظات" },
  { id: "all", label: "كل الإجراءات" },
];

const PREFS_KEY = "starnet.deskDevices";

interface Prefs {
  view: View;
  sort: DeskSort;
  columns: DeskColumnId[];
  filters: DeskFilters;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { view: "table", sort: DEFAULT_SORT, columns: parseColumns(null), filters: NO_DESK_FILTERS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!raw || typeof raw !== "object") return fallback;
    const sortKeys = DESK_COLUMNS.filter((c) => c.sortable).map((c) => c.id as string);
    const sort = raw.sort && sortKeys.includes(raw.sort.key) && (raw.sort.dir === "asc" || raw.sort.dir === "desc") ? raw.sort : DEFAULT_SORT;
    const f = raw.filters ?? NO_DESK_FILTERS;
    return {
      view: raw.view === "cards" ? "cards" : "table",
      sort,
      columns: parseColumns(raw.columns),
      filters: {
        plan: typeof f.plan === "string" ? f.plan : "",
        expiry: EXPIRY_FILTERS.some((e) => e.id === f.expiry) ? f.expiry : "all",
        category: typeof f.category === "string" ? f.category : "",
      },
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // A view preference only - the table still works.
  }
}

function owedParts(balance: BalanceByCurrency): { currency: string; amount: number }[] {
  return Object.entries(balance)
    .filter(([, v]) => typeof v === "number" && Math.abs(v) > 0.005)
    .map(([currency, amount]) => ({ currency, amount: amount as number }));
}

function owedTotal(balance: BalanceByCurrency): number {
  return Object.values(balance).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
}

/** «الليلة» / «غدًا» / «منتهٍ» - the stop is at the date's midnight. */
function RenewalTag({ date }: { date: string }) {
  const days = date ? daysRemainingNumber(date) : null;
  if (days === null) return null;
  const tone = days <= 0 ? "down" : days <= 2 ? "weak" : days <= 7 ? "soon" : "calm";
  const text = days <= 0 ? "منتهٍ" : days === 1 ? "الليلة" : days === 2 ? "غدًا" : `${days - 1} يوم`;
  return <span className={`desk-tag desk-tag-${tone}`}>{text}</span>;
}

function StatusCell({ status, what }: { status: StarlinkAccountSummary["dishStatus"]; what: string }) {
  const view = statusView(status);
  return (
    <span className={`desk-status desk-status-${view.tone}`} title={`${what}: ${view.label}`}>
      <span aria-hidden="true">{view.sign}</span>
      {view.label}
    </span>
  );
}

function Money({ amount, currency }: { amount: number; currency: string }) {
  return (
    <bdi dir="ltr" className="desk-num">
      {formatAmount(Math.abs(amount))} {currency}
    </bdi>
  );
}

export function DeskDevices(props: Props) {
  const { devices } = props;
  const [prefs, setPrefs] = useState<Prefs>(() => ({ view: "table", sort: DEFAULT_SORT, columns: parseColumns(null), filters: NO_DESK_FILTERS }));
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    const saved = loadPrefs();
    setPrefs(props.initialExpiry ? { ...saved, filters: { ...saved.filters, expiry: props.initialExpiry } } : saved);
    setPrefsLoaded(true);
  }, [props.initialExpiry]);
  useEffect(() => {
    if (prefsLoaded) savePrefs(prefs);
  }, [prefs, prefsLoaded]);
  const update = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const setFilter = (patch: Partial<DeskFilters>) => setPrefs((p) => ({ ...p, filters: { ...p.filters, ...patch } }));

  const [selectedId, setSelectedId] = useState<string | null>(props.initialSelectedId ?? null);
  useEffect(() => {
    if (props.initialSelectedId) setSelectedId(props.initialSelectedId);
  }, [props.initialSelectedId]);
  const [tab, setTab] = useState<Tab>("summary");
  const [showFilters, setShowFilters] = useState(false);

  const balances = useMemo(() => new Map(devices.map((d) => [d.id, computeBalanceByCurrency(props.entries(d))])), [devices, props]);
  const plans = useMemo(() => planChoices(devices), [devices]);
  const shown = useMemo(
    () =>
      sortDevices(applyDeskFilters(devices, prefs.filters, props.clientCategories), prefs.sort, {
        clientName: props.clientName,
        owed: (d) => owedTotal(balances.get(d.id) ?? {}),
      }),
    [devices, prefs.filters, prefs.sort, props.clientCategories, props.clientName, balances],
  );
  const selected = selectedId ? devices.find((d) => d.id === selectedId) : undefined;
  const filterCount = activeDeskFilters(prefs.filters) + (props.status ? 1 : 0) + (props.clientId ? 1 : 0);
  const columns = DESK_COLUMNS.filter((c) => prefs.columns.includes(c.id));

  // ↑ / ↓ move through the rows, Esc closes the panel (the page's own windows keep their Esc).
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (document.querySelector(".party-sheet-backdrop, .dialog-backdrop")) return;
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (shown.length === 0) return;
      e.preventDefault();
      const at = shown.findIndex((d) => d.id === selectedId);
      const next = e.key === "ArrowDown" ? Math.min(shown.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1);
      setSelectedId(shown[next].id);
      tableRef.current?.querySelector<HTMLElement>(`[data-row="${shown[next].id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedId]);

  function select(id: string) {
    setSelectedId((cur) => (cur === id ? cur : id));
  }

  function cell(device: StarlinkAccountSummary, id: DeskColumnId): ReactNode {
    switch (id) {
      case "name": {
        const top = device.starlinkAccountHolderName?.trim() || device.name || "بدون اسم";
        const sub = device.starlinkAccountHolderName?.trim() && device.name && device.name !== top ? device.name : "";
        return (
          <span className="desk-name">
            <strong dir="auto">{top}</strong>
            {sub && <small dir="auto">{sub}</small>}
          </span>
        );
      }
      case "client":
        return props.clientName(device) || <span className="desk-faint">بدون زبون</span>;
      case "email": {
        const email = device.expectedEmail || device.starlinkAccountEmail || "";
        return email ? (
          <bdi dir="ltr" className="desk-email" title={email}>
            {email}
          </bdi>
        ) : (
          <span className="desk-faint">—</span>
        );
      }
      case "plan":
        return device.planName || <span className="desk-faint">—</span>;
      case "renewal": {
        const date = renewalOf(device);
        return (
          <span className="desk-renewal">
            <bdi dir="ltr" className="desk-num">{renewalDateLabel(date)}</bdi>
            <RenewalTag date={date} />
          </span>
        );
      }
      case "due": {
        const due = starlinkDue(device);
        return due > 0 ? <Money amount={due} currency={device.currency || "$"} /> : <span className="desk-faint">—</span>;
      }
      case "owed": {
        const parts = owedParts(balances.get(device.id) ?? {});
        return parts.length ? (
          <span className="desk-owed">
            {parts.map((p) => (
              <span key={p.currency} className={p.amount > 0 ? "desk-owed-due" : "desk-owed-credit"}>
                {p.amount > 0 ? "عليه " : "له "}
                <Money amount={p.amount} currency={currencyLabel(p.currency)} />
              </span>
            ))}
          </span>
        ) : (
          <span className="desk-faint">—</span>
        );
      }
      case "dish":
        return <StatusCell status={device.dishStatus} what="الطبق" />;
      case "wifi":
        return <StatusCell status={device.wifiStatus} what="الواي فاي" />;
      case "updated": {
        const when = formatRelativeTime(device.lastSuccessfulScanAt);
        const stale = isStale(device.lastSuccessfulScanAt);
        return (
          <span className={`desk-updated${stale ? " is-stale" : ""}`} title={device.lastSuccessfulScanAt ? new Date(device.lastSuccessfulScanAt).toLocaleString("ar") : "لم يُقرأ من Starlink بعد"}>
            {when ?? "لم يُقرأ"}
            {stale && when && <span className="desk-tag desk-tag-soon">قديمة</span>}
          </span>
        );
      }
    }
  }

  return (
    <div className={`desk-devices${selected ? " has-panel" : ""}`}>
      <div className="desk-toolbar" role="toolbar" aria-label="أدوات الأجهزة">
        <div className="desk-toolbar-start">
          <label className="desk-field">
            <span>الحالة</span>
            <select value={props.status} onChange={(e) => props.onStatus(e.target.value)}>
              <option value="">كل الأجهزة</option>
              {props.statusOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="desk-field">
            <span>ينتهي</span>
            <select value={prefs.filters.expiry} onChange={(e) => setFilter({ expiry: e.target.value as DeskFilters["expiry"] })}>
              {EXPIRY_FILTERS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`desk-btn${showFilters ? " is-on" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            تصفية أكثر
            {filterCount > 0 && <span className="desk-count">{filterCount}</span>}
          </button>
          {filterCount > 0 && (
            <button
              type="button"
              className="desk-btn desk-btn-quiet"
              onClick={() => {
                update({ filters: NO_DESK_FILTERS });
                props.onClearAll();
              }}
            >
              مسح التصفية
            </button>
          )}
        </div>
        <div className="desk-toolbar-end">
          <span className="desk-result-count">
            <bdi className="desk-num">{shown.length}</bdi> جهاز
          </span>
          <details className="desk-menu">
            <summary className="desk-btn">الأعمدة</summary>
            <div className="desk-menu-pop" role="group" aria-label="الأعمدة الظاهرة">
              {DESK_COLUMNS.map((c) => (
                <label key={c.id} className="desk-check">
                  <input type="checkbox" checked={prefs.columns.includes(c.id)} disabled={c.id === LOCKED_COLUMN} onChange={() => update({ columns: toggleColumn(prefs.columns, c.id) })} />
                  {c.label}
                </label>
              ))}
            </div>
          </details>
          <div className="desk-segment" role="radiogroup" aria-label="طريقة العرض">
            <button type="button" role="radio" aria-checked={prefs.view === "table"} className={prefs.view === "table" ? "is-on" : ""} onClick={() => update({ view: "table" })}>
              جدول
            </button>
            <button type="button" role="radio" aria-checked={prefs.view === "cards"} className={prefs.view === "cards" ? "is-on" : ""} onClick={() => update({ view: "cards" })}>
              بطاقات
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="desk-filter-row">
          <label className="desk-field">
            <span>الزبون</span>
            <select value={props.clientId} onChange={(e) => props.onClient(e.target.value)}>
              <option value="">كل الزبائن</option>
              {props.clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="desk-field">
            <span>الباقة</span>
            <select value={prefs.filters.plan} onChange={(e) => setFilter({ plan: e.target.value })}>
              <option value="">كل الباقات</option>
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="desk-field">
            <span>تصنيف الزبون</span>
            <select value={prefs.filters.category} onChange={(e) => setFilter({ category: e.target.value })}>
              <option value="">كل التصنيفات</option>
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="desk-work">
        <div className="desk-list" ref={tableRef}>
          {shown.length === 0 ? (
            <div className="desk-empty">
              <strong>لا توجد أجهزة مطابقة</strong>
              <span>غيّر التصفية أو البحث لترى أجهزة أخرى.</span>
              {filterCount > 0 && (
                <button
                  type="button"
                  className="desk-btn"
                  onClick={() => {
                    update({ filters: NO_DESK_FILTERS });
                    props.onClearAll();
                  }}
                >
                  مسح التصفية
                </button>
              )}
            </div>
          ) : prefs.view === "table" ? (
            <table className="desk-table">
              <thead>
                <tr>
                  {columns.map((c) => {
                    const on = prefs.sort.key === c.id;
                    return (
                      <th key={c.id} scope="col" aria-sort={on ? (prefs.sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`desk-col-${c.id}`}>
                        {c.sortable ? (
                          <button type="button" className={`desk-sort${on ? " is-on" : ""}`} onClick={() => update({ sort: nextSort(prefs.sort, c.id as SortKey) })}>
                            {c.label}
                            <span aria-hidden="true">{on ? (prefs.sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" className="desk-col-actions">
                    <span className="desk-sr">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr
                    key={d.id}
                    data-row={d.id}
                    className={d.id === selectedId ? "is-selected" : undefined}
                    aria-selected={d.id === selectedId}
                    tabIndex={0}
                    onClick={() => select(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") select(d.id);
                    }}
                  >
                    {columns.map((c) => (
                      <td key={c.id} className={`desk-col-${c.id}`} title={c.id === "client" ? props.clientName(d) : c.id === "plan" ? d.planName : undefined}>
                        {cell(d, c.id)}
                      </td>
                    ))}
                    <td className="desk-col-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="desk-btn desk-btn-primary desk-btn-sm" onClick={() => props.onOpen(d)}>
                        فتح
                      </button>
                      <button type="button" className="desk-btn desk-btn-sm" onClick={() => props.onPay(d)}>
                        دفعة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="desk-cards">
              {shown.map((d) => (
                <button key={d.id} type="button" data-row={d.id} className={`desk-mini${d.id === selectedId ? " is-selected" : ""}`} onClick={() => select(d.id)}>
                  <span className="desk-mini-head">
                    {cell(d, "name")}
                    <RenewalTag date={renewalOf(d)} />
                  </span>
                  <span className="desk-mini-meta">{props.clientName(d) || "بدون زبون"}</span>
                  <span className="desk-mini-row">
                    <bdi dir="ltr" className="desk-num">{renewalDateLabel(renewalOf(d))}</bdi>
                    {starlinkDue(d) > 0 ? <Money amount={starlinkDue(d)} currency={d.currency || "$"} /> : <span className="desk-faint">لا مستحق</span>}
                  </span>
                  <span className="desk-mini-row">
                    <StatusCell status={d.dishStatus} what="الطبق" />
                    <StatusCell status={d.wifiStatus} what="الواي فاي" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <>
            <div className="desk-panel-scrim" onClick={() => setSelectedId(null)} aria-hidden="true" />
            <aside className="desk-panel" aria-label={`تفاصيل ${selected.name}`}>
              <DevicePanel
                device={selected}
                tab={tab}
                onTab={setTab}
                clientName={props.clientName(selected)}
                balance={balances.get(selected.id) ?? {}}
                entries={props.entries(selected)}
                note={props.note(selected)}
                renderCard={props.renderCard}
                onClose={() => setSelectedId(null)}
                onOpen={() => props.onOpen(selected)}
                onPay={() => props.onPay(selected)}
                onEdit={() => props.onEdit(selected)}
                onStatement={() => props.onStatement(selected)}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="desk-kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Secret({ value }: { value?: string }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="desk-faint">—</span>;
  return (
    <span className="desk-secret">
      <bdi dir="ltr" className="desk-num">{shown ? value : "••••••"}</bdi>
      <button type="button" className="desk-link" onClick={() => setShown((v) => !v)}>
        {shown ? "إخفاء" : "إظهار"}
      </button>
    </span>
  );
}

function DevicePanel({
  device,
  tab,
  onTab,
  clientName,
  balance,
  entries,
  note,
  renderCard,
  onClose,
  onOpen,
  onPay,
  onEdit,
  onStatement,
}: {
  device: StarlinkAccountSummary;
  tab: Tab;
  onTab: (tab: Tab) => void;
  clientName: string;
  balance: BalanceByCurrency;
  entries: LedgerEntry[];
  note?: DeviceNote;
  renderCard: (device: StarlinkAccountSummary) => ReactNode;
  onClose: () => void;
  onOpen: () => void;
  onPay: () => void;
  onEdit: () => void;
  onStatement: () => void;
}) {
  const date = renewalOf(device);
  const due = starlinkDue(device);
  const owed = owedParts(balance);
  const email = device.expectedEmail || device.starlinkAccountEmail || "";
  const newest = sortEntriesNewestFirst(entries);
  const shipments = newest.filter((e) => e.kind === "debit");
  const stale = isStale(device.lastSuccessfulScanAt);
  return (
    <div className="desk-panel-inner">
      <header className="desk-panel-head">
        <div className="desk-panel-title">
          <h2 dir="auto">{device.name || device.starlinkAccountHolderName || "بدون اسم"}</h2>
          {device.starlinkAccountHolderName && device.starlinkAccountHolderName !== device.name && <p dir="auto">على Starlink: {device.starlinkAccountHolderName}</p>}
        </div>
        <button type="button" className="desk-icon-btn" onClick={onClose} aria-label="إغلاق التفاصيل" title="إغلاق (Esc)">
          ✕
        </button>
      </header>
      <div className="desk-panel-actions">
        <button type="button" className="desk-btn desk-btn-primary" onClick={onOpen}>
          فتح الحساب
        </button>
        <button type="button" className="desk-btn" onClick={onPay}>
          دفعة
        </button>
        <button type="button" className="desk-btn" onClick={onEdit}>
          تعديل
        </button>
        <details className="desk-menu">
          <summary className="desk-btn" aria-label="المزيد">
            المزيد
          </summary>
          <div className="desk-menu-pop">
            <button type="button" className="desk-menu-item" onClick={onStatement}>
              كشف الجهاز
            </button>
            <button type="button" className="desk-menu-item" onClick={() => onTab("all")}>
              كل الإجراءات (الأرشفة، الحذف…)
            </button>
          </div>
        </details>
      </div>

      <div className="desk-tabs" role="tablist" aria-label="أقسام التفاصيل">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="desk-panel-body" role="tabpanel">
        {tab === "summary" && (
          <dl className="desk-kvs">
            <Row label="الزبون">{clientName || <span className="desk-faint">بدون زبون</span>}</Row>
            <Row label="البريد">{email ? <bdi dir="ltr" className="desk-email-full">{email}</bdi> : <span className="desk-faint">—</span>}</Row>
            <Row label="الباقة">{device.planName || <span className="desk-faint">—</span>}</Row>
            <Row label="ينتهي في">
              <span className="desk-renewal">
                <bdi dir="ltr" className="desk-num">{renewalDateLabel(date)}</bdi>
                <RenewalTag date={date} />
              </span>
            </Row>
            <Row label="مستحق Starlink">{due > 0 ? <Money amount={due} currency={device.currency || "$"} /> : <span className="desk-faint">لا يوجد</span>}</Row>
            <Row label="على الزبون">
              {owed.length ? (
                <span className="desk-owed">
                  {owed.map((p) => (
                    <span key={p.currency} className={p.amount > 0 ? "desk-owed-due" : "desk-owed-credit"}>
                      {p.amount > 0 ? "عليه " : "له "}
                      <Money amount={p.amount} currency={currencyLabel(p.currency)} />
                    </span>
                  ))}
                </span>
              ) : (
                <span className="desk-faint">مسدَّد</span>
              )}
            </Row>
            <Row label="الطبق">
              <StatusCell status={device.dishStatus} what="الطبق" />
            </Row>
            <Row label="الواي فاي">
              <StatusCell status={device.wifiStatus} what="الواي فاي" />
            </Row>
            <Row label="آخر قراءة ناجحة">
              <span className={`desk-updated${stale ? " is-stale" : ""}`}>
                {formatRelativeTime(device.lastSuccessfulScanAt) ?? "لم يُقرأ من Starlink بعد"}
                {stale && device.lastSuccessfulScanAt && <span className="desk-tag desk-tag-soon">قديمة - حدّثها من الهاتف</span>}
              </span>
            </Row>
          </dl>
        )}

        {tab === "device" && (
          <dl className="desk-kvs">
            <Row label="KIT">{device.kitNumber ? <bdi dir="ltr" className="desk-num">{device.kitNumber}</bdi> : <span className="desk-faint">—</span>}</Row>
            <Row label="الرقم التسلسلي">{device.serialNumber ? <bdi dir="ltr" className="desk-num">{device.serialNumber}</bdi> : <span className="desk-faint">—</span>}</Row>
            <Row label="رقم الحساب">{device.accountNumber ? <bdi dir="ltr" className="desk-num">{device.accountNumber}</bdi> : <span className="desk-faint">—</span>}</Row>
            <Row label="نوع الجهاز">{device.deviceName || <span className="desk-faint">—</span>}</Row>
            <Row label="بريد Starlink">{device.starlinkAccountEmail ? <bdi dir="ltr" className="desk-email-full">{device.starlinkAccountEmail}</bdi> : <span className="desk-faint">—</span>}</Row>
            <Row label="كلمة مرور الواي فاي">
              <Secret value={device.wifiPassword} />
            </Row>
            <Row label="كلمة مرور البريد">
              <Secret value={device.expectedEmailPassword} />
            </Row>
          </dl>
        )}

        {tab === "money" && (
          <div className="desk-money">
            <div className="desk-panel-row-actions">
              <button type="button" className="desk-btn" onClick={onPay}>
                تسجيل دفعة
              </button>
              <button type="button" className="desk-btn desk-btn-quiet" onClick={onStatement}>
                الكشف الكامل
              </button>
            </div>
            {newest.length === 0 ? (
              <p className="desk-faint">لا توجد عمليات على هذا الجهاز بعد.</p>
            ) : (
              <table className="desk-mini-table">
                <thead>
                  <tr>
                    <th scope="col">التاريخ</th>
                    <th scope="col">العملية</th>
                    <th scope="col">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {newest.slice(0, 40).map((e) => (
                    <tr key={e.id}>
                      <td>
                        <bdi dir="ltr" className="desk-num">{e.date}</bdi>
                      </td>
                      <td dir="auto">{e.note || (e.kind === "debit" ? "شحن" : "دفعة")}</td>
                      <td className={e.kind === "debit" ? "desk-owed-due" : "desk-owed-credit"}>
                        {e.kind === "debit" ? "عليه " : "له "}
                        <Money amount={e.amount} currency={currencyLabel(e.currency)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "renewal" && (
          <dl className="desk-kvs">
            <Row label="تاريخ التوقف">
              <span className="desk-renewal">
                <bdi dir="ltr" className="desk-num">{renewalDateLabel(date)}</bdi>
                <RenewalTag date={date} />
              </span>
            </Row>
            <Row label="المتبقي">{date ? daysRemainingLabel(date) ?? "—" : "—"}</Row>
            {device.pendingCancellationDate && <Row label="إلغاء مجدول">{device.pendingCancellationDate}</Row>}
            {device.pendingStandbyDate && <Row label="ينتقل إلى SIS">{device.pendingStandbyDate}</Row>}
            {device.outsideHome && <Row label="خارج بلده">{`${device.outsideHome.daysRemaining} يوم متبقٍ`}</Row>}
            {device.renewalDayMismatch && <Row label="قراءة مختلفة">{`قرأ يوم ${device.renewalDayMismatch.day} - راجعها في البطاقة`}</Row>}
            <Row label="آخر الشحنات">
              {shipments.length === 0 ? (
                <span className="desk-faint">لا شحنات بعد</span>
              ) : (
                <span className="desk-list-inline">
                  {shipments.slice(0, 6).map((e) => (
                    <span key={e.id}>
                      <bdi dir="ltr" className="desk-num">{e.date}</bdi> · <Money amount={e.amount} currency={currencyLabel(e.currency)} />
                    </span>
                  ))}
                </span>
              )}
            </Row>
          </dl>
        )}

        {tab === "notes" && (
          <div className="desk-notes">
            {note?.text ? <p dir="auto">{note.text}</p> : <p className="desk-faint">لا ملاحظة على هذا الجهاز. اكتبها من «كل الإجراءات».</p>}
            {note?.history?.length ? (
              <ul>
                {note.history.slice(0, 10).map((h) => (
                  <li key={h.at}>
                    <bdi dir="ltr" className="desk-num">{h.at.slice(0, 10)}</bdi> <span dir="auto">{h.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {tab === "all" && <div className="desk-full-card">{renderCard(device)}</div>}
      </div>
    </div>
  );
}
