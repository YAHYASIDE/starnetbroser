"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addLesson,
  answerQuestion,
  dismissQuestion,
  approveLesson,
  isApproved,
  loadLessons,
  loadQuestions,
  removeLesson,
  saveLessons,
  saveQuestions,
  trainingCounts,
  TRAINING_EVENT,
  updateLesson,
  type AgentLesson,
  type AgentQuestion,
} from "@/lib/agentTraining";
import { hasClaudeKey } from "@/lib/claudeClient";
import { AGENT_EVENT, agentPreview, loadAgentSpend } from "@/lib/whatsappAgentLink";
import { NO_SPEND, spendLine, type AgentSpend } from "@/lib/agentRefresh";
import { withTurns, type AgentAnswer, type AgentTurn } from "@/lib/whatsappAgent";
import { AgentMenusAdmin } from "@/components/AgentMenusAdmin";
import { HandoffsTab, StatsTab } from "@/components/AgentDeskTabs";
import { teamMemberName } from "@/components/TeamFlagSheet";
import { DESK_EVENT, loadHandoffs, openHandoffs } from "@/lib/agentDesk";
import { browserLinkStorage, isMainMember, loadLinkConfig } from "@/lib/deviceLink";

/** His phone (or one not in a team): its lessons need no approval, and it approves the others'. */
function onMainPhone(): boolean {
  const link = loadLinkConfig(browserLinkStorage());
  return !link?.enabled || isMainMember(link.memberId);
}

type Tab = "questions" | "staff" | "lessons" | "menus" | "stats" | "try";

