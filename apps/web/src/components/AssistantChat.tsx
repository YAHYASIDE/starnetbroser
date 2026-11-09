"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { ASSISTANT_SYSTEM, TICKET_SCHEMA, TICKET_SYSTEM, ticketUserText, type DeviceFacts, type SupportTicket } from "@/lib/claudeAssist";
import { askAssistant, askClaudeJson, hasClaudeKey } from "@/lib/claudeClient";
import { assistantTools } from "@/lib/assistantTools";
import { chatDeviceChoices } from "@/lib/chatDevices";
import { loadClientStore } from "@/lib/clientStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { accountEmail } from "@/lib/dayActions";
import { useKeptState } from "@/lib/dataReload";

interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
  at: number;
  error?: boolean;
}

const KEY = "starnet.assistantChat";
const KEEP = 60;

function loadTurns(): AssistantTurn[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as AssistantTurn[]) : [];
  } catch {
    return [];
  }
}

function saveTurns(turns: AssistantTurn[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(turns.slice(-KEEP)));
  } catch {
    // storage full
  }
}

/**
 * 🤖 «المساعد» (his Nov 9 2026 choice «مساعد في الدردشة»): ask in Arabic about devices, customers, a rep's statement;
 * Claude reads the app's data through read-only tools (lib/assistantTools.ts) and answers. 🎫 writes a new Starlink
 * support ticket from his Arabic words. Kept on this phone only (`starnet.assistantChat`).
 */
export function AssistantChat({ onBack }: { onBack: () => void }) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [text, setText] = useKeptState("assistant.text", "");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("chat-open");
    setTurns(loadTurns());
    return () => document.documentElement.classList.remove("chat-open");
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, busy]);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, text: q, at: Date.now() }];
    setTurns(next);
    saveTurns(next);
    setText("");
    setBusy(true);
    // the conversation's last turns only (each answer reads the data again)
    const history = next.filter((t) => !t.error).slice(-12).map((t) => ({ role: t.role, text: t.text }));
    while (history.length && history[0]!.role !== "user") history.shift();
    const r = await askAssistant(ASSISTANT_SYSTEM, history, assistantTools());
    const answered = [...next, r.ok ? { role: "assistant" as const, text: r.value, at: Date.now() } : { role: "assistant" as const, text: `⚠️ ${r.message}`, at: Date.now(), error: true }];
    setTurns(answered);
    saveTurns(answered);
    setBusy(false);
  }

  return (
    <main className="home chat-page chat-conversation">
      <div className="chat-head">
        <button type="button" className="chat-back" onClick={onBack} aria-label="المحادثات">
          →
        </button>
        <span className="chat-avatar chat-avatar-sm" aria-hidden="true">
          🤖
        </span>
        <span className="chat-head-text">
          <strong>المساعد</strong>
          <small>{hasClaudeKey() ? "Claude - يقرأ بيانات التطبيق ولا يغيّرها" : "ضع مفتاح Claude في الإعدادات"}</small>
        </span>
        <button type="button" className="chat-call" onClick={() => setTicket(true)} aria-label="تذكرة دعم جديدة">
          🎫
        </button>
      </div>
      <div className="chat-messages chat-wallpaper" ref={listRef}>
        {turns.length === 0 && (
          <p className="chat-day">
            اسألني مثلًا: «كم جهازًا موقوفًا؟» · «أجهزة الزبون أحمد» · «كشف المندوب علي» · «ما حالة DEMO 1؟»
            <br />
            🎫 في الأعلى: تذكرة دعم Starlink جديدة.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="chat-row-wrap">
            <div className={`chat-bubble${t.role === "user" ? " is-mine" : ""}`}>
              <p className="chat-text assistant-text">{t.text}</p>
            </div>
          </div>
        ))}
        {busy && <p className="chat-day">⏳ يفكّر ويقرأ البيانات…</p>}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="chat-field">
          <textarea className="chat-input" rows={1} placeholder="اسأل المساعد…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="submit" className="chat-send" aria-label="إرسال" disabled={busy || !text.trim()}>
          ➤
        </button>
      </form>
      {ticket && <TicketWriter onClose={() => setTicket(false)} />}
    </main>
  );
}

