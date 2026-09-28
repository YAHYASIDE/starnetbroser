"use client";

import { useMemo, useState } from "react";
import { buildQuoteMessage, QUOTE_PRESETS, type QuoteLine, quoteTotals } from "@/lib/quote";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { currencyLabelFor, currencyOptions, moneyText, type ToolsData } from "./useToolsData";

/** 🧾 A price offer for a prospect, sent over WhatsApp - nothing is recorded. */
export function QuoteTool({ data }: { data: ToolsData }) {
  const currencies = currencyOptions(data.currencies);
  const defaultCurrency = currencies.find((c) => c.code === "MRU")?.code ?? currencies[0]!.code;
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([{ label: QUOTE_PRESETS[0]!.label, qty: 1, unitPrice: 0, currency: defaultCurrency }]);
  const [discount, setDiscount] = useState("");
  const [validDays, setValidDays] = useState("3");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const label = currencyLabelFor(data.currencies);
  const quote = useMemo(
    () => ({
      customerName: customerName.trim() || undefined,
      lines,
      discount: Number(discount) > 0 ? { [lines[0]?.currency ?? defaultCurrency]: Number(discount) } : undefined,
      validDays: Number(validDays) || undefined,
      note,
    }),
    [customerName, lines, discount, validDays, note, defaultCurrency],
  );
  const message = buildQuoteMessage(quote, label, new Date());
  const link = buildWhatsAppLink(phone, message);

  function setLine(index: number, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="tool-body">
      <div className="tool-form-row">
        <input className="search-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم الزبون" />
        <input className="search-input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="واتساب" />
      </div>
      <ul className="tool-list">
        {lines.map((line, index) => (
          <li key={index} className="tool-quote-line">
            <input className="search-input" list="quote-presets" value={line.label} onChange={(e) => setLine(index, { label: e.target.value })} placeholder="البند" />
            <div className="tool-quote-nums">
              <input className="search-input" inputMode="numeric" dir="ltr" value={String(line.qty)} onChange={(e) => setLine(index, { qty: Number(e.target.value) || 0 })} aria-label="الكمية" />
              <input className="search-input" inputMode="decimal" dir="ltr" value={line.unitPrice ? String(line.unitPrice) : ""} onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) || 0 })} placeholder="السعر" aria-label="السعر" />
              <select value={line.currency} onChange={(e) => setLine(index, { currency: e.target.value })} aria-label="العملة">
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button type="button" className="text-action" aria-label="حذف البند" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      <datalist id="quote-presets">
        {QUOTE_PRESETS.map((p) => (
          <option key={p.label} value={p.label} />
        ))}
      </datalist>
      <button type="button" className="text-action" onClick={() => setLines((current) => [...current, { label: "", qty: 1, unitPrice: 0, currency: current.at(-1)?.currency ?? defaultCurrency }])}>
        ➕ بند
      </button>
      <div className="tool-form-row">
        <label className="tool-field">
          <span>خصم ({label(lines[0]?.currency ?? defaultCurrency)})</span>
          <input className="search-input" inputMode="decimal" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
        </label>
        <label className="tool-field">
          <span>صالح (أيام)</span>
          <input className="search-input" inputMode="numeric" dir="ltr" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
        </label>
      </div>
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة للزبون (اختياري)" />
      <p className="tool-total">
        المجموع: <strong>{moneyText(quoteTotals(quote), label)}</strong>
      </p>
      <pre className="tool-preview">{message}</pre>
      <div className="settings-actions">
        {link ? (
          <a className="dialog-primary tool-wa-big" href={link} target="_blank" rel="noreferrer">
            إرسال عبر واتساب
          </a>
        ) : (
          <span className="settings-hint">اكتب رقم الواتساب لإرساله</span>
        )}
        <button type="button" className="text-action" onClick={() => void copy()}>
          {copied ? "✓ نُسخ" : "📋 نسخ"}
        </button>
      </div>
    </div>
  );
}
