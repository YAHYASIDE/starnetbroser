"use client";

import { useState } from "react";
import { ensureRepDeviceCode, repDeviceCode } from "@/lib/repDeviceTransfer";
import type { Representative } from "@/lib/repStore";
import { loadRepChats, sendRepText } from "@/lib/telegram";

/** 📱 The code a rep types into «وضع المندوب» on his phone - his device files open with it only. */
export function RepAppCodePanel({ rep }: { rep: Representative }) {
  const [code, setCode] = useState(() => repDeviceCode(rep.id) ?? ensureRepDeviceCode(rep.id));
  const [status, setStatus] = useState<string | null>(null);
  const linked = Boolean(loadRepChats()[rep.id]);

  async function send() {
    const sent = await sendRepText(
      rep.id,
      [
        "📱 تطبيق STAR NET للمندوب",
        "1) ثبّت التطبيق: https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Browser-debug.apk",
        "2) الإعدادات ← «📱 وضع المندوب» واكتب هذا الرمز:",
        code,
        "3) أضف جهاز الزبون وسجّل دخوله إلى Starlink، ثم «📤 إرسال للمسؤول» وأرسل الملف هنا في هذه المحادثة.",
      ].join("\n"),
    );
    setStatus(sent ? "✓ أُرسل الرمز للمندوب في البوت" : "المندوب غير مربوط ببوت المندوبين - أعطه الرمز يدوياً");
  }

  function renew() {
    if (!window.confirm("رمز جديد؟ القديم يتوقف، وعلى المندوب إدخال الجديد في تطبيقه.")) return;
    setCode(ensureRepDeviceCode(rep.id, true));
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
      <p className="settings-hint">🔒 الملف مشفّر بهذا الرمز، ولا يفتحه إلا هذا الهاتف. لا تعطِ الرمز لغير هذا المندوب.</p>
    </div>
  );
}
