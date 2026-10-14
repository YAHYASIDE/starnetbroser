"use client";

import { useState, type CSSProperties } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { buildRepTravelMessage, type ByCurrency, type TravelBook, type TravelGroup, type TravelRepRow } from "@/lib/travelBook";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type RingTone = "total" | "online" | "warning" | "expired" | "suspended" | "violet";

/** One circle: filled by its share of the verified devices, its value inside, its label below. */
function TravelRing({ tone, value, share, label, active, onClick }: { tone: RingTone; value: string | number; share: number; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`status-ring status-ring-${tone}${active ? " status-ring-active" : ""}`}
      aria-pressed={active}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
    >
      <span className="status-ring-dial" style={{ "--share": Math.max(0, Math.min(1, share)) } as CSSProperties}>
        <span className="status-ring-core">
          <span className="status-ring-value">{value}</span>
        </span>
      </span>
      <span className="status-ring-label">{label}</span>
    </button>
  );
}

/** "246k" - a ring holds a short number; the exact amounts are written under the circles. */
function compact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${Math.round(amount / 1000)}k`;
  return formatAmount(amount);
}

function currencyLabel(code: string): string {
  return (LEDGER_CURRENCY_LABELS as Record<string, string>)[code] ?? code;
}

/** One line per currency - never two currencies glued together (his report «50,000 SIFA246,000 MRU»). */
function MoneyLines({ amounts }: { amounts: ByCurrency }) {
  const entries = Object.entries(amounts).filter(([, amount]) => amount !== 0);
  if (entries.length === 0) return <span className="travel-book-money-none">—</span>;
  return (
    <span className="travel-book-money-list">
      {entries.map(([currency, amount]) => (
        <bdi key={currency} dir="ltr" className="travel-book-money-amount">
          {formatAmount(amount)} {currencyLabel(currency)}
        </bdi>
      ))}
    </span>
  );
}

/** 🛂 «✅ الأجهزة التي تم توثيقها» as circles (lib/travelBook.ts): الكل · أجهزتي · أجهزة المندوبين · بلا سعر ·
 * لم يُدفع · ربحي, the money per currency, and for the reps' devices each rep's total, percent and
 * shares with «⚙️ النسبة» and «💬 كشفه». */
export function TravelBookPanel({
  book,
  accounts,
  group,
  onGroup,
  onRepPercent,
  onPostOldDebts,
}: {
  book: TravelBook;
  accounts: StarlinkAccountSummary[];
  group: TravelGroup;
  onGroup: (group: TravelGroup) => void;
  onRepPercent: (repId: string, percent: number | undefined) => void;
  onPostOldDebts: () => void;
}) {
  const [profitOpen, setProfitOpen] = useState(false);
  const [percentRep, setPercentRep] = useState<TravelRepRow | null>(null);
  const total = Math.max(1, book.all);
  const mainCurrency = book.myProfit.MRU !== undefined ? "MRU" : Object.keys(book.myProfit)[0];
  const profitValue = mainCurrency ? compact(book.myProfit[mainCurrency]!) : "0";
  const pick = (next: TravelGroup) => onGroup(group === next ? "all" : next);
  const repGroup = group === "reps" || group.startsWith("rep:");
  const selectedRep = group.startsWith("rep:") ? book.byRep.find((r) => r.repId === group.slice(4)) : undefined;

  return (
    <section className="travel-book" data-tour="travel-earnings" aria-label="الأجهزة الموثقة">
      <div className="status-rings travel-rings">
        <TravelRing tone="total" value={book.all} share={1} label="الكل" active={group === "all"} onClick={() => onGroup("all")} />
        <TravelRing tone="online" value={book.mine} share={book.mine / total} label="🏠 أجهزتي" active={group === "mine"} onClick={() => pick("mine")} />
        <TravelRing tone="violet" value={book.reps} share={book.reps / total} label="👥 مندوبين" active={repGroup} onClick={() => pick("reps")} />
        <TravelRing tone="warning" value={book.unpriced} share={book.unpriced / total} label="💰 بلا سعر" active={group === "unpriced"} onClick={() => pick("unpriced")} />
        <TravelRing tone="expired" value={book.unpaid} share={book.unpaid / total} label="🧾 لم يُدفع" active={group === "unpaid"} onClick={() => pick("unpaid")} />
        <TravelRing tone="suspended" value={profitValue} share={1} label="📈 ربحي" onClick={() => setProfitOpen(true)} />
      </div>

      <div className="travel-book-money">
        <span>💰 حصلنا</span>
        <MoneyLines amounts={book.collected} />
        <span>📈 ربحي</span>
        <MoneyLines amounts={book.myProfit} />
      </div>

      {group === "unpriced" && book.unpriced > 0 && <p className="travel-book-hint">اضغط «💰 السعر» على بطاقة الجهاز - يُسجَّل الدين على صاحبه.</p>}

      {group === "unpaid" && book.noDebt > 0 && (
        <div className="travel-book-hint">
          <span>🧾 {book.noDebt} جهاز سعره سُجّل قبل أن يصير دينًا - ليس على صاحبه شيء بعد.</span>
          <button type="button" className="text-action" onClick={onPostOldDebts}>
            سجّل الدين عليهم
          </button>
        </div>
      )}

      {repGroup && book.byRep.length > 0 && (
        <div className="fault-groups travel-book-reps" role="radiogroup" aria-label="أجهزة أي مندوب؟">
          {book.byRep.map((row) => (
            <button
              key={row.repId}
              type="button"
              className={`fault-group${selectedRep?.repId === row.repId ? " fault-group-active" : ""}`}
              onClick={() => onGroup(selectedRep?.repId === row.repId ? "reps" : `rep:${row.repId}`)}
            >
              👤 {row.name} ({row.count})
            </button>
          ))}
        </div>
      )}

      {repGroup && (selectedRep ? [selectedRep] : book.byRep).map((row) => (
        <RepRow key={row.repId} row={row} accounts={accounts} onPercent={() => setPercentRep(row)} />
      ))}

      {profitOpen && (
        <PartySheet title="📈 ربح التوثيق" onClose={() => setProfitOpen(false)}>
          <div className="travel-book-sheet">
            <div className="travel-book-money">
              <span>💰 حصلنا (كل الأسعار)</span>
              <MoneyLines amounts={book.collected} />
              <span>👥 نصيب المندوبين</span>
              <MoneyLines amounts={book.repShares} />
              <span>📈 ربحي</span>
              <MoneyLines amounts={book.myProfit} />
            </div>
            {book.noPercent > 0 && <p className="settings-hint">⚠️ {book.noPercent} جهاز لمندوب بلا نسبة توثيق بعد - لا يدخل في الربح حتى تضع نسبته («⚙️ النسبة»).</p>}
            {book.unpriced > 0 && <p className="settings-hint">💰 {book.unpriced} جهاز بلا سعر لا يدخل في الحساب.</p>}
            <p className="settings-hint">بلا تكلفة (اختيارك): الربح = السعر، ونصيب المندوب بنسبته المثبّتة على كل جهاز.</p>
            {book.byRep.map((row) => (
              <RepRow key={row.repId} row={row} accounts={accounts} onPercent={() => setPercentRep(row)} />
            ))}
          </div>
        </PartySheet>
      )}

      {percentRep && (
        <RepPercentSheet
          row={percentRep}
          onSave={(percent) => {
            onRepPercent(percentRep.repId, percent);
            setPercentRep(null);
          }}
          onClose={() => setPercentRep(null)}
        />
      )}
    </section>
  );
}

/** A rep's line: his devices' total, his percent, his share and ours, «⚙️ النسبة» and «💬 كشفه». */
function RepRow({ row, accounts, onPercent }: { row: TravelRepRow; accounts: StarlinkAccountSummary[]; onPercent: () => void }) {
  const message = buildRepTravelMessage(row, accounts);
  const link = buildWhatsAppLink(row.phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <div className="travel-book-rep">
      <strong>
        👤 {row.name} · {row.count} جهاز{row.unpriced > 0 ? ` (${row.unpriced} بلا سعر)` : ""}
      </strong>
      <div className="travel-book-money">
        <span>💰 سعر أجهزته</span>
        <MoneyLines amounts={row.total} />
        <span>👤 ربحه{row.percent !== undefined ? ` (${row.percent}%)` : ""}</span>
        <MoneyLines amounts={row.repShare} />
        <span>📈 نصيبي</span>
        <MoneyLines amounts={row.myShare} />
      </div>
      {row.noPercent > 0 && <small className="travel-book-warn">⚠️ {row.noPercent} جهاز بلا نسبة - ضع نسبته</small>}
      <div className="travel-book-actions">
        <button type="button" className="text-action" onClick={onPercent}>
          ⚙️ النسبة{row.percent !== undefined ? ` ${row.percent}%` : ""}
        </button>
        <a className="text-action" href={link} target="_blank" rel="noopener noreferrer">
          💬 كشفه{row.phone ? "" : " (اختر الرقم)"}
        </a>
      </div>
    </div>
  );
}

/** ⚙️ «نسبة التوثيق» of one rep - for new prices, and for his priced devices that have none yet. */
function RepPercentSheet({ row, onSave, onClose }: { row: TravelRepRow; onSave: (percent: number | undefined) => void; onClose: () => void }) {
  const [value, setValue] = useState(row.percent !== undefined ? String(row.percent) : "");
  const number = Number(value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(number) && number >= 0 && number <= 100;
  return (
    <PartySheet title={`⚙️ نسبة التوثيق - ${row.name}`} onClose={onClose}>
      <div className="renewal-lock">
        <label className="renewal-lock-day">
          <span>النسبة %</span>
          <input className="search-input" inputMode="decimal" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </label>
        <p className="settings-hint">
          من سعر كل توثيق لأجهزته (ليست نسبة التجديدات). تُثبَّت على كل جهاز لحظة حفظ سعره: تغييرها لاحقًا لا يغيّر ما سبق
          {row.noPercent > 0 ? ` - وتُطبَّق الآن على ${row.noPercent} جهاز له سعر بلا نسبة.` : "."}
        </p>
        <div className="settings-actions">
          <button type="button" className="dialog-primary" disabled={!valid} onClick={() => onSave(number)}>
            💾 حفظ
          </button>
          {row.percent !== undefined && (
            <button type="button" className="text-action" onClick={() => onSave(undefined)}>
              بلا نسبة
            </button>
          )}
        </div>
      </div>
    </PartySheet>
  );
}
