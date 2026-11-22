"use client";

import { useEffect, useState } from "react";
import { CLOUD_EVENT, cloudProblems, loadCloudConfig, loadCloudStatus, newCloudConfig, pushCloudPack, saveCloudConfig, testCloud, type CloudConfig, type CloudStatus } from "@/lib/waCloud";

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-action"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {done ? "✓ نُسخ" : `📋 ${label}`}
    </button>
  );
}

/**
 * ☁️ «واتساب الرسمي (Cloud API)» (his Nov 22 2026 choice): the agent on a NEW number on WhatsApp's official platform,
 * answered by STAR NET's Cloudflare Worker - lists, buttons, product cards, and answers with every phone off. Here:
 * the Worker's address, the shared key (to paste in GitHub as WA_PACK_KEY), Meta's token and ids (phone-only).
 */
export function WaCloudSection() {
  const [c, setC] = useState<CloudConfig | null>(null);
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => {
      setC(loadCloudConfig() ?? newCloudConfig());
      setStatus(loadCloudStatus());
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  if (!c) return null;
  const set = (patch: Partial<CloudConfig>) => setC({ ...c, ...patch });
  const problems = cloudProblems(c);
  const save = async (on: boolean) => {
    setBusy(true);
    saveCloudConfig({ ...c, on });
    if (on) {
      await pushCloudPack(true);
      setStatus(await testCloud({ ...c, on }));
    }
    setBusy(false);
  };
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, secret = false, placeholder = "") => (
    <>
      <label className="add-field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="search-input" dir="ltr" type={secret ? "password" : "text"} autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  );
  return (
    <div className="wa-agent menus-card" data-tour="wa-cloud">
      <h3 className="section-title">☁️ واتساب الرسمي (Cloud API)</h3>
      <p className="settings-hint">
        الوكيل الاحترافي على رقم جديد: قوائم وأزرار وبطاقات منتجات بالصور، ويرد حتى والهواتف كلها مطفأة. رقمك 22227268 يبقى كما هو في تطبيقك. المفاتيح تبقى
        على هذا الهاتف فقط.
      </p>
      {field("wac-number", "الرقم الجديد للوكيل", c.number, (v) => set({ number: v }), false, "+222 …")}
      {field("wac-url", "رابط الخادم (Cloudflare)", c.url, (v) => set({ url: v.trim() }), false, "https://starnet-wa.….workers.dev")}
      <div className="menus-card">
        <strong>🔑 مفتاح الربط</strong>
        <small className="msg-item-hint">انسخه وضعه في GitHub ← Settings ← Secrets ← باسم WA_PACK_KEY (مرة واحدة). لا ترسله في محادثة.</small>
        <div className="agent-actions">
          <Copy text={c.packKey} label="انسخ مفتاح الربط" />
        </div>
      </div>
      {field("wac-pnid", "Phone number ID (من Meta)", c.phoneNumberId, (v) => set({ phoneNumberId: v.trim() }), false, "1234567890…")}
      {field("wac-token", "Access token الدائم (من Meta)", c.token, (v) => set({ token: v.trim() }), true, "EAA…")}
      {field("wac-secret", "App secret (من Meta)", c.appSecret, (v) => set({ appSecret: v.trim() }), true)}
      <div className="menus-card">
        <strong>✅ Verify token</strong>
        <small className="msg-item-hint">
          ضعه في Meta ← WhatsApp ← Configuration ← Webhook مع رابط الاستقبال: <bdi dir="ltr">{c.url ? `${c.url.replace(/\/+$/, "")}/webhook` : "…/webhook"}</bdi>
        </small>
        <div className="agent-actions">
          <bdi dir="ltr" className="menus-mono">
            {c.verifyToken}
          </bdi>
          <Copy text={c.verifyToken} label="انسخ" />
          {c.url && <Copy text={`${c.url.replace(/\/+$/, "")}/webhook`} label="انسخ رابط الاستقبال" />}
        </div>
      </div>
      {problems.length > 0 && <p className="settings-hint">ينقص: {problems.join("، ")}</p>}
      <div className="agent-actions">
        <button type="button" className="dialog-primary" disabled={busy || problems.length > 0} onClick={() => void save(true)}>
          {c.on ? "📤 أرسل للخادم واختبر" : "☁️ شغّل واتساب الرسمي"}
        </button>
        {c.on && (
          <button type="button" className="dialog-secondary" disabled={busy} onClick={() => void save(false)}>
            ⏸️ أوقف
          </button>
        )}
      </div>
      {status && <p className={`settings-hint${status.ok ? "" : " agent-pending"}`}>{status.text}</p>}
    </div>
  );
}