/** 🎫 A new Starlink support ticket: the device, his words in Arabic → subject + body in French / English. */
function TicketWriter({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SupportTicket | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const devices = useMemo(() => loadDemoAccounts(demoAccounts), []);
  const clients = useMemo(() => loadClientStore(), []);
  const choices = useMemo(() => chatDeviceChoices(devices, (id) => clients[id]?.name, q, null, 8), [devices, clients, q]);
  const device = devices.find((d) => d.id === deviceId);

  async function write() {
    if (!device || !problem.trim()) return;
    setBusy(true);
    setNote("⏳ يكتب Claude التذكرة…");
    const facts: DeviceFacts = {
      name: device.name,
      email: accountEmail(device) || undefined,
      kit: device.kitNumber || undefined,
      status: device.serviceStatus || undefined,
      renewal: device.rechargeDate || undefined,
      balance: device.balanceDue ? `${device.balanceDue} ${device.currency ?? ""}`.trim() : undefined,
    };
    const r = await askClaudeJson<SupportTicket>({ system: TICKET_SYSTEM, user: ticketUserText(problem, facts, lang), schema: TICKET_SCHEMA as unknown as Record<string, unknown>, keys: ["subject", "body", "translation_ar"] });
    setBusy(false);
    if (r.ok) {
      setResult(r.value);
      setNote(null);
    } else setNote(`⚠️ ${r.message}`);
  }

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setNote("📋 نُسخ - الصقه في صفحة الدعم");
    } catch {
      setNote("تعذّر النسخ - حدّد النص بيدك");
    }
  };

  return (
    <PartySheet title="🎫 تذكرة دعم Starlink جديدة" onClose={onClose}>
      {!device ? (
        <>
          <input className="msg-input" placeholder="الجهاز: الاسم، الزبون، الإيميل، KIT" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="msg-list chat-picker">
            {choices.map((c) => (
              <button key={c.id} type="button" className="msg-item" onClick={() => setDeviceId(c.id)}>
                <span className="msg-item-label">{c.name}</span>
                {c.hint && <small className="msg-item-hint">{c.hint}</small>}
              </button>
            ))}
          </div>
        </>
      ) : !result ? (
        <>
          <p className="settings-hint">
            📡 {device.name}{" "}
            <button type="button" className="text-action" onClick={() => setDeviceId(null)}>
              تغيير
            </button>
          </p>
          <textarea className="msg-input" rows={4} placeholder="اكتب المشكلة بالعربية: مثلًا الطبق لا يتصل منذ 3 أيام، أعدنا تشغيله ولم يتغير شيء" value={problem} onChange={(e) => setProblem(e.target.value)} />
          <div className="chat-filters">
            {(["fr", "en"] as const).map((l) => (
              <button key={l} type="button" className={`chat-filter${lang === l ? " is-on" : ""}`} onClick={() => setLang(l)}>
                {l === "fr" ? "Français" : "English"}
              </button>
            ))}
          </div>
          <button type="button" className="dialog-primary" disabled={busy || !problem.trim()} onClick={() => void write()}>
            {busy ? "⏳ يكتب…" : "✍️ اكتب التذكرة"}
          </button>
        </>
      ) : (
        <>
          <p className="settings-hint">العنوان:</p>
          <p className="assistant-ticket" dir="auto">
            {result.subject}
          </p>
          <p className="settings-hint">النص:</p>
          <p className="assistant-ticket" dir="auto">
            {result.body}
          </p>
          <details>
            <summary className="settings-hint">🇸🇦 الترجمة للعربية (للتأكد)</summary>
            <p className="assistant-ticket">{result.translation_ar}</p>
          </details>
          <div className="call-server-actions">
            <button type="button" className="dialog-primary" onClick={() => void copy(`${result.subject}\n\n${result.body}`)}>
              📋 نسخ العنوان والنص
            </button>
            <button type="button" className="dialog-secondary" onClick={() => setResult(null)}>
              ✎ عدّل الوصف
            </button>
          </div>
        </>
      )}
      {note && <p className="settings-hint">{note}</p>}
    </PartySheet>
  );
}
