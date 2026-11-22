"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { setWhatsappAnswerOn, whatsappAnswerOn } from "@/lib/whatsappLink";
import { hasClaudeKey } from "@/lib/claudeClient";
import { WaCloudSection } from "@/components/WaCloudSection";
import { requestBatteryUnrestricted } from "@/lib/telegram";
import { agentNumberKeys, agentSeenLines, type AgentSeen, type AgentSettings } from "@/lib/whatsappAgent";
import { AGENT_EVENT, loadAgentLog, loadAgentSettings, loadAgentSpend, loadPackStatus, saveAgentSettings, type AgentLogLine } from "@/lib/whatsappAgentLink";
import { NO_SPEND, spendLine, type AgentSpend } from "@/lib/agentRefresh";

type Status = { access: boolean; enabled: boolean; log: { name: string; question: string; at: number }[] };

/**
 * 💬 «واتساب بزنس» (his Nov 12 2026 ask): the app reads his WhatsApp Business messages from their notifications - an
 * email becomes a new «غير مفعّل» device, a registered customer asking about his device is answered by itself.
 */
export function WhatsAppSection() {
  const [android, setAndroid] = useState(false);
  const [on, setOn] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = () => {
    void LocalBrowser.whatsappStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    const a = isRunningInAndroidApp();
    setAndroid(a);
    setOn(whatsappAnswerOn());
    if (a) refresh();
  }, []);

  return (
    <section className="section" id="whatsapp" data-tour="whatsapp">
      <h2 className="section-title">💬 واتساب بزنس</h2>
      <p className="settings-hint">يقرأ التطبيق رسائل زبائنك في واتساب بزنس من إشعاراتها على هذا الهاتف:</p>
      <ul className="settings-hint call-server-steps">
        <li>📧 رسالة فيها إيميل ← إشعار «📧 إيميل من واتساب»: إن ضغطت «➕ أضف» يصير جهازًا «غير مفعّل» على الزبون صاحب الرقم (وزبونًا جديدًا باسمه إن لم يكن مسجّلًا)، وإن لم تضفه لا يُضاف شيء.</li>
        <li>🛰️ زبون رقمه مسجّل يسأل عن جهازه أو اشتراكه أو ما عليه ← يرد التطبيق وحده: حالة كل جهاز، موعد انتهاء اشتراكه، وما عليه.</li>
        <li>🛡️ لا يرد في المجموعات، ولا على رقم غير مسجّل، ومرة واحدة كل 30 دقيقة لكل زبون.</li>
      </ul>
      {!android ? (
        <p className="settings-hint">يعمل في تطبيق الهاتف فقط.</p>
      ) : (
        <>
          <p className={status?.access ? "settings-hint" : "currency-rate-wrong"}>
            {status?.access ? "✓ قراءة الإشعارات مفعّلة" : "⚠️ قراءة الإشعارات غير مفعّلة - فعّلها لـ STAR NET، ولا تكتم إشعارات واتساب بزنس."}
          </p>
          {!status?.access && (
            <button type="button" className="dialog-secondary" onClick={() => void LocalBrowser.openKastNotificationAccess().catch(() => undefined)}>
              🔔 فتح إذن قراءة الإشعارات
            </button>
          )}
          <label className="toggle-switch-row">
            <span>يرد وحده على أسئلة الزبائن عن أجهزتهم</span>
            <span className={`toggle-switch${on ? " toggle-switch-on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  setOn(e.target.checked);
                  setWhatsappAnswerOn(e.target.checked);
                  window.setTimeout(refresh, 1500);
                }}
              />
              <span className="toggle-switch-thumb" />
            </span>
          </label>
          {status && status.log.length > 0 && (
            <>
              <p className="settings-hint">آخر الردود:</p>
              <ul className="msg-list">
                {[...status.log].reverse().slice(0, 10).map((l, i) => (
                  <li key={i} className="msg-item">
                    <span className="msg-item-label">💬 {l.name}</span>
                    <small className="msg-item-hint">
                      «{l.question.slice(0, 60)}» · {new Date(l.at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <WhatsAppAgentPart />
        </>
      )}
      <WaCloudSection />
    </section>
  );
}

/**
 * 🤖 «وكيل واتساب (Claude)» (his Nov 15 2026 choices): on / off, his test numbers (only those until «كل من يراسلني»),
 * and the last answers it sent or handed to him.
 */
function WhatsAppAgentPart() {
  const [s, setS] = useState<AgentSettings>({ on: false, everyone: false, numbers: [] });
  const [numbersText, setNumbersText] = useState("");
  const [log, setLog] = useState<AgentLogLine[]>([]);
  const [key, setKey] = useState(true);
  const [saved, setSaved] = useState(false);
  const [seen, setSeen] = useState<AgentSeen | null>(null);
  const [battery, setBattery] = useState<boolean | null>(null);
  const [spend, setSpend] = useState<AgentSpend>(NO_SPEND);

  // 🔍 what the phone's reader saw last (his Nov 21 2026 ask) - read again every few seconds while this is open
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let alive = true;
    const read = () =>
      LocalBrowser.whatsappAgentLastSeen()
        .then((r) => {
          if (!alive) return;
          setSeen(r.seen ?? null);
          setBattery(typeof r.batteryUnrestricted === "boolean" ? r.batteryUnrestricted : null);
        })
        .catch(() => undefined);
    read();
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const load = () => {
      const now = loadAgentSettings();
      setS(now);
      setNumbersText(now.numbers.join("\n"));
      setLog(loadAgentLog());
      setKey(hasClaudeKey());
    };
    load();
    setSpend(loadAgentSpend());
    const reload = () => {
      setLog(loadAgentLog());
      setSpend(loadAgentSpend());
    };
    window.addEventListener(AGENT_EVENT, reload);
    return () => window.removeEventListener(AGENT_EVENT, reload);
  }, []);

  const save = (next: AgentSettings) => {
    setS(next);
    saveAgentSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  const keys = agentNumberKeys(numbersText.split("\n"));

  return (
    <div className="wa-agent" data-tour="wa-agent">
      <h3 className="section-title">🤖 وكيل واتساب (Claude)</h3>
      <p className="settings-hint">
        يكتب Claude الرد على الزبون ويرسله وحده: حالة جهازه وموعد تجديده، ما عليه، سعر التجديد وطريقة الدفع، وخطوات فحص الإنترنت. وما لا يعرفه، أو
        فيه دفع أو إلغاء أو شكوى، يقول للزبون «سأحوّل سؤالك» ويرسل لك إشعارًا. لا يرد في المجموعات ولا على المندوبين.
      </p>
      {!key && <p className="currency-rate-wrong">⚠️ لا يعمل قبل وضع مفتاح Claude: الإعدادات ← البوتات ← «🤖 مساعد Claude».</p>}
      <label className="toggle-switch-row">
        <span>تشغيل الوكيل</span>
        <span className={`toggle-switch${s.on ? " toggle-switch-on" : ""}`}>
          <input type="checkbox" checked={s.on} onChange={(e) => save({ ...s, on: e.target.checked })} />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      <label className="add-field-label" htmlFor="wa-agent-numbers">
        📱 أرقام التجربة (رقم في كل سطر) - يرد عليها فقط
      </label>
      <textarea
        id="wa-agent-numbers"
        className="search-input"
        dir="ltr"
        rows={3}
        placeholder="22 22 33 44"
        value={numbersText}
        onChange={(e) => setNumbersText(e.target.value)}
        onBlur={() => save({ ...s, numbers: numbersText.split("\n").map((n) => n.trim()).filter(Boolean) })}
      />
      <p className="settings-hint">
        {keys.length ? `✓ ${keys.length} رقم للتجربة` : "لا رقم بعد"}
        {saved ? " · حُفظ" : ""}
      </p>
      <label className="toggle-switch-row">
        <span>🧠 وكيل أذكى (Claude Sonnet - نحو 20 ضعف السعر)</span>
        <span className={`toggle-switch${s.smart ? " toggle-switch-on" : ""}`}>
          <input type="checkbox" checked={s.smart === true} onChange={(e) => save({ ...s, smart: e.target.checked || undefined })} />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      <label className="toggle-switch-row">
        <span>يرد على كل من يراسلني (بعد التجربة)</span>
        <span className={`toggle-switch${s.everyone ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={s.everyone}
            onChange={(e) => {
              if (e.target.checked && !window.confirm("يرد الوكيل على كل من يراسلك في واتساب، لا أرقام التجربة فقط؟")) return;
              save({ ...s, everyone: e.target.checked });
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      <p className="settings-hint">يرد والتطبيق مفتوح أو مغلق (ما دامت «قراءة الإشعارات» مفعّلة)؛ رسالة قرأها بعد أكثر من 15 دقيقة تُترك لك.</p>
      <p className="settings-hint">
        {spendLine(spend, localDate())} - تقدير من حجم كل رد (النموذج: {s.smart ? "Claude Sonnet" : "Claude Haiku"}). الرصيد الحقيقي في platform.claude.com ← Billing.
      </p>
      {isRunningInAndroidApp() && s.on && battery === false && (
        <div className="settings-actions">
          <p className="settings-hint agent-pending">
            🔋 الهاتف مقفل = أندرويد يوقف STAR NET فلا يرد الوكيل. اضغط ثم اختر «سماح» ليرد والهاتف مقفل والتطبيق مغلق.
          </p>
          <button type="button" className="dialog-primary" onClick={() => void requestBatteryUnrestricted()}>
            🔋 اسمح له بالعمل بلا قيود
          </button>
        </div>
      )}
      {isRunningInAndroidApp() && s.on && battery === true && <p className="settings-hint">🔋 ✓ يعمل بلا قيود - يرد والهاتف مقفل</p>}
      {isRunningInAndroidApp() && s.on && (
        <p className="settings-hint">
          {(() => {
            const p = loadPackStatus();
            if (!p) return "📦 نسخة الرد والتطبيق مغلق: لم تُرسل بعد - اترك هذا القسم مفتوحًا دقيقة";
            if (p.error) return `📦 ✗ لم تُرسل نسخة الرد والتطبيق مغلق: ${p.error}`;
            return `📦 ✓ نسخة الرد والتطبيق مغلق: ${new Date(p.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${p.customers} زبون`;
          })()}
        </p>
      )}
      <Link href="/agent" className="text-action">
        🎓 تدريب الوكيل: أجب عن أسئلته وعلّمه ←
      </Link>
      {isRunningInAndroidApp() && (
        <div className="msg-item wa-agent-seen">
          <span className="msg-item-label">🔍 آخر رسالة رآها القارئ</span>
          {seen ? (
            <>
              <small className="msg-item-hint">
                «<bdi>{seen.title || "بلا عنوان"}</bdi>» · <bdi dir="ltr">{new Date(seen.at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</bdi>
              </small>
              <small className="msg-item-hint">
                الرقم المقروء: {agentSeenLines(seen).phone ? <bdi dir="ltr">{agentSeenLines(seen).phone}</bdi> : null}
                {agentSeenLines(seen).note ? ` (${agentSeenLines(seen).note})` : ""}
              </small>
              <small className="msg-item-hint">{agentSeenLines(seen).match}</small>
              <small className="msg-item-hint">
                <strong>{agentSeenLines(seen).reason}</strong>
              </small>
              {seen.path && <small className="msg-item-hint">{seen.path}</small>}
            </>
          ) : (
            <small className="msg-item-hint">لم يرَ القارئ أي رسالة واتساب بعد - أرسل رسالة من رقم التجربة</small>
          )}
        </div>
      )}
      {log.length > 0 && (
        <>
          <p className="settings-hint">آخر ما فعله الوكيل:</p>
          <ul className="msg-list">
            {log.slice(0, 10).map((l, i) => (
              <li key={i} className="msg-item wa-agent-line">
                <span className="msg-item-label">
                  {l.error ? "⚠️" : l.handoff ? "🙋" : l.sent ? "✅" : "⏸️"} {l.name} · <bdi dir="ltr">{new Date(l.at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</bdi>
                </span>
                <small className="msg-item-hint">«{l.question.slice(0, 80)}»</small>
                {l.reply && <small className="msg-item-hint">↩️ {l.reply.slice(0, 160)}</small>}
                {l.error && <small className="msg-item-hint">{l.error}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
