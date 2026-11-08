"use client";

import { useEffect, useState } from "react";
import { parseTurnSetting } from "@/lib/callIce";
import { loadCallTurnText, saveCallTurnText, testRelay } from "@/lib/callIceLoad";

/**
 * 📞 «خادم المكالمات» (his Nov 8 2026 report «الاتصال غير مستقر أبدًا» → his choice: a free private relay): the link of a
 * free metered.ca relay, pasted once - it reaches the team (the link) and each rep (his next copy) by itself.
 */
export function CallServerSection() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = loadCallTurnText();
    setText(t);
    setSaved(t);
  }, []);

  const valid = !text.trim() || Boolean(parseTurnSetting(text));

  return (
    <section className="section" id="call-server" data-tour="call-server">
      <h2 className="section-title">📞 خادم المكالمات</h2>
      <p className="settings-hint">
        حين لا يصل الهاتفان لبعضهما مباشرة (بيانات الهاتف غالبًا) يمر الصوت عبر خادم وصل. المجاني العام ضعيف، فضع خادمك الخاص المجاني:
      </p>
      <ol className="settings-hint call-server-steps">
        <li>
          افتح <bdi dir="ltr">metered.ca/stun-turn</bdi> ← <b>Sign Up</b> ← اختر الخطة المجانية «Free Trial» (500 ميجا في الشهر بلا بطاقة: نحو 10 ساعات من المكالمات التي تمر عبر الخادم - المكالمات المباشرة لا تُحسب).
        </li>
        <li>
          في لوحة الحساب: <b>TURN Server</b> ← <b>Add Credential</b>، ثم انسخ رابط <b>API</b> (ينتهي بـ <bdi dir="ltr">apiKey=…</bdi>).
        </li>
        <li>الصقه هنا واضغط «حفظ» ثم «🧪 اختبار». يصل لكل الفريق وحده، وللمندوب مع نسخته القادمة.</li>
      </ol>
      <textarea
        className="msg-input call-server-input"
        dir="ltr"
        rows={3}
        placeholder="https://yourapp.metered.live/api/v1/turn/credentials?apiKey=…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {!valid && <p className="settings-hint call-server-bad">هذا ليس رابط metered ولا قائمة خوادم - انسخه كاملًا.</p>}
      <div className="call-server-actions">
        <button
          type="button"
          className="dialog-primary"
          disabled={!valid || text.trim() === saved.trim()}
          onClick={() => {
            saveCallTurnText(text);
            setSaved(text.trim());
            setNote(text.trim() ? "✓ حُفظ - المكالمات القادمة تمر عبره" : "✓ أُزيل - يعود الخادم المجاني العام");
          }}
        >
          حفظ
        </button>
        <button
          type="button"
          className="dialog-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote("⏳ يختبر…");
            const r = await testRelay();
            setNote(r.text);
            setBusy(false);
          }}
        >
          🧪 اختبار
        </button>
      </div>
      {note && <p className="settings-hint">{note}</p>}
      <p className="settings-hint">الصوت مشفّر من هاتف لهاتف - خادم الوصل يمرّره ولا يستطيع سماعه.</p>
    </section>
  );
}
