"use client";

import { FrancHint } from "./FrancHint";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { formatAmount } from "@/lib/formatAmount";
import { fitPayMethod, isFrancMethod, methodLabel, sifaAsFranc, sifaToFranc, PAY_CURRENCIES, PAY_CURRENCY_LABELS, payFormOf, payMethodsFor, toLedgerPayment, type PayCurrency } from "@/lib/payCurrency";
import { duplicateQuestion, findClientDuplicates } from "@/lib/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";
import { Client, ClientStore, createClient, listClients, loadClientStore, saveClientStore } from "@/lib/clientStore";
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
import { claimRepRequest, loadRepRequests, pendingRepRequests, releaseRepRequest, RepRequest, resolveRepRequest, saveRepRequests } from "@/lib/repRequests";
import { repPaymentConfirmation } from "@/lib/repPaymentConfirm";
import type { Representative } from "@/lib/repStore";
import { downloadRepImage, notifyPaymentTelegram, sendRepPhoto, sendRepText } from "@/lib/telegram";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { putProof } from "@/lib/paymentProofStore";
import { formatMoneyShort, matchRepDevices } from "@/lib/telegramRepMessages";
import { editFieldName, isRepEditField } from "@/lib/repDeviceMenu";
import { ACCOUNTS_CHANGED_EVENT, decideRepActivation, decideRepEdit } from "@/lib/repMenuRecords";
import { loadActivationCosts } from "@/lib/repActivation";
import { recordRepHandover, recordRepLoan } from "@/lib/repHandover";
import { approveRepSession } from "@/lib/telegramSessionRunner";

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
    // New requests arrive through the bot while this page is open: shown as soon as the app
    // records them (ACCOUNTS_CHANGED_EVENT), with a slow poll as a safety net.
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
    };
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
          ) : request.kind === "activation" ? (
            <ActivationRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              onDone={() => {
                setRequests(pendingRepRequests(loadRepRequests()));
                onChanged();
              }}
            />
          ) : request.kind === "loan" ? (
            <LoanRequestCard
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
          ) : request.kind === "session" ? (
            <SessionRequestCard
              key={request.id}
              request={request}
              rep={repById.get(request.repId)}
              onDone={() => {
                setRequests(pendingRepRequests(loadRepRequests()));
                onChanged();
              }}
              onRejected={() => {
                resolve(request, "rejected");
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
  // 🟠 A سيفا payment by أورانج / نيتا shows in فرانك, as the rep typed it (payCurrency.ts).
  const [initialPay] = useState(() =>
    request.amount !== undefined ? payFormOf({ currency: request.currency ?? "MRU", amount: request.amount, paymentMethod: request.paymentMethod }) : undefined,
  );
  const [amount, setAmount] = useState(String(initialPay?.amount ?? ""));
  const [payCurrency, setPayCurrency] = useState<PayCurrency>(initialPay?.currency ?? request.currency ?? "MRU");
  const [chosenMethod, setMethod] = useState<PaymentMethod>(request.paymentMethod ?? "cash");
  const method = fitPayMethod(payCurrency, chosenMethod);
  const [proof, setProof] = useState<string | null>(null);
  const [cashMoved, setCashMoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (busy) return;
    const device = repDevices.find((a) => a.id === deviceId);
    if (!device) return setError("اختر الجهاز");
    if (!(Number(amount) > 0)) return setError("المبلغ غير صحيح");
    const { amount: value, currency } = toLedgerPayment(payCurrency, Number(amount));
    // 🔒 Taken BEFORE anything slow (his Oct 2026 double payment): a second tap, a second card of
    // the same message, or a retry after a cut finds it taken and records nothing.
    const claimed = claimRepRequest(loadRepRequests(), request.id);
    if (!claimed) return onDone("approved");
    saveRepRequests(claimed);
    setBusy(true);
    const date = localDay(new Date());
    const result = saveClientDevicePayment(
      loadLedgerStore(),
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      { amount: value, currencyCode: currency, date, note: `استلمها المندوب ${rep?.name ?? ""}`.trim(), paymentMethod: method, cashMoved, entryId: `rep-${request.id}` },
    );
    if (!result.ok) {
      saveRepRequests(releaseRepRequest(loadRepRequests(), request.id));
      setBusy(false);
      return setError(result.message);
    }
    if (result.alreadyRecorded) return onDone("approved");
    if (request.proofFileId) {
      // 📸 The photo he sent the bot becomes the payment's proof, like one attached by hand.
      const dataUrl = proof ?? (await downloadRepImage(request.proofFileId, request.proofBot));
      if (dataUrl) await putProof(result.entryId, dataUrl);
    }
    const balanceAfter = computeBalanceByCurrency(result.ledgerStore[device.id] ?? [])[currency] ?? 0;
    const clientName = device.clientId ? clientStore[device.clientId]?.name : undefined;
    // To the operator's own bot only - the rep gets his confirmation just below.
    notifyPaymentTelegram({ deviceName: device.name, clientName, amount: value, currency, method: methodLabel(method, currency, value), balanceAfter, date });
    await sendRepText(
      request.repId,
      repPaymentConfirmation({ rep, value, currency, device, clientName, balanceAfter, accounts, clientStore, ledgerStore: result.ledgerStore }),
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
      {request.proofFileId && <RepProofPhoto fileId={request.proofFileId} bot={request.proofBot} onLoaded={setProof} />}
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
        <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value as PayCurrency)} aria-label="العملة">
          {PAY_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {PAY_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="طريقة الدفع">
          {payMethodsFor(payCurrency).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      {payCurrency === "FRANC" && <FrancHint amount={amount} />}
      <label className="toggle-switch-row rep-request-cash">
        <span>{cashMoved ? "💵 وصل المبلغ إلى الكاش" : "🤝 المبلغ ما زال عند المندوب"}</span>
        <span className={`toggle-switch${cashMoved ? " toggle-switch-on" : ""}`}>
          <input type="checkbox" checked={cashMoved} onChange={(e) => setCashMoved(e.target.checked)} />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void approve()} disabled={busy}>
          {busy ? "⏳ جارِ التسجيل…" : "✅ تسجيل الدفعة"}
        </button>
        <button type="button" className="text-action" onClick={() => void reject()}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}

/** 📋 A Starlink session the rep pasted in the bot: approved → a new device of his, signed in,
 * then «مزامنة» reads it (telegramSessionRunner.ts). */
function SessionRequestCard({ request, rep, onDone, onRejected }: { request: RepRequest; rep?: Representative; onDone: () => void; onRejected: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const result = await approveRepSession(request.id);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone();
  }

  async function reject() {
    if (!window.confirm("رفض جلسة المندوب؟ تُحذف من التطبيق ويُبلَّغ المندوب.")) return;
    await sendRepText(request.repId, "❌ لم يوافق المسؤول على الجلسة التي أرسلتها.");
    onRejected();
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>📋 {rep?.name ?? "مندوب"}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">{request.text} - جهاز جديد مسجّل الدخول، تُقرأ بياناته بالمزامنة.</p>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" disabled={busy} onClick={() => void approve()}>
          {busy ? "⏳ جارِ الإضافة…" : "✅ أضف الجهاز"}
        </button>
        <button type="button" className="text-action" disabled={busy} onClick={() => void reject()}>
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

/** ⚡ An activation a rep asked for: approving records it on the device like «تجديد» (the
 * customer owes the price, the package's Starlink cost as D, the rep's share) and, when the
 * customer already paid the rep, his payment. */
function ActivationRequestCard({ request, rep, onDone }: { request: RepRequest; rep?: Representative; onDone: () => void }) {
  const savedCost = request.plan ? loadActivationCosts()[request.plan] : undefined;
  const [amount, setAmount] = useState(String(request.amount ?? ""));
  const [currency, setCurrency] = useState<LedgerCurrency>(request.currency ?? "MRU");
  const [costAmount, setCostAmount] = useState(savedCost ? String(savedCost.amount) : "");
  const [costCurrency, setCostCurrency] = useState(savedCost?.currency ?? "USD");
  const [paid, setPaid] = useState<PaymentMethod | "">(request.paymentMethod ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean) {
    if (!approve && !window.confirm("رفض طلب التفعيل؟ يُبلَّغ المندوب بذلك.")) return;
    const value = Number(amount);
    const cost = Number(costAmount);
    if (approve && !(value > 0)) return setError("السعر غير صحيح");
    if (approve && !(cost > 0)) return setError("اكتب تكلفة Starlink لهذه الباقة");
    setBusy(true);
    const result = await decideRepActivation(request, approve, "app", {
      amount: value,
      currency,
      cost: { amount: cost, currency: costCurrency },
      paid: paid || undefined,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message ?? "تعذر التسجيل");
    onDone();
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>⚡ {rep?.name ?? "مندوب"} - تفعيل {request.plan ?? ""}</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-request-text">
        📡 {request.deviceName ?? "جهاز"}
        {request.approvedInBot && " - ✅ وافقت عليه في البوت، أكمل التسجيل هنا"}
      </p>
      <label className="rep-request-field">
        <span>يدفع الزبون</span>
        <div className="rep-request-row">
          <input className="search-input" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="السعر" />
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)} aria-label="عملة السعر">
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </label>
      <label className="rep-request-field">
        <span>تكلفة Starlink (D)</span>
        <div className="rep-request-row">
          <input className="search-input" dir="ltr" inputMode="decimal" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder="مثلاً 50" aria-label="التكلفة" />
          <select className="search-input" value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)} aria-label="عملة التكلفة">
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </label>
      <label className="rep-request-field">
        <span>هل دفع الزبون؟</span>
        <select value={paid} onChange={(e) => setPaid(e.target.value as PaymentMethod | "")}>
          <option value="">⏳ لم يدفع بعد - يبقى ديناً عليه</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              ✅ دفع للمندوب - {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      {paid && isFrancMethod(paid) && currency === "SIFA" && Number(amount) > 0 && (
        <p className="settings-hint franc-hint">🟠 {PAYMENT_METHOD_LABELS[paid]} بالفرانك: {sifaAsFranc(Number(amount))}</p>
      )}
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void decide(true)} disabled={busy}>
          ✅ موافق - سجّل التجديد
        </button>
        <button type="button" className="text-action" onClick={() => void decide(false)} disabled={busy}>
          ❌ رفض
        </button>
      </div>
    </li>
  );
}

/** 📸 The payment photo a rep sent the bot - downloaded only when the operator asks to see it. */
function RepProofPhoto({ fileId, bot, onLoaded }: { fileId: string; bot?: "reps" | "money"; onLoaded?: (dataUrl: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  async function load() {
    setState("loading");
    const url = await downloadRepImage(fileId, bot);
    if (!url) return setState("failed");
    setDataUrl(url);
    onLoaded?.(url);
  }

  if (dataUrl) return <img src={dataUrl} alt="صورة الدفع" className="rep-proof-photo" />;
  return (
    <button type="button" className="text-action rep-proof-button" onClick={() => void load()} disabled={state === "loading"}>
      {state === "loading" ? "⏳ جارٍ تحميل الصورة…" : state === "failed" ? "⚠️ تعذّر التحميل - أعد المحاولة" : "📸 عرض صورة الدفع"}
    </button>
  );
}

/** 🏦 A loan (سلفة) the rep asked for in the money bot: the operator sends it through the banking
 * app to the number he gave, then records it here as an advance the rep owes. */
function LoanRequestCard({ request, rep, onDone }: { request: RepRequest; rep?: Representative; onDone: (status: "approved" | "rejected") => void }) {
  const [amount, setAmount] = useState(String(request.amount ?? ""));
  const [currency, setCurrency] = useState<LedgerCurrency>(request.currency ?? "MRU");
  // 🟠 A loan sent by أورانج / نيتا leaves the app in فرانك (5 فرانك = 1 سيفا).
  const francLoanApp = /أورانج|اورانج|نيتا|orange|nita/i.test(request.loanApp ?? "");
  const [error, setError] = useState<string | null>(null);
  /** 📸 The transfer screenshot, sent to the rep with the confirmation. */
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await resizeImageToDataUrl(file, 1600, 0.85));
    } catch {
      setError("تعذرت قراءة الصورة");
    }
  }

  async function approve() {
    const value = Number(amount);
    if (!(value > 0)) return setError("المبلغ غير صحيح");
    setBusy(true);
    const result = recordRepLoan(request, value, currency, localDay(new Date()));
    if (!result.ok) {
      setBusy(false);
      return setError(result.message);
    }
    const viaFranc = francLoanApp && currency === "SIFA" ? ` (= ${formatAmount(sifaToFranc(value))} فرانك)` : "";
    const text = `✅ وافق المسؤول على سلفتك ${formatMoneyShort(value, currency)}${viaFranc} - أُرسلت عبر ${request.loanApp ?? "التطبيق"} إلى ${request.loanNumber ?? "رقمك"}.\nسُجّلت عليك في حسابك.`;
    // With the screenshot: one photo message captioned with the confirmation; else the text.
    const sentPhoto = photo ? await sendRepPhoto(request.repId, photo, `📸 صورة التحويل\n${text}`) : false;
    if (!sentPhoto) await sendRepText(request.repId, text, undefined, "money");
    if (photo && !sentPhoto) window.alert("سُجّلت السلفة وأُبلغ المندوب، لكن تعذر إرسال الصورة.");
    setBusy(false);
    onDone("approved");
  }

  async function reject() {
    if (!window.confirm("رفض طلب السلفة؟ يُبلَّغ المندوب بذلك.")) return;
    await sendRepText(request.repId, `❌ لم يوافق المسؤول على طلب السلفة: «${request.text}»`, undefined, "money");
    onDone("rejected");
  }

  return (
    <li className="rep-request">
      <div className="rep-request-head">
        <strong>🏦 {rep?.name ?? "مندوب"} - طلب سلفة</strong>
        <span>{timeLabel(request.createdAt)}</span>
      </div>
      <p className="rep-edit-values">
        <span>التطبيق: <strong>{request.loanApp ?? "—"}</strong></span>
        <span>رقم المستلم: <strong><bdi dir="ltr">{request.loanNumber ?? "—"}</bdi></strong></span>
      </p>
      <div className="rep-request-row">
        <input className="search-input" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" />
        <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <p className="settings-hint">أرسل المبلغ من التطبيق البنكي ثم اضغط «أرسلتها» - تُسجَّل سلفةً عليه في حسابه.</p>
      {francLoanApp && currency === "SIFA" && (
        <p className="settings-hint franc-hint">
          🟠 {request.loanApp} بالفرانك:{" "}
          {Number(amount) > 0 ? `أرسل ${formatAmount(sifaToFranc(Number(amount)))} فرانك (= ${formatAmount(Number(amount))} سيفا)` : "اكتب المبلغ بالسيفا، وأرسل من التطبيق 5 أضعافه فرانك"}
        </p>
      )}
      {photo ? (
        <div className="rep-proof-picked">
          <img src={photo} alt="صورة التحويل" className="rep-proof-photo" />
          <button type="button" className="text-action" onClick={() => setPhoto(null)}>
            ✕ إزالة الصورة
          </button>
        </div>
      ) : (
        <label className="text-action rep-proof-button rep-proof-pick">
          📸 إرفاق صورة التحويل (تصل للمندوب)
          <input type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={() => void approve()} disabled={busy}>
          {busy ? "⏳ جارٍ الإرسال…" : photo ? "✅ أرسلتها - سجّلها وأرسل الصورة" : "✅ أرسلتها - سجّلها عليه"}
        </button>
        <button type="button" className="text-action" onClick={() => void reject()}>
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
  const proofPhoto = request.proofFileId ? <RepProofPhoto fileId={request.proofFileId} bot={request.proofBot} /> : null;

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
      {proofPhoto}
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
  // The operator picked an existing client from the name suggestions - the device links to him
  // instead of creating a new client. Cleared the moment the name is edited by hand again.
  const [pickedClientId, setPickedClientId] = useState<string | undefined>(undefined);
  const [nameFocused, setNameFocused] = useState(false);
  const clients = useMemo(() => listClients(clientStore), [clientStore]);
  // Auto-match by phone (last 8 digits) stays as a fallback: a rep who sent a known number lands
  // the device on that client even without picking from the list.
  const phoneMatch = useMemo(
    () => (digits(phone).length >= 8 ? clients.find((c) => digits(c.phone).endsWith(digits(phone).slice(-8))) : undefined),
    [clients, phone],
  );
  // Existing clients shown in the «اسم الزبون» field itself, by name (or phone), so the device can
  // be added to one of them. Empty query lists everyone; capped so the dropdown never overflows.
  const nameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || (digits(name).length >= 3 && digits(c.phone).includes(digits(name))))
      : clients;
    return list.slice(0, 8);
  }, [clients, name]);
  const linkedClient = pickedClientId ? clientStore[pickedClientId] : phoneMatch;

  function pickClient(c: Client) {
    setPickedClientId(c.id);
    setName(c.name);
    if (c.phone) setPhone(c.phone);
    setNameFocused(false);
    setError(null);
  }

  function approve() {
    if (request.codeMismatch) return setError("الملف لا يُفتح برمز هذا المندوب - أرسل له رمزه من «إدارة» واطلب إعادة الإرسال");
    if (!name.trim() && !linkedClient) return setError("اكتب اسم الزبون");
    let clientId = linkedClient?.id;
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
          <div className="client-picker">
            <input
              className="search-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPickedClientId(undefined);
              }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => window.setTimeout(() => setNameFocused(false), 150)}
              placeholder="اسم الزبون"
            />
            {nameFocused && !pickedClientId && nameMatches.length > 0 && (
              <div className="client-picker-list">
                {nameMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="client-picker-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickClient(c)}
                  >
                    <span>{c.name}</span>
                    {c.phone && <span className="client-picker-option-phone" dir="ltr">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input className="search-input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الهاتف" />
          {linkedClient && <p className="settings-hint">👤 زبون موجود: {linkedClient.name} - سيُضاف الجهاز إليه</p>}
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
