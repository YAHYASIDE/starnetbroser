"use client";

/**
 * 💰 The pieces of «حسابي» as a financial dashboard (logic: lib/moneyDashboard.ts) - a folding
 * section, the four summary cards, the currencies, the quick comparisons, the money alerts and the
 * search results. The page wires them to its records and sheets.
 */

import { ReactNode, useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { cashCurrencyLabel } from "@/lib/cashCurrencies";
import {
  compareDirection,
  currencyShares,
  MONEY_SECTIONS,
  type CurrencyHolding,
  type MoneyAlert,
  type MoneySearchItem,
  type MoneySectionId,
  type MoneySummary,
  type MonthCompareMode,
  type QuickComparison,
  type SummaryKey,
} from "@/lib/moneyDashboard";

function mru(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(value)))}`;
}

/** A sentence with yyyy-mm-dd dates in it: each date kept left-to-right inside the Arabic text. */
function Dated({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d{4}-\d{2}-\d{2})/).map((part, i) =>
        /^\d{4}-\d{2}-\d{2}$/.test(part) ? (
          <bdi key={i} dir="ltr">
            {part}
          </bdi>
        ) : (
          part
        ),
      )}
    </>
  );
}

function amount(value: number, code: string): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(value) * 100) / 100)} ${cashCurrencyLabel(code)}`;
}

/** A section with a title row that folds it (the page keeps which ones are open). It stays mounted
 * while folded (`hidden`), so a figure inside it never has to be recomputed to open. */
