"use client";

import { shareText } from "@/lib/shareText";
import { buildFullDeviceMessage } from "@/lib/whatsapp";
import { DateInput } from "./DateInput";
import { FormEvent, useMemo, useRef, useState } from "react";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { formatRelativeTime } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { cleanPlanName, effectiveServiceStatus, presentServiceStatus } from "@/lib/status";
import { countryFlag, countryFromIso2 } from "@/lib/countryCurrencies";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { CreateRepresentativeInput, Representative } from "@/lib/repStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { ClientPicker } from "./ClientPicker";
import { usedPasswords } from "@/lib/usedPasswords";
import { buildCreatedAccount, creationProblem } from "@/lib/accountCreation";
import { DuplicateWarning, FieldDuplicate } from "./DuplicateWarning";
import { duplicateQuestion, findDeviceDuplicates } from "@/lib/duplicates";
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
  /** Every device, to warn when the email / KIT / phone / name is already registered. */
  existingAccounts?: StarlinkAccountSummary[];
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
  existingAccounts = [],
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => account ?? { ...createBlankAccount(), ...prefill }, [account]);
  const [draft, setDraft] = useState(initial);
  // The passwords used most on the other devices - one tap to fill a field.
  const passwordSuggestions = useMemo(() => usedPasswords(existingAccounts ?? []).slice(0, 4).map((p) => p.value), [existingAccounts]);
  // السعر الشهري الثابت - kept as raw strings while typing; all four empty means "no plan".
  const [planSale, setPlanSale] = useState(initial.renewalPlan ? String(initial.renewalPlan.saleAmount) : "");
  const [planSaleCurrency, setPlanSaleCurrency] = useState(initial.renewalPlan?.saleCurrency ?? "MRU");
  const [planCost, setPlanCost] = useState(initial.renewalPlan ? String(initial.renewalPlan.costAmount) : "");
  const [planCostCurrency, setPlanCostCurrency] = useState(initial.renewalPlan?.costCurrency ?? "USD");
  const [planCostPending, setPlanCostPending] = useState(initial.renewalPlan?.costPending ?? true);
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
  const [sendNote, setSendNote] = useState<string | null>(null);
  // 🆕 «إنشاء حساب جديد»: a brand-new Starlink account (new email + «تفعيل Starlink»), instead of
  // adding a device that already has one.
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // A customer added right here isn't in `clients` until the parent re-renders.
  const createdClient = useRef<Client | null>(null);
  const findClient = (clientId?: string) =>
    clients.find((c) => c.id === clientId) ?? (createdClient.current?.id === clientId ? createdClient.current : undefined);

  function createCreationClient(input: CreateClientInput): Client {
    const client = onCreateClient(input);
    createdClient.current = client;
    return client;
  }

  function pickCreationClient(clientId: string | undefined) {
    update("clientId", clientId);
    // The customer's phone, unless one was already typed.
    const phone = findClient(clientId)?.phone;
    if (phone && !phoneLocalNumber) {
      const split = splitPhoneNumber(phone);
      setPhoneDialCode(split.dialCode);
      setPhoneLocalNumber(split.localNumber);
      update("phone", combinePhoneNumber(split.dialCode, split.localNumber));
    }
  }

  function submitCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      fullName: findClient(draft.clientId)?.name ?? "",
      phone: draft.phone,
      kit: draft.kitNumber,
      email: draft.expectedEmail ?? "",
      password: draft.expectedEmailPassword ?? "",
    };
    const problem = creationProblem(input);
    setCreateError(problem);
    if (problem) return;
    if (duplicates.length > 0 && !window.confirm(duplicateQuestion(duplicates))) return;
    onSave(buildCreatedAccount({ ...draft, name: "", kitNumber: "", serialNumber: "", rechargeDate: draft.rechargeDate.replace(/-/g, "/") }, input));
  }

  /** «إرسال البيانات»: the whole device (as edited so far) to WhatsApp / Telegram / anywhere. */
  async function sendDeviceData() {
    const client = clients.find((c) => c.id === draft.clientId);
    const result = await shareText(buildFullDeviceMessage(draft, client), `بيانات ${draft.name}`);
    setSendNote(result === "copied" ? "✓ نُسخت البيانات - الصقها حيث تريد" : result === "failed" ? "تعذّر الإرسال" : null);
  }
  const representativeName = (representativeId?: string) => representatives.find((r) => r.id === representativeId)?.name;
  // Shown as a small colored badge next to the plan NAME itself (rule: never the generic "نشط"
  // word standing in for the plan's own name - see extractPlanName's own doc for that bug).
  const planStatus = presentServiceStatus(effectiveServiceStatus(draft));
  const deviceCountry = countryFromIso2(draft.serviceCountry);

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
  const duplicates = useMemo(
    () => (isView ? [] : findDeviceDuplicates({ id: draft.id, name: draft.name, phone: draft.phone, expectedEmail: draft.expectedEmail, extraEmails, kitNumber: draft.kitNumber }, existingAccounts)),
    [isView, draft.id, draft.name, draft.phone, draft.expectedEmail, extraEmails, draft.kitNumber, existingAccounts],
  );

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

    if (duplicates.length > 0 && !window.confirm(duplicateQuestion(duplicates))) return;

    let renewalPlan: StarlinkAccountSummary["renewalPlan"];
    if (planSale.trim() || planCost.trim()) {
      renewalPlan = {
        saleAmount: Number(planSale),
        saleCurrency: planSaleCurrency,
        costAmount: Number(planCost),
        costCurrency: planCostCurrency.trim().toUpperCase(),
        costPending: planCostPending,
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
      starlinkPassword: draft.starlinkPassword?.trim() || undefined,
      kitNumber: draft.kitNumber.trim(),
      serialNumber: draft.serialNumber.trim(),
      rechargeDate: draft.rechargeDate.replace(/-/g, "/"),
      balanceDue: draft.balanceDue.trim() || "0",
      planName: cleanPlanName(draft.planName) ?? "",
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
            {draft.starlinkPassword && (
              <div><span>كلمة مرور Starlink</span><strong dir="ltr">{draft.starlinkPassword}</strong></div>
            )}
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
        ) : mode === "add" && creating ? (
          // 🆕 A brand-new account: the customer, the KIT/SN on the box, and the new Outlook email
          // to make - then Microsoft's signup and «تفعيل Starlink» open, already filled in.
          <form className="account-form add-device-form" onSubmit={submitCreation}>
            <CreationToggle creating onChange={setCreating} />
            <div className="form-field add-field add-field-client">
              <span className="add-field-label"><b aria-hidden="true">👤</b> الزبون (الاسم الكامل) *</span>
              <ClientPicker clients={clients} selectedClientId={draft.clientId} onSelect={pickCreationClient} onCreateClient={createCreationClient} />
            </div>

            <div className="form-field add-field add-field-phone">
              <span className="add-field-label"><b aria-hidden="true">📞</b> رقم الهاتف</span>
              <div className="phone-input-row">
                <select className="phone-country-select" dir="ltr" value={phoneDialCode} onChange={(e) => updatePhoneDialCode(e.target.value)} aria-label="رمز الدولة">
                  {PHONE_COUNTRY_CODES.map((c) => (
                    <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
                  ))}
                </select>
                <input className="phone-local-input" dir="ltr" type="tel" value={phoneLocalNumber} onChange={(e) => updatePhoneLocalNumber(e.target.value)} placeholder="بدون رمز الدولة" />
              </div>
              <FieldDuplicate hits={duplicates} field="phone" />
            </div>

            <label className="form-field add-field add-field-kit">
              <span className="add-field-label"><b aria-hidden="true">🔢</b> رقم KIT أو SN *</span>
              <input dir="ltr" value={draft.kitNumber} onChange={(e) => update("kitNumber", e.target.value)} placeholder="KIT…" autoCapitalize="characters" />
              <FieldDuplicate hits={duplicates} field="kit" />
            </label>

            <label className="form-field add-field add-field-email">
              <span className="add-field-label"><b aria-hidden="true">📧</b> البريد الجديد (أوتلوك) *</span>
              <input dir="ltr" value={draft.expectedEmail ?? ""} onChange={(e) => update("expectedEmail", e.target.value)} placeholder="name@outlook.com" autoCapitalize="none" />
              <FieldDuplicate hits={duplicates} field="email" />
            </label>

            <label className="form-field add-field add-field-code">
              <span className="add-field-label"><b aria-hidden="true">🔑</b> كلمة مرور البريد * (8 أحرف أو أكثر)</span>
              <input dir="ltr" value={draft.expectedEmailPassword ?? ""} onChange={(e) => update("expectedEmailPassword", e.target.value)} placeholder="كلمة المرور" />
              <PasswordChips values={passwordSuggestions} current={draft.expectedEmailPassword} onPick={(v) => update("expectedEmailPassword", v)} />
            </label>

            <div className="form-field add-field add-field-rep">
              <span className="add-field-label"><b aria-hidden="true">🤝</b> المندوب</span>
              <RepresentativePicker
                representatives={representatives}
                selectedRepresentativeId={draft.representativeId}
                onSelect={(representativeId) => update("representativeId", representativeId)}
                onCreateRepresentative={onCreateRepresentative}
              />
            </div>

            <p className="creation-steps">
              بعد «إنشاء»: ١- تُفتح صفحة إنشاء بريد أوتلوك مكتوبة - أكمل التحقق بيدك. ٢- بعد فتح البريد
              ننتقل إلى «تفعيل Starlink»: يُكتب KIT ويُضغط «متابعة»، ثم الاسم والبريد والهاتف - وتكمل أنت يدوياً.
            </p>

            <DuplicateWarning hits={duplicates} inline={["phone", "kit", "email"]} />
            {createError && <span className="account-card-alert ledger-form-error" role="alert">{createError}</span>}

            <div className="dialog-actions">
              <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
              <button className="dialog-primary" type="submit">🆕 إنشاء</button>
            </div>
          </form>
        ) : mode === "add" ? (
          // A new device needs only what Starlink can't tell us - the rest (KIT, plan, renewal,
          // phone...) comes from the first Starlink sync, or from "تعديل" later.
          <form className="account-form add-device-form" onSubmit={submit}>
            <CreationToggle creating={false} onChange={setCreating} />
            <label className="form-field add-field add-field-email">
              <span className="add-field-label"><b aria-hidden="true">📧</b> البريد الإلكتروني الرئيسي للجهاز</span>
              <input dir="ltr" type="email" value={draft.expectedEmail ?? ""} onChange={(e) => update("expectedEmail", e.target.value)} placeholder="name@example.com" />
              <FieldDuplicate hits={duplicates} field="email" />
            </label>

            <label className="form-field add-field add-field-code">
              <span className="add-field-label"><b aria-hidden="true">🔑</b> كود البريد</span>
              <input dir="ltr" value={draft.expectedEmailPassword ?? ""} onChange={(e) => update("expectedEmailPassword", e.target.value)} placeholder="اختياري" />
              <PasswordChips values={passwordSuggestions} current={draft.expectedEmailPassword} onPick={(v) => update("expectedEmailPassword", v)} />
            </label>

            <label className="form-field add-field add-field-wifi">
              <span className="add-field-label"><b aria-hidden="true">📶</b> كود الواي فاي</span>
              <input dir="ltr" value={draft.wifiPassword ?? ""} onChange={(e) => update("wifiPassword", e.target.value)} placeholder="اختياري" />
              <PasswordChips values={passwordSuggestions} current={draft.wifiPassword} onPick={(v) => update("wifiPassword", v)} />
            </label>

            <div className="form-field add-field add-field-client">
              <span className="add-field-label"><b aria-hidden="true">👤</b> الزبون</span>
              <ClientPicker
                clients={clients}
                selectedClientId={draft.clientId}
                onSelect={(clientId) => update("clientId", clientId)}
                onCreateClient={onCreateClient}
              />
            </div>

            <div className="form-field add-field add-field-rep">
              <span className="add-field-label"><b aria-hidden="true">🤝</b> المندوب</span>
              <RepresentativePicker
                representatives={representatives}
                selectedRepresentativeId={draft.representativeId}
                onSelect={(representativeId) => update("representativeId", representativeId)}
                onCreateRepresentative={onCreateRepresentative}
              />
            </div>

            <label className="form-field add-field add-field-name">
              <span className="add-field-label"><b aria-hidden="true">🏷️</b> اسم الحساب / البطاقة *</span>
              <input required value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="مثال: منزل الحي الشرقي" />
              <FieldDuplicate hits={duplicates} field="name" />
            </label>

            <label className="form-field add-field add-field-note">
              <span className="add-field-label"><b aria-hidden="true">📝</b> ملاحظة</span>
              <textarea rows={2} value={draft.alertReason} onChange={(e) => update("alertReason", e.target.value)} placeholder="اختياري" />
            </label>

            <DuplicateWarning hits={duplicates} inline={["email", "name"]} />

            <div className="dialog-actions">
              <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
              <button className="dialog-primary" type="submit">إضافة الحساب</button>
            </div>
          </form>
        ) : (
          // تعديل الحساب: the same colored fields as "إضافة", plus what Starlink reported about
          // the device; rarely-edited extras stay folded under "المزيد".
          <form className="account-form add-device-form" onSubmit={submit}>
            <label className="form-field add-field add-field-email">
              <span className="add-field-label"><b aria-hidden="true">📧</b> البريد الإلكتروني الرئيسي للجهاز</span>
              <input dir="ltr" type="email" value={draft.expectedEmail ?? ""} onChange={(e) => update("expectedEmail", e.target.value)} placeholder="name@example.com" />
              <FieldDuplicate hits={duplicates} field="email" />
            </label>

            <label className="form-field add-field add-field-half add-field-code">
              <span className="add-field-label"><b aria-hidden="true">🔑</b> كود البريد</span>
              <input dir="ltr" value={draft.expectedEmailPassword ?? ""} onChange={(e) => update("expectedEmailPassword", e.target.value)} placeholder="اختياري" />
              <PasswordChips values={passwordSuggestions} current={draft.expectedEmailPassword} onPick={(v) => update("expectedEmailPassword", v)} />
            </label>

            <label className="form-field add-field add-field-half add-field-wifi">
              <span className="add-field-label"><b aria-hidden="true">📶</b> كود الواي فاي</span>
              <input dir="ltr" value={draft.wifiPassword ?? ""} onChange={(e) => update("wifiPassword", e.target.value)} placeholder="اختياري" />
              <PasswordChips values={passwordSuggestions} current={draft.wifiPassword} onPick={(v) => update("wifiPassword", v)} />
            </label>

            <label className="form-field add-field add-field-code">
              <span className="add-field-label"><b aria-hidden="true">🔐</b> كلمة مرور Starlink (إن كانت غير الكودين)</span>
              <input dir="ltr" value={draft.starlinkPassword ?? ""} onChange={(e) => update("starlinkPassword", e.target.value)} placeholder="اختياري - تُحفظ وحدها حين تتغيّر" />
              <PasswordChips values={passwordSuggestions} current={draft.starlinkPassword} onPick={(v) => update("starlinkPassword", v)} />
            </label>

            <div className="form-field add-field add-field-client">
              <span className="add-field-label"><b aria-hidden="true">👤</b> الزبون</span>
              <ClientPicker
                clients={clients}
                selectedClientId={draft.clientId}
                onSelect={(clientId) => update("clientId", clientId)}
                onCreateClient={onCreateClient}
              />
            </div>

            <div className="form-field add-field add-field-rep">
              <span className="add-field-label"><b aria-hidden="true">🤝</b> المندوب</span>
              <RepresentativePicker
                representatives={representatives}
                selectedRepresentativeId={draft.representativeId}
                onSelect={(representativeId) => update("representativeId", representativeId)}
                onCreateRepresentative={onCreateRepresentative}
              />
            </div>

            <label className="form-field add-field add-field-name">
              <span className="add-field-label"><b aria-hidden="true">🏷️</b> اسم الحساب / البطاقة *</span>
              <input required value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="مثال: منزل الحي الشرقي" />
              <FieldDuplicate hits={duplicates} field="name" />
            </label>

            <p className="add-section-title">🛰️ من Starlink</p>

            <div className="form-field add-field add-field-slname">
              <span className="add-field-label"><b aria-hidden="true">🪪</b> الاسم من الجهاز</span>
              <div className="add-field-value">{draft.starlinkAccountHolderName || "— يُقرأ من Starlink"}</div>
            </div>

            <div className="form-field add-field add-field-half add-field-country">
              <span className="add-field-label"><b aria-hidden="true">🌍</b> الدولة</span>
              <div className="add-field-value">
                {deviceCountry ? `${countryFlag(draft.serviceCountry)} ${deviceCountry.country}` : draft.serviceCountry || "—"}
              </div>
            </div>

            <label className="form-field add-field add-field-half add-field-date">
              <span className="add-field-label"><b aria-hidden="true">📅</b> موعد التجديد</span>
              <DateInput value={inputDate(draft.rechargeDate)} onChange={(e) => update("rechargeDate", e.target.value)} />
            </label>

            <label className="form-field add-field add-field-plan">
              <span className="add-field-label"><b aria-hidden="true">📡</b> الخطة المفعّلة</span>
              <input value={cleanPlanName(draft.planName) ?? ""} onChange={(e) => update("planName", e.target.value)} placeholder="مثال: التجوال - غير محدود" />
            </label>

            <label className="form-field add-field add-field-kit">
              <span className="add-field-label"><b aria-hidden="true">🔢</b> KIT</span>
              <input dir="ltr" value={draft.kitNumber} onChange={(e) => update("kitNumber", e.target.value)} placeholder="KIT…" />
              <FieldDuplicate hits={duplicates} field="kit" />
            </label>

            <label className="form-field add-field add-field-sn">
              <span className="add-field-label"><b aria-hidden="true">🔖</b> SN</span>
              <input dir="ltr" value={draft.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} placeholder="Serial…" />
            </label>

            <label className="form-field add-field add-field-sub">
              <span className="add-field-label"><b aria-hidden="true">🧾</b> رقم الاشتراك</span>
              <input dir="ltr" value={draft.subscriptionId ?? ""} onChange={(e) => update("subscriptionId", e.target.value)} placeholder="SL-…" />
            </label>

            <label className="form-field add-field add-field-note">
              <span className="add-field-label"><b aria-hidden="true">📝</b> ملاحظة</span>
              <textarea rows={2} value={draft.alertReason} onChange={(e) => update("alertReason", e.target.value)} placeholder="اختياري" />
            </label>

            {draft.dotTrace && (
              <p className="dot-trace" dir="ltr">🔍 {draft.dotTrace}</p>
            )}

            <DuplicateWarning hits={duplicates} inline={["email", "name", "kit"]} />

            <details className="add-more">
              <summary>⚙️ المزيد: رقم الهاتف، بريد إضافي، السعر الشهري</summary>
              <div className="add-more-body">
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
              </div>
            </details>

            <button type="button" className="dialog-secondary account-send-data" onClick={() => void sendDeviceData()}>
              📤 إرسال بيانات الجهاز كاملة
            </button>
            {sendNote && <span className="settings-hint">{sendNote}</span>}

            <div className="dialog-actions">
              {onDelete && (
                <button className="dialog-danger" type="button" onClick={confirmDelete}>حذف الحساب</button>
              )}
              <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
              <button className="dialog-primary" type="submit">حفظ التعديل</button>
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

/** The most used passwords as one-tap chips under a password field (not the one already in it). */
/** «➕ جهاز موجود» / «🆕 إنشاء حساب جديد» at the top of «إضافة حساب جديد». */
function CreationToggle({ creating, onChange }: { creating: boolean; onChange: (creating: boolean) => void }) {
  return (
    <div className="creation-toggle" role="tablist">
      <button type="button" role="tab" aria-selected={!creating} className={creating ? "" : "active"} onClick={() => onChange(false)}>➕ جهاز له حساب</button>
      <button type="button" role="tab" aria-selected={creating} className={creating ? "active" : ""} onClick={() => onChange(true)}>🆕 إنشاء حساب جديد</button>
    </div>
  );
}

/** The most used passwords, as a translucent list that floats under the field only while it is
 * tapped (focused) - hidden otherwise, so the form stays short. Narrowed by what is typed. */
function PasswordChips({ values, current, onPick }: { values: string[]; current?: string; onPick: (value: string) => void }) {
  const typed = (current ?? "").trim().toLowerCase();
  const shown = values.filter((v) => v.toLowerCase() !== typed && (!typed || v.toLowerCase().includes(typed)));
  if (shown.length === 0) return null;
  return (
    <span className="password-chips" role="listbox" aria-label="كلمات مرور مقترحة">
      {shown.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={false}
          className="password-chip"
          dir="ltr"
          // Keeps the field focused (the list would close before the tap lands).
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            onPick(v);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          🔑 {v}
        </button>
      ))}
    </span>
  );
}
