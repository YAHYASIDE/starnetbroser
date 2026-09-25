"use client";

import { FormEvent, useMemo, useState } from "react";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { formatRelativeTime } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { presentServiceStatus } from "@/lib/status";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { CreateRepresentativeInput, Representative } from "@/lib/repStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { ClientPicker } from "./ClientPicker";
import { RepresentativePicker } from "./RepresentativePicker";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { validateRenewalPlan } from "@/lib/renewalPlan";
import { formatAmount } from "@/lib/formatAmount";
import { getCurrency, listCurrencies, loadCurrencyStore } from "@/lib/currencyStore";

export type AccountDialogMode = "add" | "edit" | "view";

interface Props {
  mode: AccountDialogMode;
  account?: StarlinkAccountSummary;
  /** Add mode only: fields to start the blank account with (e.g. the client a store sale was to). */
  prefill?: Partial<StarlinkAccountSummary>;
  clients: Client[];
  onCreateClient: (input: CreateClientInput) => Client;
  representatives: Representative[];
  onCreateRepresentative: (input: CreateRepresentativeInput) => Representative;
  onClose: () => void;
  onSave: (account: StarlinkAccountSummary) => void;
  onDelete?: (account: StarlinkAccountSummary) => void;
}

const statusOptions = [
  { value: DeviceStatus.GREEN, label: "طبيعي" },
  { value: DeviceStatus.YELLOW, label: "تنبيه" },
  { value: DeviceStatus.RED, label: "غير متصل" },
  { value: DeviceStatus.GRAY, label: "لا توجد بيانات" },
];

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createBlankAccount(): StarlinkAccountSummary {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}`;

  return {
    id,
    customerId: `customer-${id}`,
    name: "",
    phone: "",
    expectedEmail: "",
    deviceName: "Standard Kit",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: dateAfterDays(28),
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GRAY,
    wifiStatus: DeviceStatus.GRAY,
    alertReason: "",
    lastUpdated: "الآن",
    lastSuccessfulScanAt: null,
    planName: "Residential",
  };
}

function inputDate(date: string): string {
  return date.replace(/\//g, "-");
}

function displayValue(value: string | null): string {
  return value?.trim() || "—";
}

export function AccountDialog({
  mode,
  account,
  prefill,
  clients,
  onCreateClient,
  representatives,
  onCreateRepresentative,
  onClose,
  onSave,
  onDelete,
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => account ?? { ...createBlankAccount(), ...prefill }, [account]);
  const [draft, setDraft] = useState(initial);
  // السعر الشهري الثابت - kept as raw strings while typing; all four empty means "no plan".
  const [planSale, setPlanSale] = useState(initial.renewalPlan ? String(initial.renewalPlan.saleAmount) : "");
  const [planSaleCurrency, setPlanSaleCurrency] = useState(initial.renewalPlan?.saleCurrency ?? "MRU");
  const [planCost, setPlanCost] = useState(initial.renewalPlan ? String(initial.renewalPlan.costAmount) : "");
  const [planCostCurrency, setPlanCostCurrency] = useState(initial.renewalPlan?.costCurrency ?? "USD");
  const [planCostPending, setPlanCostPending] = useState(initial.renewalPlan?.costPending ?? false);
  const [planError, setPlanError] = useState<string | null>(null);
  // Every registered currency can be Starlink's cost currency; a hidden one stays listed only
  // when this device's plan already uses it.
  const [currencyStore] = useState(loadCurrencyStore);
  const costCurrencies = useMemo(() => {
    const list = listCurrencies(currencyStore);
    const current = getCurrency(currencyStore, planCostCurrency);
    return current && !list.some((c) => c.code === current.code) ? [...list, current] : list;
  }, [currencyStore, planCostCurrency]);
  const costCurrency = getCurrency(currencyStore, planCostCurrency);
  const isView = mode === "view";
  const title = mode === "add" ? "إضافة حساب جديد" : mode === "edit" ? "تعديل الحساب" : "معلومات الحساب";
  const clientName = (clientId?: string) => clients.find((c) => c.id === clientId)?.name;
  const representativeName = (representativeId?: string) => representatives.find((r) => r.id === representativeId)?.name;
  // Shown as a small colored badge next to the plan NAME itself (rule: never the generic "نشط"
  // word standing in for the plan's own name - see extractPlanName's own doc for that bug).
  const planStatus = presentServiceStatus(draft.serviceStatus);

  function update<K extends keyof StarlinkAccountSummary>(key: K, value: StarlinkAccountSummary[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // Tracked as its OWN state, never re-derived from draft.phone on every render - real, confirmed
  // bug this fixes: combinePhoneNumber intentionally returns "" once the local number is still
  // empty (never persists a bare country code with no digits), which - if the dial code were
  // instead derived fresh from draft.phone each time - silently forgot the operator's just-picked
  // country the moment they picked it BEFORE typing any digits (a completely natural order).
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial.phone).localNumber);

  function updatePhoneDialCode(dialCode: string) {
    setPhoneDialCode(dialCode);
    update("phone", combinePhoneNumber(dialCode, phoneLocalNumber));
  }

  function updatePhoneLocalNumber(localNumber: string) {
    setPhoneLocalNumber(localNumber);
    update("phone", combinePhoneNumber(phoneDialCode, localNumber));
  }

  const extraEmails = draft.extraEmails ?? [];

  function updateExtraEmail(index: number, field: "address" | "password", value: string) {
    update("extraEmails", extraEmails.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  }

  function addExtraEmail() {
    if (extraEmails.length >= 2) return;
    update("extraEmails", [...extraEmails, { address: "", password: "" }]);
  }

  function removeExtraEmail(index: number) {
    update("extraEmails", extraEmails.filter((_, i) => i !== index));
  }

  function confirmDelete() {
    if (!account || !onDelete) return;
    if (window.confirm(`هل أنت متأكد من حذف حساب "${account.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      onDelete(account);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isView) return;

    // Transferring an already-linked device to a different client is a meaningful, easy-to-mistake
    // action (it moves every future statement/accounting entry with it) - a first-time link from
    // "الزبون غير محدد" needs no confirmation, only an actual change of owner does.
    if (mode === "edit" && account?.clientId && draft.clientId && account.clientId !== draft.clientId) {
      const fromName = clientName(account.clientId) ?? "الزبون الحالي";
      const toName = clientName(draft.clientId) ?? "الزبون الجديد";
      if (!window.confirm(`هل تريد نقل هذا الجهاز من "${fromName}" إلى "${toName}"؟`)) return;
    }

    // Same reasoning as the client transfer above - reassigning an already-linked device to a
    // different rep affects future commission attribution, so it gets its own confirmation.
    if (
      mode === "edit" &&
      account?.representativeId &&
      draft.representativeId &&
      account.representativeId !== draft.representativeId
    ) {
      const fromName = representativeName(account.representativeId) ?? "المندوب الحالي";
      const toName = representativeName(draft.representativeId) ?? "المندوب الجديد";
      if (!window.confirm(`هل تريد نقل هذا الجهاز من المندوب "${fromName}" إلى "${toName}"؟`)) return;
    }

    let renewalPlan: StarlinkAccountSummary["renewalPlan"];
    if (planSale.trim() || planCost.trim()) {
      renewalPlan = {
        saleAmount: Number(planSale),
        saleCurrency: planSaleCurrency,
        costAmount: Number(planCost),
        costCurrency: planCostCurrency.trim().toUpperCase(),
        costPending: planCostPending || undefined,
      };
      const planProblem = validateRenewalPlan(renewalPlan);
      if (planProblem) {
        setPlanError(planProblem);
        return;
      }
    }
    setPlanError(null);

    const trimmedExtraEmails = extraEmails
      .map((entry) => ({ address: entry.address.trim(), password: entry.password?.trim() || undefined }))
      .filter((entry) => entry.address.length > 0);

    onSave({
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
      expectedEmail: draft.expectedEmail?.trim() || undefined,
      expectedEmailPassword: draft.expectedEmailPassword?.trim() || undefined,
      extraEmails: trimmedExtraEmails.length > 0 ? trimmedExtraEmails : undefined,
      wifiPassword: draft.wifiPassword?.trim() || undefined,
      kitNumber: draft.kitNumber.trim(),
      serialNumber: draft.serialNumber.trim(),
      rechargeDate: draft.rechargeDate.replace(/-/g, "/"),
      balanceDue: draft.balanceDue.trim() || "0",
      planName: draft.planName.trim(),
      alertReason: draft.alertReason.trim(),
      lastUpdated: "الآن",
      renewalPlan,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="account-dialog-title">{title}</h2>
            <p>{isView ? "بيانات الحساب المسجلة" : "تُحفظ البيانات على هذا الجهاز في الوضع التجريبي"}</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        {isView ? (
          <div className="account-info-grid">
            <div><span>اسم الزبون</span><strong>{clientName(draft.clientId) ?? "الزبون غير محدد"}</strong></div>
            <div><span>المندوب</span><strong>{representativeName(draft.representativeId) ?? "غير محدد"}</strong></div>
            <div><span>اسم الحساب / البطاقة</span><strong>{displayValue(draft.name)}</strong></div>
            {draft.starlinkAccountHolderName && (
              <div><span>الاسم من Starlink</span><strong>{draft.starlinkAccountHolderName}</strong></div>
            )}
            <div><span>رقم الهاتف</span><strong dir="ltr">{draft.phone ? `+${draft.phone}` : "—"}</strong></div>
            <div>
              <span>الخطة</span>
              <strong>
                {displayValue(draft.planName)}
                {planStatus && (
                  <span className={`badge ${planStatus.className} account-info-plan-status`}>{planStatus.label}</span>
                )}
              </strong>
            </div>
            <div><span>KIT</span><strong dir="ltr">{displayValue(draft.kitNumber)}</strong></div>
            <div><span>Serial</span><strong dir="ltr">{displayValue(draft.serialNumber)}</strong></div>
            <div><span>موعد التجديد</span><strong dir="ltr">{displayValue(draft.rechargeDate)}</strong></div>
            <div><span>الرصيد المستحق لـStarlink</span><strong dir="ltr">{draft.currency}{displayValue(draft.balanceDue)}</strong></div>
            <div><span>حالة الجهاز</span><strong>{statusOptions.find((item) => item.value === draft.dishStatus)?.label ?? "—"}</strong></div>
            <div><span>حالة Wi-Fi</span><strong>{statusOptions.find((item) => item.value === draft.wifiStatus)?.label ?? "—"}</strong></div>
            {draft.accountNumber && <div><span>رقم الحساب</span><strong dir="ltr">{draft.accountNumber}</strong></div>}
            {draft.subscriptionId && <div><span>رقم الاشتراك</span><strong dir="ltr">{draft.subscriptionId}</strong></div>}
            {draft.starlinkId && <div><span>معرف Starlink</span><strong dir="ltr">{draft.starlinkId}</strong></div>}
            {draft.dataUsageGb && <div><span>إجمالي استهلاك الباقة</span><strong dir="ltr">{draft.dataUsageGb} GB</strong></div>}
            {draft.starlinkAccountEmail && (
              <div><span>البريد الإلكتروني (Starlink)</span><strong dir="ltr">{draft.starlinkAccountEmail}</strong></div>
            )}
            {draft.expectedEmail && (
              <div><span>البريد الإلكتروني الرئيسي</span><strong dir="ltr">{draft.expectedEmail}</strong></div>
            )}
            {draft.expectedEmailPassword && (
              <div><span>كلمة سر البريد الرئيسي</span><strong dir="ltr">{draft.expectedEmailPassword}</strong></div>
            )}
            {(draft.extraEmails ?? []).map((entry, index) => (
              <div key={index}>
                <span>بريد إضافي {index + 1}</span>
                <strong dir="ltr">{entry.address}{entry.password ? ` - ${entry.password}` : ""}</strong>
              </div>
            ))}
            {draft.wifiPassword && (
              <div><span>كلمة سر Wi-Fi</span><strong dir="ltr">{draft.wifiPassword}</strong></div>
            )}
            {emailsMismatch(draft.expectedEmail, draft.starlinkAccountEmail) && (
              <div className="info-wide info-warning">
                <span>تحذير</span>
                <strong>البريد الإلكتروني من Starlink لا يطابق المتوقع</strong>
              </div>
            )}
            {draft.pendingCancellationDate && (
              <div className="info-wide info-notice">
                <span>ملاحظة</span>
                <strong>
                  الجهاز على وضع إيقاف الاشتراك - لن يتوقف الآن، بل سيتوقف تلقائيًا بتاريخ{" "}
                  <span dir="ltr">{draft.pendingCancellationDate}</span> ما لم يُستأنف الاشتراك من Starlink
                </strong>
              </div>
            )}
            {formatRelativeTime(draft.lastSuccessfulScanAt) && (
              <div><span>آخر مزامنة من Starlink</span><strong>{formatRelativeTime(draft.lastSuccessfulScanAt)}</strong></div>
            )}
            <div className="info-wide"><span>التنبيه</span><strong>{displayValue(draft.alertReason)}</strong></div>
          </div>
        ) : (
          <form className="account-form" onSubmit={submit}>
            <div className="form-field form-wide">
              <span>اسم الزبون</span>
              <ClientPicker
                clients={clients}
                selectedClientId={draft.clientId}
                onSelect={(clientId) => update("clientId", clientId)}
                onCreateClient={onCreateClient}
              />
            </div>

            <div className="form-field form-wide">
              <span>المندوب</span>
              <RepresentativePicker
                representatives={representatives}
                selectedRepresentativeId={draft.representativeId}
                onSelect={(representativeId) => update("representativeId", representativeId)}
                onCreateRepresentative={onCreateRepresentative}
              />
            </div>

            <label className="form-field form-wide">
              <span>اسم الحساب / البطاقة *</span>
              <input required value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="مثال: منزل الحي الشرقي" />
            </label>

            <div className="form-field form-wide">
              <span>رقم الهاتف (واتساب)</span>
              <div className="phone-input-row">
                <select
                  className="phone-country-select"
                  dir="ltr"
                  value={phoneDialCode}
                  onChange={(e) => updatePhoneDialCode(e.target.value)}
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
                  value={phoneLocalNumber}
                  onChange={(e) => updatePhoneLocalNumber(e.target.value)}
                  placeholder="رقم الهاتف بدون رمز الدولة"
                />
              </div>
            </div>

            <label className="form-field">
              <span>البريد الإلكتروني الرئيسي (لمطابقة حساب Starlink)</span>
              <input
                dir="ltr"
                type="email"
                value={draft.expectedEmail ?? ""}
                onChange={(e) => update("expectedEmail", e.target.value)}
                placeholder="اختياري - يُستخدم لتنبيهك إذا اختلف عن بريد Starlink"
              />
            </label>

            <label className="form-field">
              <span>كلمة سر البريد الرئيسي</span>
              <input
                dir="ltr"
                value={draft.expectedEmailPassword ?? ""}
                onChange={(e) => update("expectedEmailPassword", e.target.value)}
                placeholder="اختياري"
              />
            </label>

            <div className="form-field form-wide">
              <span>بريد إلكتروني إضافي (حتى بريدين إضافيين، أي 3 بريدات كحد أقصى للجهاز)</span>
              <div className="extra-emails-list">
                {extraEmails.map((entry, index) => (
                  <div className="extra-email-row" key={index}>
                    <input
                      dir="ltr"
                      type="email"
                      value={entry.address}
                      onChange={(e) => updateExtraEmail(index, "address", e.target.value)}
                      placeholder="بريد إضافي"
                    />
                    <input
                      dir="ltr"
                      value={entry.password ?? ""}
                      onChange={(e) => updateExtraEmail(index, "password", e.target.value)}
                      placeholder="كلمة السر"
                    />
                    <button type="button" className="ledger-entry-delete" onClick={() => removeExtraEmail(index)} aria-label="حذف البريد الإضافي">×</button>
                  </div>
                ))}
              </div>
              {extraEmails.length < 2 && (
                <button type="button" className="text-action" onClick={addExtraEmail}>+ إضافة بريد آخر</button>
              )}
            </div>

            <label className="form-field">
              <span>الخطة</span>
              <input value={draft.planName} onChange={(e) => update("planName", e.target.value)} placeholder="Residential" />
            </label>

            <label className="form-field">
              <span>موعد التجديد *</span>
              <input required type="date" lang="en-GB" dir="ltr" value={inputDate(draft.rechargeDate)} onChange={(e) => update("rechargeDate", e.target.value)} />
            </label>

            <label className="form-field">
              <span>رقم KIT</span>
              <input dir="ltr" value={draft.kitNumber} onChange={(e) => update("kitNumber", e.target.value)} placeholder="KIT…" />
            </label>

            <label className="form-field">
              <span>Serial Number</span>
              <input dir="ltr" value={draft.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} placeholder="Serial…" />
            </label>

            <label className="form-field">
              <span>الرصيد المستحق لـStarlink</span>
              <input type="number" lang="en" min="0" step="0.01" dir="ltr" value={draft.balanceDue} onChange={(e) => update("balanceDue", e.target.value)} />
            </label>

            <label className="form-field">
              <span>العملة</span>
              <select value={draft.currency} onChange={(e) => update("currency", e.target.value)}>
                <option value="$">USD ($)</option>
                <option value="USDT ">USDT</option>
                <option value="MRU ">MRU</option>
                <option value="SIFA ">SIFA</option>
              </select>
            </label>

            <label className="form-field">
              <span>حالة الجهاز</span>
              <select value={draft.dishStatus} onChange={(e) => update("dishStatus", e.target.value as DeviceStatus)}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="form-field">
              <span>حالة Wi-Fi</span>
              <select value={draft.wifiStatus} onChange={(e) => update("wifiStatus", e.target.value as DeviceStatus)}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="form-field">
              <span>كلمة سر Wi-Fi</span>
              <input dir="ltr" value={draft.wifiPassword ?? ""} onChange={(e) => update("wifiPassword", e.target.value)} placeholder="اختياري" />
            </label>

            <fieldset className="form-field form-wide renewal-plan-fields">
              <legend>💰 السعر الشهري الثابت</legend>
              <div className="renewal-plan-row">
                <label className="renewal-plan-field">
                  <span>سعر البيع للزبون</span>
                  <input
                    type="number" lang="en"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    inputMode="decimal"
                    placeholder="0"
                    value={planSale}
                    onChange={(e) => setPlanSale(e.target.value)}
                  />
                </label>
                <label className="renewal-plan-field">
                  <span>عملة البيع</span>
                  <select value={planSaleCurrency} onChange={(e) => setPlanSaleCurrency(e.target.value)}>
                    {LEDGER_CURRENCIES.map((c) => (
                      <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]} ({c})</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="renewal-plan-row">
                <label className="renewal-plan-field">
                  <span>تكلفة Starlink</span>
                  <input
                    type="number" lang="en"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    inputMode="decimal"
                    placeholder="0"
                    value={planCost}
                    onChange={(e) => setPlanCost(e.target.value)}
                  />
                </label>
                <label className="renewal-plan-field">
                  <span>عملة التكلفة</span>
                  <select value={planCostCurrency} onChange={(e) => setPlanCostCurrency(e.target.value)}>
                    {!costCurrency && <option value={planCostCurrency}>{planCostCurrency || "اختر"}</option>}
                    {costCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </label>
              </div>
              {costCurrency && costCurrency.code !== "USD" && (
                <small className="renewal-plan-rate">
                  سعر الصرف: <bdi dir="ltr">1 USD = {formatAmount(costCurrency.rateFromUsd)} {costCurrency.code}</bdi>
                  {Number(planCost) > 0 && (
                    <>
                      {" "}· التكلفة ≈ <bdi dir="ltr">{formatAmount(Number(planCost) / costCurrency.rateFromUsd)} USD</bdi>
                    </>
                  )}
                </small>
              )}
              {!costCurrency && planCostCurrency && (
                <small className="account-card-alert">عملة {planCostCurrency} غير مسجّلة - أضفها من صفحة العملات</small>
              )}
              <div className="renewal-plan-field">
                <span>تكلفة Starlink عند التجديد</span>
                <div className="renewal-cost-status" role="radiogroup" aria-label="تكلفة Starlink عند التجديد">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!planCostPending}
                    className={`renewal-cost-option${!planCostPending ? " renewal-cost-option-active" : ""}`}
                    onClick={() => setPlanCostPending(false)}
                  >
                    ✓ مدفوعة
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={planCostPending}
                    className={`renewal-cost-option renewal-cost-option-d${planCostPending ? " renewal-cost-option-active" : ""}`}
                    onClick={() => setPlanCostPending(true)}
                  >
                    D لم تُدفع بعد
                  </button>
                </div>
              </div>
              <small className="settings-hint">
                عند الضغط على "تجديد" تُسجَّل الشحنة تلقائيًا بهذا السعر وبأسعار الصرف الحالية (ويمكنك تغيير ✓/D وقتها). اتركه فارغًا للتسجيل اليدوي.
              </small>
              {planError && <span className="account-card-alert ledger-form-error">{planError}</span>}
            </fieldset>

            <label className="form-field form-wide">
              <span>تنبيه أو ملاحظة</span>
              <textarea rows={2} value={draft.alertReason} onChange={(e) => update("alertReason", e.target.value)} placeholder="اختياري" />
            </label>

            <div className="dialog-actions form-wide">
              {mode === "edit" && onDelete && (
                <button className="dialog-danger" type="button" onClick={confirmDelete}>حذف الحساب</button>
              )}
              <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
              <button className="dialog-primary" type="submit">{mode === "add" ? "إضافة الحساب" : "حفظ التعديل"}</button>
            </div>
          </form>
        )}

        {isView && (
          <div className="dialog-actions form-wide">
            {onDelete && <button className="dialog-danger" type="button" onClick={confirmDelete}>حذف الحساب</button>}
            <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
          </div>
        )}
      </section>
    </div>
  );
}
