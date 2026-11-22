"use client";

import { useEffect, useState } from "react";
import { closeHandoff, DESK_EVENT, loadEvents, loadHandoffs, menuStats, openHandoffs, saveHandoffs, takeHandoff, type AgentEvent, type Handoff } from "@/lib/agentDesk";
import { loadMenus } from "@/lib/agentMenus";
import { costOf, spendWords } from "@/lib/agentRefresh";
import { teamMemberName } from "@/components/TeamFlagSheet";
import { cloudRelease, cloudSend } from "@/lib/waCloud";

const when = (at: number) => new Date(at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const isNumber = (s: string) => /^[+\d\s()-]+$/.test(s);

function useDesk(): { handoffs: Handoff[]; events: AgentEvent[] } {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  useEffect(() => {
    const load = () => {
      setHandoffs(loadHandoffs());
      setEvents(loadEvents());
    };
    load();
    window.addEventListener(DESK_EVENT, load);
    const timer = window.setInterval(load, 5000);
    return () => {
      window.removeEventListener(DESK_EVENT, load);
      window.clearInterval(timer);
    };
  }, []);
  return { handoffs, events };
}

/** 👨‍💼 The conversations a customer gave to a person: waiting, taken, given back to the agent (his Nov 21 2026 brief). */
export function HandoffsTab() {
  const { handoffs } = useDesk();
  const list = openHandoffs(handoffs);
  return (
    <section className="section agent-list">
      <p className="settings-hint">
        من طلب «موظف»: الوكيل صامت معه حتى تعيده له أو تمرّ المدة المحددة. زبون رقمك الحالي: ردّ عليه من واتساب نفسه. زبون الرقم الرسمي ☁️: ردّ عليه من
        هنا. لا يقول الوكيل للزبون إن موظفًا متاح الآن.
      </p>
      {list.length === 0 ? (
        <p className="empty-state">لا محادثة محوّلة لموظف الآن.</p>
      ) : (
        list.map((h) => (
          <div key={h.id} className="msg-item agent-q">
            <span className="msg-item-label">
              {h.status === "waiting" ? "🟠 ينتظر موظفًا" : `🟢 استلمها «${h.takenBy ?? ""}»`} · <bdi dir={isNumber(h.name) ? "ltr" : "auto"}>{h.name || "زبون"}</bdi> ·{" "}
              <bdi dir="ltr">{when(h.at)}</bdi>
            </span>
            {h.phone && (
              <small className="msg-item-hint">
                الرقم: <bdi dir="ltr">+{h.phone}</bdi>
              </small>
            )}
            <p className="agent-q-text">«{h.text}»</p>
            {h.summary && <small className="msg-item-hint menus-summary">{h.summary}</small>}
            {h.wa && <CloudThread h={h} />}
            <div className="agent-actions">
              {h.status === "waiting" && (
                <button type="button" className="dialog-primary" onClick={() => saveHandoffs(takeHandoff(loadHandoffs(), h.id, teamMemberName(), Date.now()))}>
                  ✋ استلام المحادثة
                </button>
              )}
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => {
                  saveHandoffs(closeHandoff(loadHandoffs(), h.id, Date.now()));
                  if (h.wa) void cloudRelease(h.wa);
                }}
              >
                🤖 إعادة المحادثة للوكيل
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/** 📊 What the menus and the agent really did (events only - nothing estimated shown as an operation). */
export function StatsTab() {
  const { events } = useDesk();
  const [days, setDays] = useState(30);
  const since = Date.now() - days * 86400_000;
  const s = menuStats(events, since);
  const titles = new Map((loadMenus().published ?? loadMenus().draft).nodes.map((n) => [n.id, `${n.icon} ${n.title}`]));
  const aiCost = events.filter((e) => e.at >= since && e.model).reduce((sum, e) => sum + costOf(e.model!, e.input ?? 0, e.output ?? 0), 0);
  return (
    <section className="section agent-list">
      <div className="agent-actions">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`menus-subtab${days === d ? " menus-subtab-on" : ""}`} onClick={() => setDays(d)}>
            آخر {d} يومًا
          </button>
        ))}
      </div>
      {events.length === 0 && <p className="empty-state">لا عمليات مسجّلة بعد - تبدأ الأرقام مع أول رسالة بعد هذا التحديث.</p>}
      <div className="menus-stats">
        <Stat label="عملاء فتحوا القائمة" value={s.customersWithMenu} />
        <Stat label="حلّها الوكيل أو القائمة" value={s.solved} />
        <Stat label="لم يستطع حلّها" value={s.unsolved} />
        <Stat label="طلبات موظف" value={s.handoffs} />
        <Stat label="أخطاء إرسال" value={s.sendFailures} />
        <Stat label="متوسط زمن الرد" value={s.avgReplyMs === null ? "-" : `${Math.round(s.avgReplyMs / 1000)} ث`} />
      </div>
      <div className="menus-card">
        <strong>💰 التكلفة (تقدير)</strong>
        <small className="msg-item-hint">رسائل واتساب: <bdi dir="ltr">$0</bdi> - الرد من «رد» الإشعار لا يكلّف شيئًا (Cloud API له سعره الخاص).</small>
        <small className="msg-item-hint">
          الذكاء الاصطناعي: {spendWords(aiCost)} · {s.aiReplies} رد · {s.inputTokens.toLocaleString("en-US")} + {s.outputTokens.toLocaleString("en-US")} رمز
        </small>
      </div>
      {s.topItems.length > 0 && (
        <div className="menus-card">
          <strong>🗂️ أكثر الأقسام استخدامًا</strong>
          {s.topItems.map(([id, n]) => (
            <small key={id} className="msg-item-hint">
              {titles.get(id) ?? id}: {n}
            </small>
          ))}
        </div>
      )}
      {s.topQuestions.length > 0 && (
        <div className="menus-card">
          <strong>❓ أكثر الأسئلة تكرارًا</strong>
          {s.topQuestions.map(([q, n]) => (
            <small key={q} className="msg-item-hint">
              «{q}»: {n}
            </small>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="menus-stat">
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

/** ☁️ A customer of the official number: his messages since he asked for a person, and the staff's reply box. */
function CloudThread({ h }: { h: Handoff }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="wa-thread">
      {(h.thread ?? []).slice(-10).map((m, i) => (
        <div key={i} className={`wa-bubble ${m.from === "customer" ? "wa-bubble-customer" : "wa-bubble-agent"}`}>
          {m.from === "staff" && m.by ? `«${m.by}»: ` : ""}
          {m.text}
        </div>
      ))}
      <textarea className="search-input menus-text" rows={2} aria-label="ردّك على الزبون" placeholder="ردّك على الزبون (يصله من الرقم الرسمي)" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        className="dialog-primary"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await cloudSend(h.wa!, text.trim(), teamMemberName());
          setBusy(false);
          if (r.ok) setText("");
          else setError(r.error ?? "لم يُرسل");
        }}
      >
        {busy ? "يرسل…" : "📤 أرسل"}
      </button>
      {error && <small className="msg-item-hint agent-pending">{error}</small>}
    </div>
  );
}
