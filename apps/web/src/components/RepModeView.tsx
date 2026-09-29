"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionStatus } from "@starnet/local-browser-plugin";
import { checkAccountSession, deleteIsolatedAccountSession, openIsolatedAccountBrowser, openIsolatedMailbox } from "@/lib/localBrowser";
import { isGmail } from "@/lib/mailboxes";
import { forgetRepDeviceFile, shareRepDevice } from "@/lib/repDeviceShare";
import {
  addRepModeDevice,
  cleanRepDeviceDetails,
  deviceDisplayName,
  loadRepModeDevices,
  type RepModeDevice,
  type RepModeSettings,
  saveRepModeDevices,
} from "@/lib/repDeviceTransfer";

const EMPTY_FORM = { clientName: "", phone: "", email: "", emailPassword: "", wifiPassword: "", kit: "", deviceName: "" };

/**
 * 📱 وضع المندوب - the whole app on a rep's phone: add a customer's device, sign in to Starlink
 * in its own isolated browser, send it to the operator (encrypted, through the reps bot), then
 * delete it here once it arrived. No operator data ever lives on this phone.
 */
export function RepModeView({ settings, onExit }: { settings: RepModeSettings; onExit: () => void }) {
  const [devices, setDevices] = useState<RepModeDevice[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionStatus>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshSessions = useCallback(async (list: RepModeDevice[]) => {
    const entries = await Promise.all(list.map(async (d) => [d.id, await checkAccountSession(d.id)] as const));
    setSessions(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    const list = loadRepModeDevices();
    setDevices(list);
    void refreshSessions(list);
    // Back from the Starlink browser: show whether the sign-in worked.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSessions(loadRepModeDevices());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshSessions]);

  function update(next: RepModeDevice[]) {
    saveRepModeDevices(next);
    setDevices(next);
  }

  function add() {
    const details = cleanRepDeviceDetails(form);
    if (!details) return setMessage("اكتب اسم الزبون");
    const next = addRepModeDevice(devices, details);
    update(next);
    setForm(EMPTY_FORM);
    setAdding(false);
    setMessage("✓ أُضيف - الآن «🔐 تسجيل الدخول إلى Starlink»");
  }

  async function login(device: RepModeDevice) {
    // Same as the operator's app: the Starlink form is filled with the email and the Wi-Fi code
    // (else the email's code), and «📧 البريد» inside it opens the device's own mailbox.
    const loginPassword = device.wifiPassword || device.emailPassword;
    const result = await openIsolatedAccountBrowser(device.id, deviceDisplayName(device), {
      ...(device.email ? { loginEmail: device.email } : {}),
      ...(loginPassword ? { loginPassword } : {}),
      ...(device.emailPassword ? { mailPassword: device.emailPassword } : {}),
    });
    if (!result.ok) setMessage(result.message);
  }

  async function openMail(device: RepModeDevice) {
    const result = await openIsolatedMailbox(device.id, deviceDisplayName(device), {
      ...(device.email ? { email: device.email } : {}),
      ...(device.emailPassword ? { password: device.emailPassword } : {}),
    });
    if (!result.ok) setMessage(result.message);
  }

  async function send(device: RepModeDevice) {
    setBusy(device.id);
    setMessage(null);
    const result = await shareRepDevice(device, settings.code);
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    update(loadRepModeDevices().map((d) => (d.id === device.id ? { ...d, sentAt: new Date().toISOString() } : d)));
    setMessage("📤 بعد أن يرد البوت «📥 وصل ملف الجهاز» اضغط «✅ وصل» لحذف الجلسة من هاتفك.");
  }

  async function remove(device: RepModeDevice, arrived: boolean) {
    const question = arrived
      ? `وصل ${deviceDisplayName(device)} للمسؤول؟ سيُحذف من هاتفك مع دخوله إلى Starlink.`
      : `حذف ${deviceDisplayName(device)} من هاتفك مع دخوله إلى Starlink؟`;
    if (!window.confirm(question)) return;
    await deleteIsolatedAccountSession(device.id);
    await forgetRepDeviceFile(device);
    update(loadRepModeDevices().filter((d) => d.id !== device.id));
    setMessage(arrived ? "✓ حُذفت الجلسة من هاتفك" : null);
  }

  function exit() {
    if (!window.confirm("الخروج من وضع المندوب؟ تبقى أجهزتك غير المرسلة محفوظة.")) return;
    onExit();
  }

  return (
    <main className="rep-mode">
      <header className="rep-mode-head">
        <h1>📱 وضع المندوب</h1>
        {settings.name && <p>أهلاً {settings.name}</p>}
      </header>

      <ol className="rep-mode-steps">
        <li>➕ أضف جهاز الزبون</li>
        <li>🔐 سجّل دخوله إلى Starlink</li>
        <li>📤 أرسله للمسؤول ← تيليغرام ← محادثة البوت</li>
      </ol>

      {message && <p className="settings-hint rep-mode-message">{message}</p>}

      {adding ? (
        <form
          className="account-form add-device-form rep-mode-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="form-field add-field add-field-email">
            <span className="add-field-label"><b aria-hidden="true">📧</b> البريد الإلكتروني الرئيسي للجهاز</span>
            <input dir="ltr" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </label>

          <label className="form-field add-field add-field-code">
            <span className="add-field-label"><b aria-hidden="true">🔑</b> كود البريد</span>
            <input dir="ltr" value={form.emailPassword} onChange={(e) => setForm({ ...form, emailPassword: e.target.value })} placeholder="اختياري" />
          </label>

          <label className="form-field add-field add-field-wifi">
            <span className="add-field-label"><b aria-hidden="true">📶</b> كود الواي فاي</span>
            <input dir="ltr" value={form.wifiPassword} onChange={(e) => setForm({ ...form, wifiPassword: e.target.value })} placeholder="اختياري" />
          </label>

          <div className="form-field add-field add-field-client">
            <span className="add-field-label"><b aria-hidden="true">👤</b> الزبون</span>
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="اسم الزبون *" />
            <input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="هاتف الزبون (اختياري)" />
          </div>

          <label className="form-field add-field add-field-plan">
            <span className="add-field-label"><b aria-hidden="true">🛰️</b> رقم KIT</span>
            <input dir="ltr" value={form.kit} onChange={(e) => setForm({ ...form, kit: e.target.value })} placeholder="اختياري" />
          </label>

          <label className="form-field add-field add-field-name">
            <span className="add-field-label"><b aria-hidden="true">🏷️</b> اسم الجهاز</span>
            <input value={form.deviceName} onChange={(e) => setForm({ ...form, deviceName: e.target.value })} placeholder="اختياري - يظهر الإيميل إن تركته" />
          </label>

          <div className="settings-actions">
            <button type="submit" className="dialog-primary">
              حفظ الجهاز
            </button>
            <button type="button" className="text-action" onClick={() => setAdding(false)}>
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="dialog-primary rep-mode-add" onClick={() => setAdding(true)}>
          ➕ جهاز جديد
        </button>
      )}

      {devices.length === 0 && !adding && <p className="settings-hint">لا توجد أجهزة بعد.</p>}
      <ul className="rep-mode-list">
        {devices.map((device) => {
          const status = sessions[device.id];
          const signedIn = status === "loggedIn";
          return (
            <li key={device.id} className="rep-request">
              <div className="rep-request-head">
                <strong>📡 {deviceDisplayName(device)}</strong>
                <span className={signedIn ? "telegram-running" : "telegram-stopped"}>
                  {device.sentAt ? "📤 أُرسل" : signedIn ? "✓ مسجَّل الدخول" : status === "loginRequired" || status === "none" ? "لم يسجَّل الدخول" : ""}
                </span>
              </div>
              <p className="rep-request-text">
                👤 {device.clientName}
                {device.phone ? (
                  <>
                    {" "}
                    · <bdi dir="ltr">{device.phone}</bdi>
                  </>
                ) : null}
              </p>
              <div className="rep-mode-actions">
                <button type="button" className="text-action" onClick={() => void login(device)}>
                  🔐 {signedIn ? "فتح Starlink" : "تسجيل الدخول إلى Starlink"}
                </button>
                {device.email && !isGmail(device.email) && (
                  <button type="button" className="text-action" onClick={() => void openMail(device)}>
                    📧 البريد
                  </button>
                )}
                <button type="button" className="dialog-primary" disabled={busy === device.id} onClick={() => void send(device)}>
                  {busy === device.id ? "…" : device.sentAt ? "📤 إعادة الإرسال" : "📤 إرسال للمسؤول"}
                </button>
                {device.sentAt ? (
                  <button type="button" className="text-action" onClick={() => void remove(device, true)}>
                    ✅ وصل
                  </button>
                ) : (
                  <button type="button" className="text-action" onClick={() => void remove(device, false)}>
                    🗑 حذف
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className="text-action rep-mode-exit" onClick={exit}>
        الخروج من وضع المندوب
      </button>
    </main>
  );
}