const when = (at: number) => new Date(at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * 🎓 «تدريب الوكيل» (his Nov 21 2026 ask): the questions the WhatsApp agent didn't know - he answers, the answer goes
 * to the customer at once and becomes a lesson -, the lessons themselves, and a test chat. Logic: lib/agentTraining.ts.
 */
export default function AgentTrainingPage() {
  const [tab, setTab] = useState<Tab>("questions");
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [lessons, setLessons] = useState<AgentLesson[]>([]);
  const [spend, setSpend] = useState<AgentSpend>(NO_SPEND);
  const [staff, setStaff] = useState(0);

  useEffect(() => {
    const load = () => {
      setQuestions(loadQuestions());
      setLessons(loadLessons());
      setSpend(loadAgentSpend());
      setStaff(openHandoffs(loadHandoffs()).length);
    };
    load();
    window.addEventListener(TRAINING_EVENT, load);
    window.addEventListener(AGENT_EVENT, load);
    window.addEventListener(DESK_EVENT, load);
    // what the team link brings (another phone answered / the agent asked)
    window.addEventListener("storage", load);
    const timer = window.setInterval(load, 5000);
    return () => {
      window.removeEventListener(TRAINING_EVENT, load);
      window.removeEventListener(AGENT_EVENT, load);
      window.removeEventListener(DESK_EVENT, load);
      window.removeEventListener("storage", load);
      window.clearInterval(timer);
    };
  }, []);

  const counts = trainingCounts(questions);

  return (
    <main className="home agent-page">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">🎓 تدريب الوكيل</h1>
      </div>
      <p className="settings-hint">
        ما لا يعرفه وكيل واتساب يصل هنا. اكتب الجواب: يُرسل للزبون فورًا، ويتعلّمه الوكيل للمرات القادمة. يرد الوكيل بلغة الزبون: عربية فصحى بسيطة أو
        فرنسية.
      </p>
      {spend.monthCalls > 0 && <p className="settings-hint">{spendLine(spend, `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`)} على هذا الهاتف</p>}

      <div className="mailbox-tabs" role="tablist">
        {(
          [
            ["questions", `❓ تنتظرك (${counts.open})`],
            ["staff", `👨‍💼 المحوّلون (${staff})`],
            ["menus", "🗂️ إدارة القوائم"],
            ["lessons", `📚 الدروس (${lessons.length})`],
            ["stats", "📊 الإحصائيات"],
            ["try", "💬 جرّب"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`mailbox-tab${tab === t ? " mailbox-tab-active" : ""}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "questions" && <QuestionsTab questions={questions} lessons={lessons} />}
      {tab === "lessons" && <LessonsTab lessons={lessons} />}
      {tab === "staff" && <HandoffsTab />}
      {tab === "menus" && <AgentMenusAdmin />}
      {tab === "stats" && <StatsTab />}
      {tab === "try" && <TryTab />}
    </main>
  );
}

function QuestionsTab({ questions, lessons }: { questions: AgentQuestion[]; lessons: AgentLesson[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const open = questions.filter((q) => q.status === "open").sort((a, b) => b.at - a.at);
  const answered = questions
    .filter((q) => q.status === "answered")
    .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))
    .slice(0, 20);

  const answer = (q: AgentQuestion) => {
    const next = answerQuestion(loadQuestions(), loadLessons(), q.id, drafts[q.id] ?? "", Date.now(), onMainPhone(), teamMemberName());
    saveLessons(next.lessons);
    saveQuestions(next.questions);
    setDrafts((d) => ({ ...d, [q.id]: "" }));
  };

  return (
    <section className="section agent-list">
      {open.length === 0 ? (
        <p className="empty-state">لا سؤال ينتظرك - كل ما سأله الزبائن عرف الوكيل جوابه.</p>
      ) : (
        open.map((q) => (
          <div key={q.id} className="msg-item agent-q">
            <span className="msg-item-label">
              🙋 <bdi dir={/^[+\d\s()-]+$/.test(q.name) ? "ltr" : "auto"}>{q.name || "زبون"}</bdi> · <bdi dir="ltr">{when(q.at)}</bdi>
            </span>
            <p className="agent-q-text">«{q.text}»</p>
            {q.agentReply && <small className="msg-item-hint">ردّ الوكيل: {q.agentReply}</small>}
            {q.reason && <small className="msg-item-hint">لماذا: {q.reason}</small>}
            <label className="add-field-label" htmlFor={`agent-answer-${q.id}`}>
              جوابك (يُرسل له الآن ويتعلّمه الوكيل)
            </label>
            <textarea
              id={`agent-answer-${q.id}`}
              className="search-input"
              rows={3}
              value={drafts[q.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
            />
            <div className="agent-actions">
              <button type="button" className="dialog-primary" disabled={!(drafts[q.id] ?? "").trim()} onClick={() => answer(q)}>
                📤 أرسل وعلّمه
              </button>
              <button type="button" className="text-action" onClick={() => saveQuestions(dismissQuestion(loadQuestions(), q.id))}>
                تجاهل
              </button>
            </div>
          </div>
        ))
      )}

      {answered.length > 0 && (
        <>
          <p className="settings-hint">أجبتَ عنها:</p>
          {answered.map((q) => (
            <div key={q.id} className="msg-item agent-q agent-q-done">
              <span className="msg-item-label">
                {q.send === "sent" ? "✅ أُرسل" : q.send === "failed" ? "⚠️ لم يُرسل" : "⏳ ينتظر هاتف الوكيل"} · <bdi dir={/^[+\d\s()-]+$/.test(q.name) ? "ltr" : "auto"}>{q.name || "زبون"}</bdi>
              </span>
              <small className="msg-item-hint">«{q.text.slice(0, 100)}»</small>
              <small className="msg-item-hint">↩️ {q.answer}</small>
              {q.send === "failed" && (
                <>
                  <small className="msg-item-hint">اختفى إشعار المحادثة على هاتف الوكيل - أرسله بنفسك (تعلّمه الوكيل على كل حال).</small>
                  <button type="button" className="text-action" onClick={() => void navigator.clipboard?.writeText(q.answer ?? "").catch(() => undefined)}>
                    📋 انسخ الجواب
                  </button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {lessons.length === 0 && open.length === 0 && <p className="settings-hint">علّمه أيضًا مقدّمًا من «📚 الدروس»: الأسعار، طريقة العمل، ما لا يُقال.</p>}
    </section>
  );
}

function LessonsTab({ lessons }: { lessons: AgentLesson[] }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = [...lessons].sort((x, y) => y.updatedAt - x.updatedAt);

  const save = () => {
    const now = Date.now();
    saveLessons(editing ? updateLesson(loadLessons(), editing, q, a, now) : addLesson(loadLessons(), q, a, now, onMainPhone(), teamMemberName()));
    setQ("");
    setA("");
    setEditing(null);
  };

  return (
    <section className="section agent-list">
      <div className="msg-item agent-q">
        <span className="msg-item-label">{editing ? "✏️ تعديل الدرس" : "➕ درس جديد"}</span>
        <label className="add-field-label" htmlFor="agent-lesson-q">
          السؤال (اختياري)
        </label>
        <input id="agent-lesson-q" className="search-input" placeholder="كم سعر التجديد؟" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="add-field-label" htmlFor="agent-lesson-a">
          الجواب أو القاعدة
        </label>
        <textarea id="agent-lesson-a" className="search-input" rows={3} placeholder="سعر التجديد الشهري 20,000 أوقية أو 35,000 سيفا" value={a} onChange={(e) => setA(e.target.value)} />
        <div className="agent-actions">
          <button type="button" className="dialog-primary" disabled={!a.trim()} onClick={save}>
            {editing ? "💾 احفظ" : "➕ أضف"}
          </button>
          {editing && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setEditing(null);
                setQ("");
                setA("");
              }}
            >
              إلغاء
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="empty-state">لا دروس بعد - كل جواب تكتبه لسؤال ينتظرك يصير درسًا هنا.</p>
      ) : (
        sorted.map((l) => (
          <div key={l.id} className="msg-item agent-q">
            {l.question && <span className="msg-item-label">❓ {l.question}</span>}
            <p className="agent-q-text">{l.answer}</p>
            {!isApproved(l) && (
              <small className="msg-item-hint agent-pending">
                ⏳ بانتظار اعتمادك{l.by ? ` - كتبه «${l.by}»` : ""} - لا يستعمله الوكيل قبل ذلك
              </small>
            )}
            <div className="agent-actions">
              {!isApproved(l) && onMainPhone() && (
                <button type="button" className="dialog-primary" onClick={() => saveLessons(approveLesson(loadLessons(), l.id))}>
                  ✓ اعتمد
                </button>
              )}
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  setEditing(l.id);
                  setQ(l.question);
                  setA(l.answer);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                ✏️ عدّل
              </button>
              {confirmDelete === l.id ? (
                <button
                  type="button"
                  className="text-action agent-danger"
                  onClick={() => {
                    saveLessons(removeLesson(loadLessons(), l.id));
                    setConfirmDelete(null);
                  }}
                >
                  تأكيد الحذف
                </button>
              ) : (
                <button type="button" className="text-action agent-danger" onClick={() => setConfirmDelete(l.id)}>
                  🗑️ احذف
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function TryTab() {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [chat, setChat] = useState<AgentTurn[]>([]);
  const [last, setLast] = useState<{ question: string; answer: AgentAnswer; customer: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fix, setFix] = useState("");
  const [fixed, setFixed] = useState(false);
  const keyHere = typeof window !== "undefined" && hasClaudeKey();

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    setFixed(false);
    const r = await agentPreview(message, phone, chat);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setChat(withTurns(chat, { from: "customer", text: message, at: Date.now() }, { from: "agent", text: r.value.reply, at: Date.now() }));
    setLast({ question: message, answer: r.value, customer: r.customer });
    setFix("");
    setText("");
  };

  if (!keyHere) return <p className="empty-state">التجربة تحتاج مفتاح Claude على هذا الهاتف - جرّب من هاتف «المسؤول 2»، أو ضع المفتاح في الإعدادات ← 🤖 مساعد Claude.</p>;

  return (
    <section className="section agent-list">
      <p className="settings-hint">اكتب كأنك زبون: يرد الوكيل هنا فقط، لا يُرسل شيء على واتساب. ضع رقم زبون ليرد بمعلومات أجهزته.</p>
      <label className="add-field-label" htmlFor="agent-try-phone">
        رقم الزبون (اختياري)
      </label>
      <input id="agent-try-phone" className="search-input" dir="ltr" inputMode="tel" placeholder="22 22 33 44" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {chat.length > 0 && (
        <ul className="agent-chat">
          {chat.map((t, i) => (
            <li key={i} className={`agent-bubble agent-bubble-${t.from}`}>
              {t.text}
            </li>
          ))}
        </ul>
      )}
      {last && (
        <div className="msg-item agent-q">
          <small className="msg-item-hint">
            {last.customer ? `يعرفه كزبون: ${last.customer}` : "زبون غير مسجّل"} · {last.answer.handoff ? `🙋 كان سيحوّله لك: ${last.answer.reason}` : "✓ أجاب وحده"}
          </small>
          <label className="add-field-label" htmlFor="agent-try-fix">
            ✏️ ردّ خطأ؟ اكتب الصحيح ليتعلّمه
          </label>
          <textarea id="agent-try-fix" className="search-input" rows={2} value={fix} onChange={(e) => setFix(e.target.value)} />
          <button
            type="button"
            className="dialog-primary"
            disabled={!fix.trim()}
            onClick={() => {
              saveLessons(addLesson(loadLessons(), last.question, fix, Date.now(), onMainPhone(), teamMemberName()));
              setFix("");
              setFixed(true);
            }}
          >
            📚 علّمه هذا الجواب
          </button>
          {fixed && <small className="msg-item-hint">✓ تعلّمه - اسأله مرة أخرى لترى.</small>}
        </div>
      )}
      <label className="add-field-label" htmlFor="agent-try-text">
        رسالة الزبون
      </label>
      <textarea id="agent-try-text" className="search-input" rows={2} placeholder="كم سعر التجديد؟" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="agent-actions">
        <button type="button" className="dialog-primary" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? "يكتب…" : "💬 أرسل"}
        </button>
        {chat.length > 0 && (
          <button
            type="button"
            className="text-action"
            onClick={() => {
              setChat([]);
              setLast(null);
            }}
          >
            محادثة جديدة
          </button>
        )}
      </div>
      {error && <p className="settings-hint agent-danger">{error}</p>}
    </section>
  );
}
