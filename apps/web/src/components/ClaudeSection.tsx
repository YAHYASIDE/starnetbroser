"use client";

import { useEffect, useState } from "react";
import { hasClaudeKey, saveClaudeKey, testClaudeKey } from "@/lib/claudeClient";

/**
 * 🤖 «مساعد Claude» (his Nov 9 2026 ask): his own Anthropic API key, kept on this phone only - the assistant in the chat,
 * the support ticket writer and (next) the support page's replies use it. He pays Anthropic per use.
 */
export function ClaudeSection() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSaved(hasClaudeKey());
  }, []);

  return (
    <section className="section" id="claude" data-tour="claude">
      <h2 className="section-title">🤖 مساعد Claude</h2>
      <p className="settings-hint">
        يستعمله «🤖 المساعد» في الدردشة، وكاتب تذاكر دعم Starlink. تحتاج مفتاحًا من حسابك في Anthropic (تدفع لهم حسب الاستعمال - نحو 2 سنت للرد الواحد).
      </p>
      <ol className="settings-hint call-server-steps">
        <li>
          افتح <bdi dir="ltr">console.anthropic.com</bdi> ← أنشئ حسابًا ← <b>Billing</b>: اشحن رصيدًا صغيرًا (5 دولار مثلًا).
        </li>
        <li>
          <b>API Keys</b> ← <b>Create Key</b> ← انسخ المفتاح (يبدأ بـ <bdi dir="ltr">sk-ant-</bdi>).
        </li>
        <li>الصقه هنا ← حفظ ← 🧪 اختبار. يبقى في هذا الهاتف فقط (لا يُنسخ للفريق ولا للمندوبين ولا في النسخة الاحتياطية).</li>
      </ol>
      <input
        className="msg-input"
        type="password"
        dir="ltr"
        autoComplete="off"
        placeholder={saved ? "•••••• محفوظ - الصق مفتاحًا جديدًا لتغييره" : "sk-ant-…"}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <div className="call-server-actions">
        <button
          type="button"
          className="dialog-primary"
          disabled={!/^sk-ant-\S+$/.test(key.trim())}
          onClick={() => {
            saveClaudeKey(key);
            setKey("");
            setSaved(true);
            setNote("✓ حُفظ في هذا الهاتف");
          }}
        >
          حفظ
        </button>
        <button
          type="button"
          className="dialog-secondary"
          disabled={busy || !saved}
          onClick={async () => {
            setBusy(true);
            setNote("⏳ يسأل Claude…");
            const r = await testClaudeKey();
            setNote(r.ok ? `✓ يعمل - قال: «${r.value.slice(0, 40)}»` : `✗ ${r.message}`);
            setBusy(false);
          }}
        >
          🧪 اختبار
        </button>
        {saved && (
          <button
            type="button"
            className="text-action"
            onClick={() => {
              saveClaudeKey("");
              setSaved(false);
              setNote("أُزيل المفتاح من هذا الهاتف");
            }}
          >
            إزالة
          </button>
        )}
      </div>
      {note && <p className="settings-hint">{note}</p>}
    </section>
  );
}
