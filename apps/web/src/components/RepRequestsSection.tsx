"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { duplicateQuestion, findClientDuplicates } from "@/lib/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";
import { ClientStore, createClient, listClients, loadClientStore, saveClientStore } from "@/lib/clientStore";
import { buildNewDeviceHref } from "@/lib/deviceFromSale";
import { localDay } from "@/lib/eveningSummary";
import {
  computeBalanceByCurrency,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerCurrency,
  loadLedgerStore,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
} from "@/lib/ledgerStore";
import { loadRepRequests, pendingRepRequests, RepRequest, resolveRepRequest, saveRepRequests } from "@/lib/repRequests";
import type { Representative } from "@/lib/repStore";
import { notifyPaymentTelegram, sendRepText } from "@/lib/telegram";
import { formatMoneyShort, matchRepDevices } from "@/lib/telegramRepMessages";
import { editFieldName, isRepEditField } from "@/lib/repDeviceMenu";
import { decideRepEdit } from "@/lib/repMenuRecords";
import { recordRepHandover } from "@/lib/repHandover";

interface Props {
  representatives: Representative[];
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  /** After a payment is recorded / a client created, so the page shows the new figures. */
  onChanged: () => void;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 📥 What the reps sent through the bot - nothing is recorded until approved here. */
export function RepRequestsSection({ representatives, accounts, clientStore, onChanged }: Props) {
  const [requests, setRequests] = useState<RepRequest[]>([]);
  useEffect(() => {
    const refresh = () => setRequests(pendingRepRequests(loadRepRequests()));
    refresh();
    // New requests arrive through the bot while this page is open.
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  function resolve(request: RepRequest, status: "approved" | "rejected") {
    const next = resolveRepRequest(loadRepRequests(), request.id, status);
    saveRepRequests(next);
    setRequests(pendingRepRequests(next));
  }

  if (requests.length === 0) return null;
  const repById = new Map(representatives.map((r) => [r.id, r]));
  return (
    <section className="section rep-requests">
      <h2 className="section-title">📥 طلبات المندوبين ({requests.length})</h2>
      <p className="settings-hint">أرسلها المندوبون من بوت تيليغرام - لا يُسجَّل شيء قبل موافقتك.</p>
      <ul className="rep-request-list">
        {requests.map((request) =>
          request.kind === "payment" ? (
            <PaymentRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              accounts={accounts}
              clientStore={clientStore}
              onDone={(status) => {
                resolve(request, status);
                onChanged();
              }}
            />
          ) : request.kind === "handover" ? (
            <HandoverRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              onDone={(status) => {
                resolve(request, status);
                onChanged();
              }}
            />
          ) : request.kind === "edit" ? (
            <EditRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              onDone={() => {
                setRequests(pendingRepRequests(loadRepRequests()));
                onChanged();
              }}
            />
          ) : request.kind === "device" ? (
            <DeviceRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              clientStore={clientStore}
              onRejected={() => {
                resolve(request, "rejected");
                onChanged();
              }}
            />
          ) : (
            <ClientRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              onDone={(status) => {
                resolve(request, status);
                onChanged();
              }}
            />
          ),
        )}
      </ul>
    </section>
  );
}

function PaymentRequestCard({
  request,
  rep,
  accounts,
  clientStore,
  onDone,
}: {
  request: RepRequest;
  rep?: Representative;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  onDone: (status: "approved" | "rejected") => void;
}) {
  const repDevices = useMemo(
    () => accounts.filter((a) => a.representativeId === request.repId && !a.deletedAt),
    [accounts, request.repId],
  );
  const suggested = useMemo(() => {
    if (request.accountId) return request.accountId;
    const matches = request.query ? matchRepDevices(request.query, repDevices, clientStore) : [];
    return matches.length === 1 ? matches[0]!.id : "";
  }, [request, repDevices, clientStore]);
  const [deviceId, setDeviceId] = useState(suggested);
  const [amount, setAmount] = useState(String(request.amount ?? ""));
  const [currency, setCurrency] = useState<LedgerCurrency>(request.currency ?? "MRU");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashMoved, setCashMoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    const device = repDevices.find((a) => a.id === deviceId);
    const value = Number(amount);
    if (!device) return setError("اختر الجهاز");
    if (!(value > 0)) return setError("المبلغ غير صحيح");
    const date = localDay(new Date());
    const result = saveClientDevicePayment(
      loadLedgerStore(),
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      { amount: value, currencyCode: currency, date, note: `استلمها المندوب ${rep?.name ?? ""}`.trim(), paymentMethod: method, cashMoved },
    );
    if (!result.ok) return setError(result.message);
    const balanceAfter = computeBalanceByCurrency(result.ledgerStore[device.id] ?? [])[currency] ?? 0;
    const clientName = device.clientId ? clientStore[device.clientId]?.name : undefined;
    // To the operator's own bot only - the rep gets his confirmation just below.
    notifyPaymentTelegram({ deviceName: device.name, clientName, amount: value, currency, method: PAYMENT_METHOD_LABELS[method], balanceAfter, date });
    await sendRepText(
      request.repId,
      [
        `✅ سُجّلت دفعتك ${formatMoneyShort(value, currency)} عن ${device.name}${clientName ? ` (${clientName})` : ""}`,
        balanceAfter > 0.005 ? `المتبقي على الزبون: ${formatMoneyShort(balanceAfter, currency)}` : "✓ لم يبقَ على الزبون شيء",
      ].join("\n"),
      undefined,
      "money",
    );
    onDone("approved");
  }

  async function reject() {
    if (!window.confirm("رفض طلب الدفعة؟ يُبلَّغ المندوب بذلك.")) return;
    await sendRepText(request.repId, `❌ لم يوافق المسؤول على طلب الدفعة: «${request.text}»`, undefined, "money");
    onDone("rejected");
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>💵 {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">«{request.text}»</p>
      <label className="rep-request-field">
        <span>الجهاز</span>
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">— اختر —</option>
          {repDevices.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.clientId && clientStore[a.clientId] ? ` - ${clientStore[a.clientId]!.name}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="rep-request-row">
        <input className="search-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="المبلغ" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)} aria-label="العملة">
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="طريقة الدفع">
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <label className="toggle-switch-row rep-request-cash">
        <span>{cashMoved ? "💵 وصل المبلغ إلى الصندوق" : "🤝 المبلغ ما زال عند المندوب"}</span>
        <span className={`toggle-switch${cashMoved ? " toggle-switch-on" : ""}`}>
          <input type="checkbox" checked={cashMoved} onChange={(e) => setCashMoved(e.target.checked)} />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void approve()}>
          ✅ تسجيل الدفعة
        </button>
        <button type="button" className="text-action" onClick={() => void reject()}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}

function ClientRequestCard({ request, rep, onDone }: { request: RepRequest; rep?: Representative; onDone: (status: "approved" | "rejected") => void }) {
  const router = useRouter();
  const [name, setName] = useState(request.name ?? "");
  const [phone, setPhone] = useState(request.phone ?? "");
  const [email, setEmail] = useState(request.email ?? "");
  const [kit, setKit] = useState(request.kit ?? "");
  const [error, setError] = useState<string | null>(null);
  const duplicates = useMemo(() => findClientDuplicates({ name, phone }, listClients(loadClientStore())), [name, phone]);

  async function approve() {
    if (!name.trim()) return setError("اكتب اسم الزبون");
    if (duplicates.length > 0 && !window.confirm(duplicateQuestion(duplicates))) return;
    const { store, client } = createClient(loadClientStore(), { name, phone: phone || undefined });
    saveClientStore(store);
    await sendRepText(request.repId, `✅ أُضيف زبونك ${client.name}${email || kit ? " وجهازه" : ""} - ستظهر أجهزته في «📡 أجهزتي» بعد إضافتها.`);
    onDone("approved");
    // The device itself goes through the normal add-device dialog, already filled in.
    router.push(buildNewDeviceHref({ clientId: client.id, representativeId: request.repId, name: email || kit || client.name, email: email || undefined, kit: kit || undefined }));
  }

  async function reject() {
    if (!window.confirm("رفض طلب الزبون؟ يُبلَّغ المندوب بذلك.")) return;
    await sendRepText(request.repId, `❌ لم يوافق المسؤول على إضافة الزبون: «${request.text}»`);
    onDone("rejected");
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>➕ {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">«{request.text}»</p>
      <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الزبون" />
      <input className="search-input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الهاتف" />
      <input className="search-input" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="إيميل الجهاز" />
      <input className="search-input" dir="ltr" value={kit} onChange={(e) => setKit(e.target.value)} placeholder="KIT" />
      <DuplicateWarning hits={duplicates} />
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void approve()}>
          ✅ إضافة الزبون ثم الجهاز
        </button>
        <button type="button" className="text-action" onClick={() => void reject()}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}

/** ✏️ A change the rep asked for from the device menu in the bot - saved only when approved
 * (here, or with ✅ in the owner's bot). */
function EditRequestCard({ request, rep, onDone }: { request: RepRequest; rep?: Representative; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const field = request.field && isRepEditField(request.field) ? editFieldName(request.field) : "معلومة";

  async function decide(approve: boolean) {
    if (!approve && !window.confirm("رفض التعديل؟ يُبلَّغ المندوب بذلك.")) return;
    const result = await decideRepEdit(request, approve, "app");
    if (!result.ok) setError(result.message ?? "تعذّر الحفظ");
    onDone();
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>✏️ {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">
        {field} - {request.deviceName ?? "جهاز"}
      </p>
      <p className="rep-edit-values">
        <span>الحالي: <bdi>{request.oldValue || "—"}</bdi></span>
        <span>الجديد: <strong><bdi>{request.value || "—"}</bdi></strong></span>
      </p>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void decide(true)}>
          ✅ موافق - احفظ التعديل
        </button>
        <button type="button" className="text-action" onClick={() => void decide(false)}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}

/** 🤲 Money the rep says he handed over (money bot) - confirmed here, it's recorded as a cash
 * handover with its cash-register entry. */
function HandoverRequestCard({ request, rep, onDone }: { request: RepRequest; rep?: Representative; onDone: (status: "approved" | "rejected") => void }) {
  const [amount, setAmount] = useState(String(request.amount ?? ""));
  const [currency, setCurrency] = useState<LedgerCurrency>(request.currency ?? "MRU");
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    const value = Number(amount);
    if (!(value > 0)) return setError("المبلغ غير صحيح");
    const result = recordRepHandover(request, value, currency, localDay(new Date()));
    if (!result.ok) return setError(result.message);
    await sendRepText(request.repId, `✅ أكّد المسؤول استلام ${formatMoneyShort(value, currency)} منك - سُجّلت في حسابك.`, undefined, "money");
    onDone("approved");
  }

  async function reject() {
    if (!window.confirm("لم تستلم هذا المبلغ؟ يُبلَّغ المندوب بذلك.")) return;
    await sendRepText(request.repId, `❌ لم يؤكد المسؤول استلام: «${request.text}»`, undefined, "money");
    onDone("rejected");
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>🤲 {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">«{request.text}»</p>
      <div className="rep-request-row">
        <input className="search-input" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" />
        <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void approve()}>
          ✅ استلمته - سجّله
        </button>
        <button type="button" className="text-action" onClick={() => void reject()}>
          ❌ لم أستلمه
        </button>
      </div>
    </li>
  );
}

function digits(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** 📱 A device the rep added in his app, already signed in to Starlink. Approving creates (or
 * reuses, by phone) the client and opens the add-device dialog; the session is restored when that
 * dialog saves (HomeView -> repDeviceAdopt.ts) - cancelling it leaves the request here. */
function DeviceRequestCard({
  request,
  rep,
  clientStore,
  onRejected,
}: {
  request: RepRequest;
  rep?: Representative;
  clientStore: ClientStore;
  onRejected: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(request.name ?? "");
  const [phone, setPhone] = useState(request.phone ?? "");
  const [deviceName, setDeviceName] = useState(request.deviceName ?? "");
  const [error, setError] = useState<string | null>(null);
  const existing = useMemo(
    () => (digits(phone).length >= 8 ? listClients(clientStore).find((c) => digits(c.phone).endsWith(digits(phone).slice(-8))) : undefined),
    [clientStore, phone],
  );

  function approve() {
    if (request.codeMismatch) return setError("الملف لا يُفتح برمز هذا المندوب - أرسل له رمزه من «إدارة» واطلب إعادة الإرسال");
    if (!name.trim() && !existing) return setError("اكتب اسم الزبون");
    let clientId = existing?.id;
    if (!clientId) {
      const { store, client } = createClient(loadClientStore(), { name, phone: phone || undefined });
      saveClientStore(store);
      clientId = client.id;
    }
    router.push(
      buildNewDeviceHref({
        clientId,
        representativeId: request.repId,
        name: deviceName || request.email || request.kit || name,
        email: request.email,
        kit: request.kit,
        repRequestId: request.id,
      }),
    );
  }

  async function reject() {
    if (!window.confirm("رفض هذا الجهاز؟ يُبلَّغ المندوب بذلك.")) return;
    await sendRepText(request.repId, `❌ لم يوافق المسؤول على الجهاز${request.deviceName ? ` ${request.deviceName}` : ""} - يمكنك حذفه من تطبيقك.`);
    onRejected();
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>📱 {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      {request.codeMismatch ? (
        <p className="settings-hint telegram-stopped">🔒 لا يُفتح الملف برمز هذا المندوب - أرسل له رمزه من جديد («إدارة» ← رمز تطبيق المندوب) ثم يعيد الإرسال.</p>
      ) : (
        <p className="rep-request-text">
          جهاز مسجَّل الدخول إلى Starlink
          {request.email ? (
            <>
              {" "}
              · <bdi dir="ltr">{request.email}</bdi>
            </>
          ) : null}
          {request.kit ? (
            <>
              {" "}
              · <bdi dir="ltr">{request.kit}</bdi>
            </>
          ) : null}
        </p>
      )}
      {!request.codeMismatch && (
        <>
          <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الزبون" />
          <input className="search-input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الهاتف" />
          {existing && <p className="settings-hint">👤 زبون موجود: {existing.name} - سيُضاف الجهاز إليه</p>}
          <input className="search-input" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="اسم الجهاز" />
        </>
      )}
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        {!request.codeMismatch && (
          <button type="button" className="dialog-primary" onClick={approve}>
            ✅ إضافة الجهاز مع الدخول
          </button>
        )}
        <button type="button" className="text-action" onClick={() => void reject()}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}
