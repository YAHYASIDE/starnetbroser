"use client";

import { useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { copyGaps, copyGapsText, loadRepCopySentAt, loadRepCopySentDevices, repCopyAccounts } from "@/lib/repCopy";
import { sendRepCopy } from "@/lib/repCopySend";
import { ensureRepDeviceCode, repDeviceCode, repPhoneKey } from "@/lib/repDeviceTransfer";
import type { Representative } from "@/lib/repStore";
import { loadRepChats, sendRepText } from "@/lib/telegram";

/** 📱 The code a rep types into «وضع المندوب» on his phone - his device files open with it only. */
export function RepAppCodePanel({ rep, accounts }: { rep: Representative; accounts: StarlinkAccountSummary[] }) {
  const [code, setCode] = useState(() => repDeviceCode(rep.id) ?? ensureRepDeviceCode(rep.id));
  const [status, setStatus] = useState<string | null>(null);
  const linked = Boolean(loadRepChats()[rep.id]);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(() => loadRepCopySentAt()[rep.id]);
  const deviceCount = repCopyAccounts(accounts, rep.id).length;
  const gaps = sentAt ? copyGaps(loadRepCopySentDevices()[rep.id], accounts, rep.id) : null;
  // 🔗 His copies open on his own phone only, once it's linked (repDeviceTransfer.ts).
  const [phoneBound, setPhoneBound] = useState(() => Boolean(repPhoneKey(rep.id)));

  async function sendCopy() {
    const question =
      `إرسال نسخة أجهزة ${rep.name} (${deviceCount} جهاز) إلى تطبيقه؟\n\n` +
      "• يرى كل أجهزته وأرقامها (البيع، التكلفة، الربح) وزبائنها.\n" +
      "• يستطيع فتح حساب Starlink لكل جهاز منها (إلغاء، تغيير البطاقة…).\n" +
      "• أي جهاز ليس له في النسخة يُحذف من هاتفه.";
    if (!window.confirm(question)) return;
    setCopyBusy(true);
    setCopyStatus(null);
    const result = await sendRepCopy(rep, accounts);
    setCopyBusy(false);
    if (!result.ok) return setCopyStatus(result.message);
    setSentAt(new Date().toISOString());
    setCopyStatus(result.via === "bot" ? `✓ أُرسلت النسخة (${result.devices} جهاز) في البوت - يفتحها بـ STAR NET` : `✓ جاهزة (${result.devices} جهاز) - أرسلها له`);
  }

  async function send() {
    const sent = await sendRepText(
      rep.id,
      [
        "📱 تطبيق STAR NET للمندوب",
        "1) ثبّت التطبيق: https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Browser-debug.apk",
        "2) الإعدادات ← «📱 وضع المندوب» واكتب هذا الرمز:",
        code,
        "3) اضغط «🔗 ربط هاتفي» وأرسل الملف هنا في هذه المحادثة - تصلك بعدها نسخة أجهزتك، ولا تُفتح إلا على هاتفك.",
      ].join("\n"),
    );
    setStatus(sent ? "✓ أُرسل الرمز للمندوب في البوت" : "المندوب غير مربوط ببوت المندوبين - أعطه الرمز يدوياً");
  }

  function renew() {
    if (!window.confirm("رمز جديد؟ القديم يتوقف، ويُفك ربط هاتفه: يدخل الرمز الجديد في تطبيقه ثم «🔗 ربط هاتفي» من جديد.")) return;
    setCode(ensureRepDeviceCode(rep.id, true));
    setPhoneBound(false);
    setStatus(null);
  }

  return (
    <div className="rep-app-code">
      <p className="settings-hint">
        يثبّت المندوب تطبيق STAR NET على هاتفه، ويفتح الإعدادات ← «📱 وضع المندوب» ويكتب هذا الرمز. بعدها يضيف جهاز الزبون ويسجّل دخوله إلى
        Starlink، ويرسل الملف إلى بوت المندوبين - فيظهر لك هنا في «طلبات المندوبين» وتفتحه مباشرة بدون كلمة سر.
      </p>
      <p className="rep-app-code-value">
        <bdi dir="ltr">{code}</bdi>
      </p>
      <div className="settings-actions">
        {linked && (
          <button type="button" className="dialog-primary" onClick={() => void send()}>
            ✈️ إرسال الرمز له في البوت
          </button>
        )}
        <button type="button" className="text-action" onClick={renew}>
          🔄 رمز جديد
        </button>
      </div>
      {status && <p className="settings-hint">{status}</p>}

      <div className="rep-copy-send">
        <strong>📋 نسخة أجهزته على هاتفه</strong>
        <p className="settings-hint">
          كل أجهزته ({deviceCount}) بحالاتها وأرقامها ودخول Starlink، مشفّرة برمزه. أرسلها كلما تغيّر شيء - كل نسخة تحلّ محل التي قبلها، وما ليس له يُحذف من هاتفه.
        </p>
        <p className={`settings-hint rep-phone-bound${phoneBound ? " is-bound" : ""}`}>
          {phoneBound
            ? "🔗 مربوط بهاتفه ✓ - نسخه لا تُفتح على أي هاتف آخر، حتى مع الملف والرمز."
            : "⚠️ هاتفه غير مربوط بعد: يضغط في تطبيقه «🔗 ربط هاتفي» ويرسل الملف إلى بوت المندوبين - بعدها تُرسل نسخته تلقائياً."}
        </p>
        <button type="button" className="dialog-primary" disabled={copyBusy || !phoneBound} onClick={() => void sendCopy()}>
          {copyBusy ? "⏳ جارِ التجهيز…" : `📤 إرسال نسخته (${deviceCount} جهاز)`}
        </button>
        {sentAt && (
          <small className="settings-hint">
            آخر نسخة: <bdi dir="ltr">{sentAt.slice(0, 16).replace("T", " ")}</bdi>
          </small>
        )}
        {gaps && !copyStatus && <p className="rep-copy-stale">{copyGapsText(gaps)}</p>}
        {copyStatus && <p className="settings-hint">{copyStatus}</p>}
      </div>
      <p className="settings-hint">🔒 الملف مشفّر برمزه وبمفتاح هاتفه معاً: لا يفتحه إلا هاتف هذا المندوب. لا تعطِ الرمز لغيره.</p>
    </div>
  );
}
