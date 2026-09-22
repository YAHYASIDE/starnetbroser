"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Currency,
  CurrencyStore,
  listCurrencies,
  loadCurrencyStore,
  saveCurrencyStore,
  setCurrencyEnabled,
  setCurrencyRate,
  upsertCurrency,
} from "@/lib/currencyStore";
import { COUNTRY_CURRENCIES } from "@/lib/countryCurrencies";

function formatRate(currency: Currency): string {
  return `1 USD = ${currency.rateFromUsd} ${currency.symbol}`;
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar");
  } catch {
    return iso;
  }
}

export default function CurrenciesPage() {
  const [store, setStore] = useState<CurrencyStore>({});
  useEffect(() => setStore(loadCurrencyStore()), []);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [rateAmount, setRateAmount] = useState("");
  const [rateUsdAmount, setRateUsdAmount] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  function persist(next: CurrencyStore) {
    setStore(next);
    saveCurrencyStore(next);
  }

  function startEditRate(currency: Currency) {
    setEditingCode(currency.code);
    setEditRate(String(currency.rateFromUsd));
  }

  function saveEditRate(code: string) {
    const rate = Number(editRate);
    if (!Number.isFinite(rate) || rate <= 0) return;
    persist(setCurrencyRate(store, code, rate));
    setEditingCode(null);
  }

  function toggleEnabled(currency: Currency) {
    persist(setCurrencyEnabled(store, currency.code, !currency.enabled));
  }

  function handleCountryChange(country: string) {
    setSelectedCountry(country);
    setCountryQuery("");
    const option = COUNTRY_CURRENCIES.find((o) => o.country === country);
    setNewCode(option?.code ?? "");
    setNewName(option?.name ?? "");
    setNewSymbol(option?.symbol ?? "");
  }

  function resetAddForm() {
    setSelectedCountry("");
    setCountryQuery("");
    setNewCode("");
    setNewName("");
    setNewSymbol("");
    setRateAmount("");
    setRateUsdAmount("1");
    setFormError(null);
  }

  const countryQueryNormalized = countryQuery.trim().toLowerCase();
  const countryMatches = COUNTRY_CURRENCIES.filter((o) => o.code !== "USD").filter(
    (o) => o.country.includes(countryQuery.trim()) || o.code.toLowerCase().includes(countryQueryNormalized),
  );

  function submitNewCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCode.trim() || !newName.trim() || !newSymbol.trim()) {
      setFormError("اختر الدولة أولًا");
      return;
    }
    const amount = Number(rateAmount);
    const usdAmount = Number(rateUsdAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(usdAmount) || usdAmount <= 0) {
      setFormError("أدخل مبلغين صحيحين أكبر من صفر");
      return;
    }
    setFormError(null);
    persist(upsertCurrency(store, { code: newCode, name: newName, symbol: newSymbol, rateFromUsd: amount / usdAmount }));
    resetAddForm();
    setShowAddForm(false);
  }

  const currencies = listCurrencies(store, true);

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">العملات وأسعار الصرف</h1>
      </div>

      <section className="section">
        <p className="settings-hint">
          الدولار الأمريكي هو العملة المرجعية الثابتة (لا يمكن تعديل سعره). سعر كل عملة أخرى هو قيمة
          1 دولار بهذه العملة - تغييره هنا لا يُغيّر أي معاملة سابقة، فسعر الصرف يُحفظ داخل كل معاملة
          لحظة تسجيلها.
        </p>

        <ul className="currency-list">
          {currencies.map((currency) => (
            <li key={currency.code} className={`currency-row${currency.enabled ? "" : " currency-row-disabled"}`}>
              <div className="currency-row-main">
                <strong>{currency.name}</strong>
                <span className="currency-row-code" dir="ltr">{currency.code}</span>
              </div>
              {editingCode === currency.code ? (
                <div className="currency-row-edit">
                  <input
                    className="search-input"
                    type="number"
                    min="0"
                    step="0.0001"
                    dir="ltr"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                  />
                  <button className="dialog-primary" type="button" onClick={() => saveEditRate(currency.code)}>حفظ</button>
                  <button className="dialog-secondary" type="button" onClick={() => setEditingCode(null)}>إلغاء</button>
                </div>
              ) : (
                <div className="currency-row-info">
                  <span dir="ltr">{formatRate(currency)}</span>
                  <span className="currency-row-updated">آخر تحديث: {formatUpdatedAt(currency.updatedAt)}</span>
                </div>
              )}
              {currency.code !== "USD" && editingCode !== currency.code && (
                <div className="currency-row-actions">
                  <button className="text-action" type="button" onClick={() => startEditRate(currency)}>تعديل السعر</button>
                  <button className="text-action" type="button" onClick={() => toggleEnabled(currency)}>
                    {currency.enabled ? "إخفاء" : "إظهار"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {!showAddForm ? (
          <div className="settings-actions">
            <button className="btn-icon" type="button" onClick={() => setShowAddForm(true)}>+ إضافة عملة جديدة</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submitNewCurrency}>
            <div className="form-field">
              <span>الدولة *</span>
              {selectedCountry ? (
                <div className="client-picker-selected">
                  <span className="client-picker-selected-name">{selectedCountry} ({newCode})</span>
                  <button type="button" className="text-action" onClick={() => handleCountryChange("")}>تغيير</button>
                </div>
              ) : (
                <div className="client-picker">
                  <input
                    className="search-input"
                    placeholder="ابحث عن الدولة"
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                  />
                  <div className="client-picker-list">
                    {countryMatches.length === 0 && <p className="client-picker-empty">لا توجد دولة مطابقة</p>}
                    {countryMatches.map((o) => (
                      <button key={o.country} type="button" className="client-picker-option" onClick={() => handleCountryChange(o.country)}>
                        <span>{o.country}</span>
                        <span dir="ltr">{o.code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedCountry && (
              <div className="currency-row-edit">
                <label className="form-field">
                  <span>{newSymbol}</span>
                  <input
                    className="search-input"
                    type="number"
                    min="0"
                    step="any"
                    dir="ltr"
                    placeholder="المبلغ"
                    value={rateAmount}
                    onChange={(e) => setRateAmount(e.target.value)}
                  />
                </label>
                <span aria-hidden="true">=</span>
                <label className="form-field">
                  <span>دولار</span>
                  <input
                    className="search-input"
                    type="number"
                    min="0"
                    step="any"
                    dir="ltr"
                    value={rateUsdAmount}
                    onChange={(e) => setRateUsdAmount(e.target.value)}
                  />
                </label>
              </div>
            )}

            {formError && <div className="account-card-alert">{formError}</div>}
            <div className="settings-actions">
              <button className="btn-icon" type="submit">إضافة</button>
              <button className="btn-icon" type="button" onClick={() => { setShowAddForm(false); resetAddForm(); }}>إلغاء</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
