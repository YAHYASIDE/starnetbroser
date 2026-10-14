"use client";

import { DateInput } from "./DateInput";
import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client } from "@/lib/clientStore";
import { listCurrencies, loadCurrencyStore } from "@/lib/currencyStore";
import { addPromise, loadPromises, savePromises, validatePromise } from "@/lib/paymentPromises";
import { PartySheet } from "./AccountsSection";

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 🤝 A payment promise for this device's customer, straight from its card (see paymentPromises.ts). */
export function PromiseQuickSheet({ account, client, onClose }: { account: StarlinkAccountSummary; client?: Client; onClose: () => void }) {
  const currencies = useMemo(() => {
    const list = listCurrencies(loadCurrencyStore()).map((c) => ({ code: c.code, label: c.name }));
    return list.length ? list : [{ code: "MRU", label: "أوقية" }];
  }, []);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(account.renewalPlan?.saleCurrency ?? currencies.find((c) => c.code === "MRU")?.code ?? currencies[0]!.code);
  const [dueDate, setDueDate] = useState(isoIn(3));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    const input = {
      clientId: client?.id,
      name: client?.name ?? account.name,
      phone: client?.phone ?? account.phone,
      amount: Number(amount),
      currency,
      dueDate,
      note: [account.name, note.trim()].filter(Boolean).join(" · "),
    };
    const problem = validatePromise(input);
    if (problem) return setError(problem);
    savePromises(addPromise(loadPromises(), input));
    setSaved(true);
    window.setTimeout(onClose, 900);
  }

  return (
    <PartySheet title={`وعد دفع - ${client?.name ?? account.name}`} onClose={onClose}>
      <div className="tool-form promise-quick">
        {saved ? (
          <p className="settings-hint telegram-running">✓ سُجّل الوعد - يظهر في «خطة اليوم» و«التذكيرات» يوم موعده.</p>
        ) : (
          <>
            <div className="tool-form-row">
              <input className="search-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" autoFocus />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="العملة">
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="tool-chips">
              {[
                ["اليوم", 0],
                ["غداً", 1],
                ["بعد 3 أيام", 3],
                ["بعد أسبوع", 7],
              ].map(([label, days]) => (
                <button key={label} type="button" className={`tool-chip${dueDate === isoIn(days as number) ? " tool-chip-on" : ""}`} onClick={() => setDueDate(isoIn(days as number))}>
                  {label}
                </button>
              ))}
            </div>
            <DateInput className="search-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="تاريخ الدفع" />
            <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
            {error && <p className="settings-hint telegram-stopped">{error}</p>}
            <div className="settings-actions">
              <button type="button" className="dialog-primary" onClick={save}>
                حفظ الوعد
              </button>
            </div>
          </>
        )}
      </div>
    </PartySheet>
  );
}
