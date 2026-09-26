"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Currency,
  CurrencyStore,
  convertAmount,
  getCurrency,
  listCurrencies,
  loadCurrencyStore,
  saveCurrencyStore,
  setCurrencyEnabled,
  setCurrencyRate,
  upsertCurrency,
} from "@/lib/currencyStore";
import { COUNTRY_CURRENCIES } from "@/lib/countryCurrencies";
import { formatAmount } from "@/lib/formatAmount";

function formatRate(currency: Currency): string {
  return `1 USD = ${currency.rateFromUsd} ${currency.symbol}`;
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-u-nu-latn");
  } catch {
    return iso;
  }
}

/**
 * A searchable currency picker for the converter's "من"/"إلى" fields - a plain `<select>` renders
 * as the phone's own full-screen native picker (no search, awkward once the registry grows past a
 * handful of currencies), so this reuses the same search+list pattern already built for the
 * "إضافة عملة جديدة" country picker (.client-picker) instead.
 */
function CurrencyPickerField({
  label,
  currencies,
  value,
  onChange,
}: {
  label: string;
  currencies: Currency[];
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = currencies.find((c) => c.code === value);
  const queryNormalized = query.trim().toLowerCase();
  const matches = queryNormalized
    ? currencies.filter(
        (c) => c.name.toLowerCase().includes(queryNormalized) || c.code.toLowerCase().includes(queryNormalized),
      )
    : currencies;

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="form-field">
      <span>{label}</span>
      {open ? (
        <div className="client-picker">
          <input
            className="search-input"
            autoFocus
            placeholder="ابحث عن عملة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="client-picker-list">
            {matches.length === 0 && <p className="client-picker-empty">لا توجد عملة مطابقة</p>}
            {matches.map((c) => (
              <button key={c.code} type="button" className="client-picker-option" onClick={() => select(c.code)}>
                <span>{c.name}</span>
                <span dir="ltr">{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" className="currency-picker-trigger" onClick={() => setOpen(true)}>
          <span>{selected ? `${selected.code} - ${selected.name}` : "اختر عملة"}</span>
          <span aria-hidden="true">⌄</span>
        </button>
      )}
    </div>
  );
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
  const [listQuery, setListQuery] = useState("");

  // Currency converter (amount in `convFrom` -> `convTo`, pivoting through USD via
  // convertAmount) - convTo is only ever set explicitly by the operator picking one; otherwise it
  // resolves to the first available currency that isn't already convFrom, so the tool is useful
  // immediately without forcing a hardcoded default that might not even be in this operator's
  // registry (e.g. "MRU" isn't seeded by anything - it's added like any other currency).
  const [convAmount, setConvAmount] = useState("1");
  const [convFrom, setConvFrom] = useState("USD");
  const [convTo, setConvTo] = useState("");

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
  const activeCurrencies = listCurrencies(store);

  const listQueryNormalized = listQuery.trim().toLowerCase();
  const filteredCurrencies = listQueryNormalized
    ? currencies.filter(
        (c) =>
          c.name.toLowerCase().includes(listQueryNormalized) ||
          c.code.toLowerCase().includes(listQueryNormalized) ||
          c.symbol.toLowerCase().includes(listQueryNormalized),
      )
    : currencies;

  const effectiveConvTo =
    convTo && getCurrency(store, convTo)
      ? convTo
      : (activeCurrencies.find((c) => c.code !== convFrom)?.code ?? convFrom);
  const toCurrency = getCurrency(store, effectiveConvTo);
  const convAmountNum = Number(convAmount);
  const convResult = convertAmount(store, convAmountNum, convFrom, effectiveConvTo);
  // "أسفلها" - shown right below the main converted result, the SAME source amount always
  // expressed in USD and in the business's own internal SIFA currency too - two constant
  // reference lines the operator asked to always see, whatever the "من"/"إلى" pair happens to be
  // (even when one of them duplicates the main result). Silently absent only when that currency
  // was never added to the registry at all.
  const usdEquivalent = convertAmount(store, convAmountNum, convFrom, "USD");
  const sifaEquivalent = convertAmount(store, convAmountNum, convFrom, "SIFA");

  function swapConverterCurrencies() {
    setConvFrom(effectiveConvTo);
    setConvTo(convFrom);
  }

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">العملات وأسعار الصرف</h1>
      </div>

      <section className="section currency-converter">
        <h2 className="section-title">محول العملات</h2>
        <div className="currency-converter-row">
          <label className="form-field">
            <span>المبلغ</span>
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              step="any"
              dir="ltr"
              value={convAmount}
              onChange={(e) => setConvAmount(e.target.value)}
            />
          </label>
          <CurrencyPickerField label="من" currencies={activeCurrencies} value={convFrom} onChange={setConvFrom} />
        </div>

        <div className="currency-converter-swap-row">
          <button
            type="button"
            className="currency-converter-swap-btn"
            onClick={swapConverterCurrencies}
            title="عكس اتجاه التحويل"
            aria-label="عكس اتجاه التحويل"
          >
            ⇄
          </button>
        </div>

        <div className="currency-converter-row">
          <CurrencyPickerField label="إلى" currencies={activeCurrencies} value={effectiveConvTo} onChange={setConvTo} />
        </div>

        {convResult !== undefined && toCurrency ? (
          <>
            {/* Two equally-prominent boxes side by side - the converted amount facing its USD
             * equivalent - rather than one big result with a small muted line underneath, so the
             * USD comparison is exactly as clear/readable as the main result itself. */}
            <div className="currency-converter-results">
              <div className="currency-converter-result-box">
                <span className="currency-converter-result-label">{toCurrency.name}</span>
                <strong dir="ltr">{formatAmount(convResult)} {toCurrency.symbol}</strong>
              </div>
              {usdEquivalent !== undefined && (
                <div className="currency-converter-result-box currency-converter-result-box-usd">
                  <span className="currency-converter-result-label">بالدولار الأمريكي</span>
                  <strong dir="ltr">{formatAmount(usdEquivalent)} USD</strong>
                </div>
              )}
            </div>

            {sifaEquivalent !== undefined && (
              <div className="currency-converter-equivalents">
                <span dir="ltr">≈ {formatAmount(sifaEquivalent)} سيفا</span>
              </div>
            )}
          </>
        ) : (
          <div className="currency-converter-result">
            <span className="settings-hint">أدخل مبلغًا صحيحًا لعرض التحويل</span>
          </div>
        )}
      </section>

      <section className="section">
        <p className="settings-hint">
          الدولار الأمريكي هو العملة المرجعية الثابتة (لا يمكن تعديل سعره). سعر كل عملة أخرى هو قيمة
          1 دولار بهذه العملة - تغييره هنا لا يُغيّر أي معاملة سابقة، فسعر الصرف يُحفظ داخل كل معاملة
          لحظة تسجيلها.
        </p>

        <div className="form-field currency-list-search-field">
          <input
            className="search-input"
            placeholder="ابحث عن عملة بالاسم أو الرمز"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
          />
        </div>

        <ul className="currency-list">
          {filteredCurrencies.length === 0 && <p className="client-picker-empty">لا توجد عملة مطابقة</p>}
          {filteredCurrencies.map((currency) => (
            <li key={currency.code} className={`currency-row${currency.enabled ? "" : " currency-row-disabled"}`}>
              <div className="currency-row-main">
                <strong>{currency.name}</strong>
                <span className="currency-row-code" dir="ltr">{currency.code}</span>
              </div>
              {editingCode === currency.code ? (
                <div className="currency-row-edit">
                  <input
                    className="search-input"
                    type="number" lang="en"
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
                    type="number" lang="en"
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
                    type="number" lang="en"
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