export function MoneySection({
  id,
  open,
  onToggle,
  badge,
  tone,
  children,
  tour,
}: {
  id: MoneySectionId;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  tone?: "good" | "bad" | "warn";
  children: ReactNode;
  tour?: string;
}) {
  const meta = MONEY_SECTIONS.find((s) => s.id === id)!;
  return (
    <section className={`dash-section money-section money-section-${id}`} id={`money-${id}`} aria-labelledby={`money-${id}-title`} data-tour={tour}>
      <div className="dash-section-head">
        <button type="button" className="dash-section-toggle" aria-expanded={open} aria-controls={`money-${id}-body`} onClick={onToggle}>
          <span className="dash-section-icon" aria-hidden="true">
            {meta.icon}
          </span>
          <h2 id={`money-${id}-title`}>{meta.title}</h2>
          {badge !== undefined && badge !== null && badge !== "" && <span className={`dash-section-badge money-badge${tone ? ` money-badge-${tone}` : ""}`}>{badge}</span>}
          <span className={`dash-chevron${open ? " dash-chevron-open" : ""}`} aria-hidden="true">
            ⌄
          </span>
        </button>
      </div>
      <div id={`money-${id}-body`} className="dash-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

const SUMMARY_TONES: Record<SummaryKey, string> = { available: "money-card-have", net: "money-card-net", obligations: "money-card-owe", receivables: "money-card-owed" };

/** أولًا: four big cards - ≈ أوقية big, each real currency under it; a tap shows how it's counted. */
export function SummaryCards({ summary, onOpenSection }: { summary: MoneySummary; onOpenSection: (key: SummaryKey) => void }) {
  const [openKey, setOpenKey] = useState<SummaryKey | null>(null);
  return (
    <div className="money-summary" data-tour="money-summary">
      <div className="money-cards">
        {summary.figures.map((f) => {
          const currencies = Object.entries(f.byCurrency).filter(([, v]) => Math.abs(v) > 0.005);
          const isOpen = openKey === f.key;
          return (
            <div key={f.key} className={`money-card ${SUMMARY_TONES[f.key]}${f.key === "net" && f.mru < 0 ? " is-loss" : ""}${isOpen ? " money-card-open" : ""}`}>
              <button type="button" className="money-card-main" aria-expanded={isOpen} onClick={() => setOpenKey(isOpen ? null : f.key)}>
                <span className="money-card-label">
                  <span aria-hidden="true">{f.icon}</span> {f.label}
                </span>
                <strong className="money-card-value">
                  <bdi dir="ltr">≈ {mru(f.mru)}</bdi> <small>أوقية</small>
                </strong>
                {currencies.length > 0 && (
                  <span className="money-card-currencies">
                    {currencies.map(([code, v]) => (
                      <bdi key={code} dir="ltr">
                        {amount(v, code)}
                      </bdi>
                    ))}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="money-card-how">
                  <p>{f.how}</p>
                  <button type="button" className="text-action" onClick={() => onOpenSection(f.key)}>
                    التفاصيل ←
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="money-summary-note">
        في يدك الآن (المتاح − الالتزامات): <bdi dir="ltr">≈ {mru(summary.inHandMru)}</bdi> أوقية · الأرقام الكبيرة تقريبية بأسعار الصرف المسجلة، وتحتها المبالغ الحقيقية بعملاتها.
      </p>
    </div>
  );
}

const SHARE_COLORS = ["var(--chart-1)", "var(--green)", "var(--orange)", "var(--violet)", "var(--yellow)", "var(--mint)"];

/** 💱 Every currency: what I have / what's owed / what I owe, plus the distribution of what I have. */
export function CurrenciesBody({ holdings, onRates }: { holdings: CurrencyHolding[]; onRates: () => void }) {
  const shares = currencyShares(holdings);
  if (holdings.length === 0) return <p className="party-empty">لا توجد مبالغ بعد.</p>;
  return (
    <>
      {shares.length > 1 && (
        <div className="money-shares">
          <div className="money-shares-bar" role="img" aria-label={shares.map((s) => `${s.label} ${Math.round(s.pct)}%`).join("، ")}>
            {shares.map((s, i) => (
              <span key={s.code} style={{ width: `${s.pct}%`, background: SHARE_COLORS[i % SHARE_COLORS.length] }} />
            ))}
          </div>
          <div className="money-shares-legend">
            {shares.map((s, i) => (
              <span key={s.code}>
                <i style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} aria-hidden="true" /> {s.label} <bdi dir="ltr">{Math.round(s.pct)}%</bdi>
              </span>
            ))}
          </div>
          <small className="settings-hint">توزيع ما عندك (الكاش والحسابات والمحافظ) بين العملات، بالأوقية التقريبية.</small>
        </div>
      )}
      <ul className="money-currency-list">
        {holdings.map((h) => (
          <li key={h.code}>
            <div className="money-currency-head">
              <strong>{h.label}</strong>
              {h.rate ? (
                <small>
                  <bdi dir="ltr">1 $ = {formatAmount(h.rate)}</bdi>
                </small>
              ) : (
                <small className="money-out">بلا سعر صرف</small>
              )}
            </div>
            <div className="money-currency-grid">
              <span>عندك</span>
              <bdi dir="ltr">{amount(h.have, h.code)}</bdi>
              {Math.abs(h.owed) > 0.005 && (
                <>
                  <span>لك</span>
                  <bdi dir="ltr" className="money-in">
                    {amount(h.owed, h.code)}
                  </bdi>
                </>
              )}
              {Math.abs(h.owe) > 0.005 && (
                <>
                  <span>عليك</span>
                  <bdi dir="ltr" className="money-out">
                    {amount(-h.owe, h.code)}
                  </bdi>
                </>
              )}
              <span>الصافي</span>
              <strong>
                <bdi dir="ltr">{amount(h.net, h.code)}</bdi>
                {h.code !== "MRU" && h.netMru !== undefined && (
                  <small>
                    {" "}
                    ≈ <bdi dir="ltr">{mru(h.netMru)}</bdi> أوقية
                  </small>
                )}
              </strong>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="text-action" onClick={onRates}>
        💱 أسعار الصرف ←
      </button>
    </>
  );
}

/** ⚖️ ثالثًا: today vs the same day last month, this month vs last month. */
export function QuickCompareBody({ comparisons, mode, onMode }: { comparisons: QuickComparison[]; mode: MonthCompareMode; onMode: (mode: MonthCompareMode) => void }) {
  return (
    <>
      <div className="dash-chips" role="radiogroup" aria-label="الشهر الحالي مقابل">
        {(
          [
            ["same", "نفس الأيام من الشهر الماضي"],
            ["full", "الشهر الماضي كاملًا"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`dash-chip${mode === m ? " dash-chip-on" : ""}`} onClick={() => onMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {comparisons.map((c) => (
        <div key={c.id} className={`money-compare money-compare-${c.status}`}>
          <strong className="money-compare-title">{c.title}</strong>
          <small className="dash-period-note">
            <bdi dir="ltr">{c.range.from === c.range.to ? c.range.from : `${c.range.from} ← ${c.range.to}`}</bdi> مقابل{" "}
            <bdi dir="ltr">{c.previous.from === c.previous.to ? c.previous.from : `${c.previous.from} ← ${c.previous.to}`}</bdi>
          </small>
          {c.note && (
            <p className={`money-compare-note${c.status !== "ok" ? " is-warn" : ""}`}>
              <Dated text={c.note} />
            </p>
          )}
          {c.status !== "noData" && (
            <ul className="dash-compare">
              {c.rows.map((row) => {
                const dir = compareDirection(row, c.status);
                return (
                  <li key={row.key}>
                    <span className="dash-compare-label">{row.label}</span>
                    <span className="dash-compare-values">
                      <strong>
                        <bdi dir="ltr">{row.count ? row.current : mru(row.current)}</bdi>
                      </strong>
                      <small>
                        كان <bdi dir="ltr">{row.count ? row.previous : mru(row.previous)}</bdi> · الفرق{" "}
                        <bdi dir="ltr">{`${row.diff > 0 ? "+" : ""}${row.count ? row.diff : mru(row.diff)}`}</bdi>
                      </small>
                    </span>
                    <span className={`dash-change${dir.tone === "good" ? " dash-change-good" : dir.tone === "bad" ? " dash-change-bad" : dir.tone === "none" ? " dash-change-none" : ""}`}>
                      <bdi dir="ltr">{dir.text}</bdi>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      <small className="settings-hint">من السجلات فقط (الأرباح، الإيرادات، التحصيل، المصروفات، التجديدات) بالأوقية. الأرصدة القديمة لا تُحفظ، فلا تُقارن.</small>
    </>
  );
}

const SEVERITY_CLASS: Record<MoneyAlert["severity"], string> = { critical: "money-alert-critical", warn: "money-alert-warn", info: "money-alert-info" };

/** 🔔 The money alerts - each opens what it's about. */
export function MoneyAlertsList({ alerts, onOpen }: { alerts: MoneyAlert[]; onOpen: (alert: MoneyAlert) => void }) {
  if (alerts.length === 0) return <p className="party-empty">✅ لا تنبيهات على أرصدتك.</p>;
  return (
    <ul className="money-alerts">
      {alerts.map((a) => (
        <li key={a.key}>
          <button type="button" className={`money-alert ${SEVERITY_CLASS[a.severity]}`} onClick={() => onOpen(a)}>
            <span className="money-alert-icon" aria-hidden="true">
              {a.icon}
            </span>
            <span className="money-alert-text">
              <strong>
                <Dated text={a.title} />
              </strong>
              <small>
                <Dated text={a.detail} />
              </small>
            </span>
            <span className="money-line-go" aria-hidden="true">
              ‹
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** رابعًا: the search box and its results (each opens the record it found). */
export function MoneySearchBox({ text, onText, hits, onPick }: { text: string; onText: (text: string) => void; hits: MoneySearchItem[]; onPick: (hit: MoneySearchItem) => void }) {
  return (
    <div className="money-search" data-tour="money-search">
      <div className="reports-search">
        <input
          className="search-input"
          type="search"
          dir="rtl"
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="ابحث: محفظة، عملة، زبون، مورد، مندوب، دين، مبلغ…"
          aria-label="ابحث في حسابي"
        />
        {text && (
          <button type="button" className="reports-search-clear" aria-label="مسح البحث" onClick={() => onText("")}>
            ×
          </button>
        )}
      </div>
      {text.trim() && (
        <div className="reports-search-results" role="listbox" aria-label="نتائج البحث">
          {hits.length === 0 ? (
            <p className="party-empty">لا نتائج لـ«{text.trim()}».</p>
          ) : (
            hits.map((hit) => (
              <button key={hit.id} type="button" className="global-search-row" onClick={() => onPick(hit)}>
                <span className="global-search-icon" aria-hidden="true">
                  {hit.icon}
                </span>
                <span className="global-search-text">
                  <strong>{hit.title}</strong>
                  {hit.subtitle && <small dir="auto">{hit.subtitle}</small>}
                </span>
                <span className="global-search-kind">{hit.kindLabel}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
