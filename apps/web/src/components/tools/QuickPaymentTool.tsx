"use client";

import { FrancHint } from "../FrancHint";
import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { localDay } from "@/lib/eveningSummary";
import { deviceMatchesQuery } from "@/lib/homeInsights";
import { computeBalanceByCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, type LedgerCurrency, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/ledgerStore";
import { fitPayMethod, methodLabel, francNote, PAY_CURRENCIES, PAY_CURRENCY_LABELS, payMethodsFor, toLedgerPayment, type PayCurrency } from "@/lib/payCurrency";
import { buildReceiptWhatsAppMessage } from "@/lib/receipt";
import { notifyPaymentTelegram } from "@/lib/telegram";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { ToolsData } from "./useToolsData";

/** A name handed over (e.g. from a kept payment promise) to start the search with. */
export const QUICK_PAY_QUERY_KEY = "starnet.quickPayQuery";

function takeHandedQuery(): string {
  try {
    const value = window.sessionStorage.getItem(QUICK_PAY_QUERY_KEY) ?? "";
    window.sessionStorage.removeItem(QUICK_PAY_QUERY_KEY);
    return value;
  } catch {
    return "";
  }
}

/** 💵 A customer's payment in three taps: find the device, amount, save - same records as the
 * card's «إضافة دفعة» (ledger, FIFO allocations, the till when it's cash). */
export function QuickPaymentTool({ data }: { data: ToolsData }) {
  const [query, setQuery] = useState(() => (typeof window === "undefined" ? "" : takeHandedQuery()));
  const [device, setDevice] = useState<StarlinkAccountSummary | null>(null);
  const [amount, setAmount] = useState("");
  // أوقية / سيفا (كاش) / دولار / 🟠 فرانك (أورانج / نيتا) - فرانك is saved as سيفا ÷5 (payCurrency.ts).
  const [currency, setCurrency] = useState<PayCurrency>("MRU");
  const [chosenMethod, setMethod] = useState<PaymentMethod>("cash");
  const method = fitPayMethod(currency, chosenMethod);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; receipt?: string } | null>(null);
  const [ledger, setLedger] = useState(data.ledger);

  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    return data.accounts
      .filter((a) => !a.deletedAt && !a.archivedAt && deviceMatchesQuery(query, a, a.clientId ? data.clients[a.clientId] : undefined))
      .slice(0, 8);
  }, [query, data.accounts, data.clients]);

  function pick(a: StarlinkAccountSummary) {
    setDevice(a);
    setDone(null);
    setError(null);
    const owed = computeBalanceByCurrency(ledger[a.id] ?? []);
    const firstOwed = (Object.entries(owed).find(([, v]) => (v ?? 0) > 0.005)?.[0] ?? a.renewalPlan?.saleCurrency ?? "MRU") as LedgerCurrency;
    if (LEDGER_CURRENCIES.includes(firstOwed)) setCurrency(firstOwed);
  }

  function save() {
    if (!device) return;
    const value = Number(amount);
    if (!(value > 0)) return setError("المبلغ غير صحيح");
    const date = localDay(new Date());
    const stored = toLedgerPayment(currency, value);
    const result = saveClientDevicePayment(
      ledger,
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      { amount: stored.amount, currencyCode: stored.currency, date, paymentMethod: method, cashMoved: method === "cash" },
    );
    if (!result.ok) return setError(result.message);
    setLedger(result.ledgerStore);
    const entries = result.ledgerStore[device.id] ?? [];
    const payment = entries[entries.length - 1]!;
    const client = device.clientId ? data.clients[device.clientId] : undefined;
    const balanceAfter = computeBalanceByCurrency(entries)[stored.currency] ?? 0;
    notifyPaymentTelegram({
      deviceName: device.name,
      clientName: client?.name,
      amount: stored.amount,
      currency: stored.currency,
      method: methodLabel(method, stored.currency, stored.amount),
      balanceAfter,
      date,
      representativeId: device.representativeId,
    });
    const receipt = buildWhatsAppLink(device.phone || client?.phone, buildReceiptWhatsAppMessage({ payment, entries, deviceName: device.name, clientName: client?.name }));
    setDone({
      text: `✓ سُجّلت ${stored.amount.toLocaleString("en-US")} ${LEDGER_CURRENCY_LABELS[stored.currency]}${currency === "FRANC" ? ` (${francNote(currency, value)})` : ""} على ${device.name}${balanceAfter > 0.005 ? ` - المتبقي ${Math.round(balanceAfter).toLocaleString("en-US")}` : " - لا شيء متبقٍّ ✓"}`,
      receipt: receipt ?? undefined,
    });
    setAmount("");
  }

  const owed = device ? computeBalanceByCurrency(ledger[device.id] ?? []) : {};
  const owedText = Object.entries(owed)
    .filter(([, v]) => (v ?? 0) > 0.005)
    .map(([code, v]) => `${Math.round(v!).toLocaleString("en-US")} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`)
    .join(" + ");

  return (
    <div className="tool-body">
      {!device ? (
        <>
          <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم الزبون أو الجهاز أو الهاتف أو KIT" autoFocus />
          <ul className="tool-list">
            {matches.map((a) => {
              const client = a.clientId ? data.clients[a.clientId] : undefined;
              return (
                <li key={a.id}>
                  <button type="button" className="tool-pick" onClick={() => pick(a)}>
                    <strong>📡 {a.name}</strong>
                    {client && <small>{client.name}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
          {query.trim().length >= 2 && matches.length === 0 && <p className="settings-hint">لا نتائج.</p>}
        </>
      ) : (
        <div className="tool-form">
          <div className="tool-row">
            <div>
              <strong>📡 {device.name}</strong>
              <small>{owedText ? `عليه ${owedText}` : "لا شيء عليه ✓"}</small>
            </div>
            <button type="button" className="text-action" onClick={() => setDevice(null)}>
              تغيير
            </button>
          </div>
          <div className="tool-form-row">
            <input className="search-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={currency === "FRANC" ? "المبلغ بالفرانك" : "المبلغ"} autoFocus />
            <select value={currency} onChange={(e) => setCurrency(e.target.value as PayCurrency)} aria-label="العملة">
              {PAY_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {PAY_CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          {currency === "FRANC" && <FrancHint amount={amount} />}
          <div className="tool-chips">
            {payMethodsFor(currency).map((m) => (
              <button key={m} type="button" className={`tool-chip${method === m ? " tool-chip-on" : ""}`} onClick={() => setMethod(m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {error && <p className="settings-hint telegram-stopped">{error}</p>}
          <button type="button" className="dialog-primary" onClick={save}>
            💵 تسجيل الدفعة
          </button>
          {method === "cash" && <p className="settings-hint">النقد يُضاف إلى الكاش تلقائياً.</p>}
        </div>
      )}
      {done && (
        <div className="tool-goal">
          <strong className="telegram-running">{done.text}</strong>
          {done.receipt && (
            <a className="tool-wa" href={done.receipt} target="_blank" rel="noreferrer">
              🧾 إرسال سند القبض واتساب
            </a>
          )}
        </div>
      )}
    </div>
  );
}
