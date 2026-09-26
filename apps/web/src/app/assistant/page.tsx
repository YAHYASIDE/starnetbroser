"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { ChatImage, ChatTurn, askClaude } from "@/lib/aiClient";
import { BusinessData, snapshotText } from "@/lib/aiContext";
import { AiSegment, parseAssistantReply } from "@/lib/aiDrafts";
import { AI_MODEL_LABEL, AiUsage, estimateCostUsd, getClaudeApiKey } from "@/lib/aiSettings";
import { listAccounts } from "@/lib/apiClient";
import { loadCashEntries } from "@/lib/cashStore";
import { loadClientStore } from "@/lib/clientStore";
import { loadCurrencyStore } from "@/lib/currencyStore";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { loadInvoices } from "@/lib/invoiceStore";
import { loadLedgerStore } from "@/lib/ledgerStore";
import { loadPreviousDebts } from "@/lib/previousDebt";
import { loadRepresentativeStore } from "@/lib/repStore";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadCardTopUps } from "@/lib/starlinkDebt";
import { loadStoreItems, loadStoreTransactions } from "@/lib/storeStore";
import { loadSupplierStore } from "@/lib/supplierStore";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** Ready-made questions for an empty conversation - the four things the assistant is for. */
const QUICK_PROMPTS = [
  "لخّص لي هذا الشهر: الأرباح، الديون، وما يجب أن أنتبه له، مع نصائح.",
  "من عليه ديون الآن؟ اكتب لكل واحد رسالة مطالبة مهذبة بواتساب.",
  "ما الأجهزة التي يجب تجديدها هذا الأسبوع؟ ومن عليه D لستارلينك؟",
  "قارن بين المندوبين هذا الشهر: الأرباح وحصصهم ومن الأفضل.",
];

