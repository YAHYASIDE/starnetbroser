"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { isRepWorkspace } from "@/lib/repMode";
import { lowNetOn } from "@/lib/lowNet";
import { shareText } from "@/lib/shareText";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { Client } from "@/lib/clientStore";
import {
  clientLinkMessage,
  joinLinkMessage,
  portalRules,
  PORTAL_EVENT,
  requestLines,
  rulesNeedPublishing,
  type PortalStore,
  type PortalWaiting,
} from "@/lib/customerPortal";
import {
  acceptPortalRequest,
  clientPortalLink,
  dismissPortalRequest,
  drainPortalRequests,
  loadPortalStore,
  loadPortalWaiting,
  markRulesPublished,
  portalBusinessName,
  portalJoinLink,
  refreshPortalViews,
  removePortalSetup,
  savePortalSetup,
  stopClientPortalLink,
  testPortal,
} from "@/lib/portalLink";

function usePortal(): { store: PortalStore; waiting: PortalWaiting[] } {
  const [state, setState] = useState<{ store: PortalStore; waiting: PortalWaiting[] }>({ store: { links: {} }, waiting: [] });
  useEffect(() => {
    const reload = () => setState({ store: loadPortalStore(), waiting: loadPortalWaiting() });
    reload();
    window.addEventListener(PORTAL_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(PORTAL_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  return state;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const FIRST_MS = 90_000;
const DRAIN_MS = 2 * 60_000;
const DRAIN_LOW_NET_MS = 10 * 60_000;
const VIEWS_MS = 30 * 60_000;

/** 🌐 In the background while the app is open: the customers' requests every 2 min (10 with «إنترنت ضعيف»), their
 * pages every 30 min when something changed (not with «إنترنت ضعيف»). Starts 90 s after opening (the freeze lesson). */
export function PortalRunner() {
  useEffect(() => {
    if (isRepWorkspace()) return;
    let stopped = false;
    let lastDrain = 0;
    let lastViews = Date.now() - VIEWS_MS + FIRST_MS;
    let busy = false;
    const tick = async () => {
      if (stopped || busy || document.visibilityState !== "visible" || !loadPortalStore().setup) return;
      busy = true;
      try {
        const now = Date.now();
        if (now - lastDrain >= (lowNetOn() ? DRAIN_LOW_NET_MS : DRAIN_MS)) {
          lastDrain = now;
          await drainPortalRequests();
        }
        if (!lowNetOn() && now - lastViews >= VIEWS_MS) {
          lastViews = now;
          await refreshPortalViews();
        }
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => void tick(), FIRST_MS);
    const every = window.setInterval(() => void tick(), 30_000);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
  return null;
}

function when(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 🌐 The customers' requests waiting for him - a badge on every page, each «➕ أضف» or «✕ لا». */
export function PortalRequestsBadge() {
  const { waiting } = usePortal();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [rep, setRep] = useState(true);
  useEffect(() => setRep(isRepWorkspace()), []);
  if (rep || (!waiting.length && !open)) return null;
  return (
    <>
      {waiting.length > 0 && (
        <button type="button" className="wa-suggest-badge portal-badge" data-tour="portal-requests" onClick={() => setOpen(true)}>
          🌐 {waiting.length} طلب من رابط الزبائن - أضيفه؟
        </button>
      )}
      {open && (
        <PartySheet title="🌐 طلبات رابط الزبائن" onClose={() => { setOpen(false); setDone(null); }}>
          <p className="settings-hint">لا يُضاف شيء وحده: «➕ أضف» ينشئ الجهاز على الزبون صاحب الرقم (أو زبونًا جديدًا باسمه). جهاز جديد بـ KIT / SN يُضاف «غير مفعّل».</p>
          {done && <p className="account-card-alert backup-restored">{done}</p>}
          {waiting.length === 0 ? (
            <p className="settings-hint">✓ لا شيء ينتظر.</p>
          ) : (
            <ul className="wa-suggest-list">
              {waiting.map((w) => (
                <li key={w.id} className="wa-suggest">
                  <p className="wa-suggest-who">
                    {w.request.kind === "new" ? "🆕 جهاز جديد" : "📡 حساب موجود"} · <bdi dir="ltr">{when(w.at)}</bdi>
                  </p>
                  {requestLines(w.request).map((line) => (
                    <p key={line} className="portal-line">
                      {line}
                    </p>
                  ))}
                  <div className="wa-suggest-actions">
                    <button
                      type="button"
                      className="dialog-primary"
                      onClick={() => {
                        const r = acceptPortalRequest(w.id);
                        setDone(r.made ? `✓ أُضيف جهاز ${r.name} - تجده في الأجهزة` : r.existing ? `موجود من قبل (${r.existing}) - لم يُضف شيء` : "لم يُضف شيء");
                      }}
                    >
                      ➕ أضف
                    </button>
                    {buildWhatsAppLink(w.request.phone) && (
                      <a className="text-action" href={buildWhatsAppLink(w.request.phone)!} target="_blank" rel="noreferrer">
                        💬 راسله
                      </a>
                    )}
                    <button type="button" className="text-action" onClick={() => dismissPortalRequest(w.id)}>
                      ✕ لا
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PartySheet>
      )}
    </>
  );
}

/** ⚙️ «🌐 رابط الزبائن» in settings: the steps, his project, the rules, a test, and the link to share. */
export function PortalSection() {
  const { store } = usePortal();
  const [config, setConfig] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const setup = store.setup;
  const link = setup ? portalJoinLink() : null;
  const linked = Object.keys(store.links).length;

  const run = async (job: () => Promise<{ ok: true; value: unknown } | { ok: false; message: string }>, okText: (v: unknown) => string) => {
    setBusy(true);
    setNote(null);
    const r = await job();
    setBusy(false);
    setNote(r.ok ? { ok: true, text: okText(r.value) } : { ok: false, text: r.message });
  };

  return (
    <section className="section" id="customer-link" data-tour="customer-link">
      <h2 className="section-title">🌐 رابط الزبائن</h2>
      <p className="settings-hint">صفحة خفيفة تفتح من المتصفح برابط، بلا تثبيت:</p>
      <ul className="settings-hint call-server-steps">
        <li>📡 زبون عنده حساب: يكتب اسمه ورقمه (اختياري) وإيميله وكود البريد وكود الواي فاي.</li>
        <li>🆕 جهاز جديد: اسمه ورقمه (اختياري) و KIT أو SN.</li>
        <li>✋ كل طلب ينتظرك: «➕ أضف» أو «✕ لا» - لا يُضاف شيء وحده.</li>
        <li>👤 «حسابي»: لكل زبون رابط خاص يرى فيه أجهزته وموعد تجديدها وما عليه (من كشفه ← «تصدير» ← «🔗 رابط حسابه»).</li>
        <li>🔒 الطلب يُقفَل على هاتف الزبون بمفتاحك ولا يفتحه إلا تطبيقك، وصفحة الزبون لا يفتحها إلا رابطه.</li>
      </ul>

      {!setup ? (
        <>
          <p className="settings-hint">الإعداد مرة واحدة - مشروع Firebase جديد خاص بالزبائن (لا تستعمل مشروع الفريق):</p>
          <ol className="settings-hint call-server-steps">
            <li>console.firebase.google.com ← «Add project» ← اسم مثل starnet-zabayen (بلا Analytics).</li>
            <li>Build ← Firestore Database ← Create database ← Production mode.</li>
            <li>Build ← Authentication ← Get started ← Anonymous ← Enable.</li>
            <li>⚙️ Project settings ← Your apps ← أيقونة الويب {"</>"} ← سجّل التطبيق ← انسخ firebaseConfig كله والصقه هنا.</li>
          </ol>
          <textarea className="settings-input portal-config" dir="ltr" rows={5} placeholder={'const firebaseConfig = { apiKey: "…", projectId: "…" }'} value={config} onChange={(e) => setConfig(e.target.value)} />
          <button type="button" className="dialog-primary" disabled={busy || !config.trim()} onClick={() => void run(() => savePortalSetup(config), () => "✓ حُفظ - الآن انسخ القواعد وانشرها")}>
            {busy ? "⏳ جارِ الحفظ…" : "💾 احفظ"}
          </button>
        </>
      ) : (
        <>
          <p className="settings-hint">
            ✓ المشروع: <bdi dir="ltr">{setup.projectId}</bdi> · زبائن لهم رابط: {linked}
          </p>
          <details className="portal-rules" open={rulesNeedPublishing(setup)}>
            <summary>{rulesNeedPublishing(setup) ? "⚠️ انسخ القواعد وانشرها (مطلوب)" : "📜 قواعد Firestore"}</summary>
            <p className="settings-hint">Firestore Database ← Rules ← امسح ما فيها والصق هذه ← Publish. {rulesNeedPublishing(setup) ? "فيها هواتفك المسموح لها فقط." : ""}</p>
            <pre className="portal-rules-text" dir="ltr">{portalRules(setup.owners)}</pre>
            <div className="wa-suggest-actions">
              <button type="button" className="dialog-secondary" onClick={() => void copy(portalRules(setup.owners)).then((ok) => setNote({ ok, text: ok ? "✓ نُسخت القواعد" : "لم يُنسخ - انسخها باليد" }))}>
                📋 انسخ القواعد
              </button>
              {rulesNeedPublishing(setup) && (
                <button type="button" className="dialog-primary" onClick={markRulesPublished}>
                  ✓ نشرتها
                </button>
              )}
            </div>
          </details>
          <div className="wa-suggest-actions">
            <button type="button" className="dialog-secondary" disabled={busy} onClick={() => void run(() => testPortal(), (v) => String(v))}>
              {busy ? "⏳ …" : "✅ جرّب"}
            </button>
            <button type="button" className="dialog-secondary" disabled={busy} onClick={() => void run(() => drainPortalRequests(), (v) => (Number(v) ? `✓ وصل ${v} طلب` : "✓ لا طلبات جديدة"))}>
              📥 الطلبات الآن
            </button>
          </div>
          {link && (
            <>
              <p className="settings-hint">🔗 رابط الطلبات - انشره في الحالة والمجموعات والإعلانات:</p>
              <p className="portal-link-text" dir="ltr">{link}</p>
              <div className="wa-suggest-actions">
                <button type="button" className="dialog-primary" onClick={() => void shareText(joinLinkMessage(link, portalBusinessName()), "رابط الزبائن")}>
                  📤 شارك
                </button>
                <button type="button" className="dialog-secondary" onClick={() => void copy(link).then((ok) => setNote({ ok, text: ok ? "✓ نُسخ الرابط" : "لم يُنسخ" }))}>
                  📋 انسخ
                </button>
                <a className="text-action" href={link} target="_blank" rel="noreferrer">
                  👁️ افتحه
                </a>
              </div>
            </>
          )}
          <button
            type="button"
            className="text-action portal-remove"
            onClick={() => {
              if (window.confirm("إزالة إعداد رابط الزبائن من هذا الهاتف؟ الروابط التي أرسلتها تتوقف عن العمل.")) removePortalSetup();
            }}
          >
            🗑️ إزالة الإعداد
          </button>
        </>
      )}
      {note && <p className={note.ok ? "account-card-alert backup-restored" : "currency-rate-wrong"}>{note.text}</p>}
    </section>
  );
}

/** 🔗 «رابط حسابه» in a customer's export sheet: his «حسابي» page sent now, the link to him on WhatsApp. */
export function PortalClientButton({ client }: { client: Client }) {
  const { store } = usePortal();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [rep, setRep] = useState(true);
  useEffect(() => setRep(isRepWorkspace()), []);
  if (rep) return null;
  const has = Boolean(store.links[client.id]);

  const make = async () => {
    setBusy(true);
    setNote(null);
    const r = await clientPortalLink(client.id);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: r.message });
    setLink(r.value);
    const text = clientLinkMessage(client.name, r.value, portalBusinessName());
    const wa = buildWhatsAppLink(client.phone, text);
    if (wa) window.open(wa, "_blank", "noopener,noreferrer");
    else void shareText(text, "رابط حسابه");
    setNote({ ok: true, text: "✓ صفحته محدَّثة الآن - وتتحدّث وحدها كل نصف ساعة" });
  };

  return (
    <div className="portal-client">
      <button type="button" className="party-action" disabled={busy} onClick={() => void make()}>
        {busy ? "⏳ جارِ التجهيز…" : has ? "🔗 أرسل رابط حسابه" : "🔗 رابط حسابه («حسابي»)"}
      </button>
      {has && (
        <button
          type="button"
          className="text-action"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`إيقاف رابط ${client.name}؟ الرابط القديم لا يفتح شيئًا بعدها.`)) return;
            setBusy(true);
            void stopClientPortalLink(client.id).then((r) => {
              setBusy(false);
              setLink(null);
              setNote(r.ok ? { ok: true, text: "✓ أُوقف رابطه" } : { ok: false, text: r.message });
            });
          }}
        >
          🚫 أوقف رابطه
        </button>
      )}
      {link && (
        <p className="portal-link-text" dir="ltr">
          {link}
        </p>
      )}
      {note && <p className={note.ok ? "settings-hint" : "currency-rate-wrong"}>{note.text}</p>}
    </div>
  );
}