interface ShownTurn extends ChatTurn {
  costUsd?: number;
  error?: boolean;
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadBusinessData(): Promise<BusinessData> {
  let accounts: StarlinkAccountSummary[] = [];
  if (isDemoMode()) accounts = loadDemoAccounts(demoAccounts);
  else if (isLoggedIn()) accounts = await listAccounts().catch(() => []);
  return {
    today: todayLocal(),
    accounts,
    clients: loadClientStore(),
    reps: loadRepresentativeStore(),
    suppliers: loadSupplierStore(),
    ledger: loadLedgerStore(),
    previousDebts: loadPreviousDebts(),
    cash: loadCashEntries(),
    topUps: loadCardTopUps(),
    invoices: loadInvoices(),
    items: loadStoreItems(),
    transactions: loadStoreTransactions(),
    currencies: loadCurrencyStore(),
  };
}

export default function AssistantPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [turns, setTurns] = useState<ShownTurn[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshotRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function refreshSnapshot() {
    snapshotRef.current = snapshotText(await loadBusinessData());
  }

  useEffect(() => {
    setApiKey(getClaudeApiKey());
    void refreshSnapshot().then(() => setReady(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, streaming]);

  async function send(text: string) {
    const question = text.trim();
    if (!apiKey || busy || (!question && images.length === 0)) return;
    const userTurn: ShownTurn = { role: "user", text: question, images: images.length ? images : undefined };
    // Earlier errors are shown but never sent back to Claude as if they were its own answers.
    const history = [...turns.filter((t) => !t.error), userTurn];
    setTurns((current) => [...current, userTurn]);
    setInput("");
    setImages([]);
    setBusy(true);
    setStreaming("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await askClaude({
        apiKey,
        snapshot: snapshotRef.current,
        history: history.map(({ role, text: t, images: imgs }) => ({ role, text: t, images: imgs })),
        onText: (delta) => setStreaming((current) => (current ?? "") + delta),
        signal: controller.signal,
      });
      setTurns((current) => [...current, { role: "assistant", text: reply.text, costUsd: estimateCostUsd(reply.usage as AiUsage) }]);
    } catch (err) {
      setTurns((current) => [...current, { role: "assistant", text: err instanceof Error ? err.message : "تعذر الحصول على إجابة", error: true }]);
    } finally {
      setStreaming(null);
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function addImages(files: FileList | null) {
    if (!files) return;
    const added: ChatImage[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        const dataUrl = await resizeImageToDataUrl(file, 1568, 0.85);
        added.push({ mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
      } catch {
        // An unreadable file is simply skipped.
      }
    }
    setImages((current) => [...current, ...added].slice(0, 4));
  }

  async function newConversation() {
    abortRef.current?.abort();
    setTurns([]);
    setImages([]);
    await refreshSnapshot();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  const totalCost = turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);

  return (
    <main className="home assistant-page">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المساعد الذكي</h1>
        {turns.length > 0 && (
          <button type="button" className="text-action ai-new" onClick={newConversation}>
            محادثة جديدة
          </button>
        )}
      </div>
      <p className="settings-hint ai-model-note">
        <bdi dir="ltr">{AI_MODEL_LABEL}</bdi> - يقرأ بياناتك الحالية (بدون كلمات المرور وجلسات الدخول) ولا يعدّل شيئًا بنفسه.
        {totalCost > 0 && (
          <>
            {" "}
            تكلفة هذه المحادثة ≈ <bdi dir="ltr">{totalCost.toFixed(3)} $</bdi>
          </>
        )}
      </p>

      {!apiKey ? (
        <section className="section ai-setup">
          <p>لاستعمال المساعد أضف مفتاح Claude (من حسابك في Anthropic) في الإعدادات.</p>
          <Link href="/settings#claude" className="dialog-primary ai-setup-link">
            إضافة المفتاح
          </Link>
        </section>
      ) : (
        <>
          <div className="ai-chat">
            {turns.length === 0 && (
              <div className="ai-quick">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="ai-quick-chip" disabled={!ready || busy} onClick={() => send(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, i) => (
              <ChatBubble key={i} turn={turn} />
            ))}
            {streaming !== null && (
              <div className="ai-msg ai-assistant">
                {streaming ? <AssistantText text={streaming} /> : <span className="ai-typing">يفكّر…</span>}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="ai-composer" onSubmit={submit}>
            {images.length > 0 && (
              <div className="ai-attachments">
                {images.map((img, i) => (
                  <span key={i} className="ai-thumb">
                    <img src={`data:${img.mediaType};base64,${img.data}`} alt="" />
                    <button type="button" aria-label="إزالة الصورة" onClick={() => setImages((current) => current.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="ai-composer-row">
              <label className="ai-attach" aria-label="إرفاق صورة">
                <input type="file" accept="image/*" multiple onChange={(e) => void addImages(e.target.files).then(() => (e.target.value = ""))} />
                📷
              </label>
              <textarea
                className="search-input ai-input"
                rows={1}
                placeholder="اسأل عن أرباحك، ديونك، أجهزتك…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              {busy ? (
                <button type="button" className="dialog-primary ai-send" onClick={() => abortRef.current?.abort()}>
                  إيقاف
                </button>
              ) : (
                <button type="submit" className="dialog-primary ai-send" disabled={!ready || (!input.trim() && images.length === 0)}>
                  إرسال
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </main>
  );
}

function ChatBubble({ turn }: { turn: ShownTurn }) {
  if (turn.role === "user") {
    return (
      <div className="ai-msg ai-user">
        {turn.images?.length ? (
          <div className="ai-attachments">
            {turn.images.map((img, i) => (
              <span key={i} className="ai-thumb">
                <img src={`data:${img.mediaType};base64,${img.data}`} alt="" />
              </span>
            ))}
          </div>
        ) : null}
        {turn.text && <p className="ai-text">{turn.text}</p>}
      </div>
    );
  }
  return (
    <div className={`ai-msg ai-assistant${turn.error ? " ai-error" : ""}`}>
      <AssistantText text={turn.text} />
      {turn.costUsd !== undefined && (
        <span className="ai-cost">
          ≈ <bdi dir="ltr">{turn.costUsd.toFixed(3)} $</bdi>
        </span>
      )}
    </div>
  );
}

function AssistantText({ text }: { text: string }) {
  return (
    <>
      {parseAssistantReply(text).map((segment, i) => (
        <Segment key={i} segment={segment} />
      ))}
    </>
  );
}

function Segment({ segment }: { segment: AiSegment }) {
  const [copied, setCopied] = useState(false);
  if (segment.type === "text") return <p className="ai-text">{segment.text}</p>;
  const link = buildWhatsAppLink(segment.phone ?? undefined, segment.message);
  return (
    <div className="ai-wa-card">
      <div className="ai-wa-head">
        <strong>💬 {segment.name || "رسالة واتساب"}</strong>
        {segment.phone && <bdi dir="ltr">{segment.phone}</bdi>}
      </div>
      <p className="ai-text">{segment.message}</p>
      <div className="ai-wa-actions">
        {link ? (
          <a className="dialog-primary ai-wa-open" href={link} target="_blank" rel="noreferrer">
            فتح واتساب
          </a>
        ) : (
          <span className="settings-hint">لا يوجد رقم هاتف</span>
        )}
        <button
          type="button"
          className="text-action"
          onClick={() => {
            void navigator.clipboard?.writeText(segment.message).then(() => setCopied(true));
          }}
        >
          {copied ? "✓ نُسخ" : "نسخ"}
        </button>
      </div>
    </div>
  );
}
