"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PartySheet } from "@/components/AccountsSection";
import { chatView, CHAT_LIVE_EVENT, loadUnsent, postChat } from "@/components/ChatRunner";
import { startCall } from "@/components/CallManager";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { teamMemberName } from "@/components/TeamFlagSheet";
import {
  CHAT_EVENT,
  chatTime,
  isChatImage,
  isMine,
  loadChat,
  loadChatRead,
  markChatRead,
  MAX_CHAT_TEXT,
  messagePreview,
  messagesOf,
  newChatMessage,
  unreadCount,
  type ChatStore,
} from "@/lib/chat";
import { chatTargets, type ChatTarget } from "@/lib/chatTransport";
import { loadClientStore } from "@/lib/clientStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
import { homeSearchHref } from "@/lib/homeActions";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { loadRepCopy } from "@/lib/repCopy";
import { isRepWorkspace } from "@/lib/repMode";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** A picture small enough to travel (tries smaller until it fits). */
async function chatPicture(file: File): Promise<string | null> {
  for (const [size, quality] of [
    [1000, 0.6],
    [800, 0.5],
    [600, 0.45],
  ] as const) {
    const url = await resizeImageToDataUrl(file, size, quality).catch(() => null);
    if (url && isChatImage(url)) return url;
  }
  return null;
}

/**
 * 💬 الدردشة (his Nov 7 2026 ask; lib/chat.ts): the conversations - 👥 الفريق, 🤝 each rep (on the rep's phone: only
 * his own with the operator) and 👤 الزبائن (no app: their WhatsApp) -, then one conversation: the messages, text,
 * 📷 a picture, 📡 a device (tap → its card).
 */
export default function ChatPage() {
  const router = useRouter();
  const [rep, setRep] = useState(false);
  const [targets, setTargets] = useState<ChatTarget[]>([]);
  const [store, setStore] = useState<ChatStore>({});
  const [read, setRead] = useState<Record<string, number>>({});
  const [unsent, setUnsent] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [customers, setCustomers] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [live, setLive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const isRep = isRepWorkspace();
    setRep(isRep);
    setMemberId(loadLinkConfig(browserLinkStorage())?.memberId ?? "");
    const list = chatTargets();
    setTargets(list);
    // the rep has one conversation: open it at once
    if (isRep && list.length === 1) setOpen(list[0]!.conv);
    const reload = () => {
      setStore(loadChat());
      setRead(loadChatRead());
      setUnsent(loadUnsent());
    };
    reload();
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ conv: string; live: boolean }>).detail;
      setLive((cur) => ({ ...cur, [d.conv]: d.live }));
    };
    window.addEventListener(CHAT_EVENT, reload);
    window.addEventListener(CHAT_LIVE_EVENT, onLive);
    return () => {
      window.removeEventListener(CHAT_EVENT, reload);
      window.removeEventListener(CHAT_LIVE_EVENT, onLive);
    };
  }, []);

  useEffect(() => {
    chatView.conv = open;
    return () => {
      chatView.conv = null;
    };
  }, [open]);

  const side = useMemo(() => ({ rep, memberId }), [rep, memberId]);
  const target = targets.find((t) => t.conv === open) ?? null;

  if (target) {
    return (
      <Conversation
        target={target}
        store={store}
        unsent={unsent}
        side={side}
        live={live[target.conv]}
        onBack={rep && targets.length === 1 ? null : () => setOpen(null)}
        onOpenDevice={(name) => router.push(homeSearchHref(name))}
      />
    );
  }

  return (
    <main className="home chat-page">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">💬 الدردشة</h1>
      </div>
      {targets.length === 0 ? (
        <p className="party-empty">
          {rep
            ? "الدردشة مع المسؤول تحتاج نسخة جديدة منه - اطلب منه أن يرسل لك نسختك."
            : "الدردشة تحتاج «🔗 ربط الأجهزة (الفريق)» في الإعدادات ← النسخ الاحتياطي (Firebase)."}
        </p>
      ) : (
        <ul className="chat-list">
          {targets.map((t) => {
            const last = messagesOf(store, t.conv).at(-1);
            const count = unreadCount(store, t.conv, read, side);
            return (
              <li key={t.conv}>
                <button type="button" className="chat-list-item" onClick={() => setOpen(t.conv)}>
                  <span className="chat-list-title">{t.title}</span>
                  <span className="chat-list-last">{last ? `${isMine(last, side) ? "أنت: " : `${last.by}: `}${messagePreview(last)}` : "لا رسائل بعد"}</span>
                  {last && <small className="chat-list-time">{chatTime(last.at, Date.now())}</small>}
                  {count > 0 && <span className="chat-badge">{count}</span>}
                </button>
              </li>
            );
          })}
          {!rep && (
            <li>
              <button type="button" className="chat-list-item" onClick={() => setCustomers(true)}>
                <span className="chat-list-title">👤 الزبائن</span>
                <span className="chat-list-last">ليس عندهم التطبيق - المحادثة في واتساب</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {!rep && targets.length > 0 && targets.length < 2 && (
        <p className="settings-hint">المندوبون يظهرون هنا بعد أن ترسل لكل واحد نسخته من جديد (فيها قناته).</p>
      )}
      {customers && <CustomersSheet onClose={() => setCustomers(false)} />}
    </main>
  );
}

function Conversation({
  target,
  store,
  unsent,
  side,
  live,
  onBack,
  onOpenDevice,
}: {
  target: ChatTarget;
  store: ChatStore;
  unsent: string[];
  side: { rep: boolean; memberId: string };
  live: boolean | undefined;
  onBack: (() => void) | null;
  onOpenDevice: (name: string) => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [device, setDevice] = useState<{ id: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messages = messagesOf(store, target.conv);
  const lastAt = messages.at(-1)?.at ?? 0;

  useEffect(() => {
    if (lastAt) markChatRead(target.conv, lastAt);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastAt, target.conv]);

  async function send(voice?: { audio: string; seconds: number }) {
    const me = side.rep ? loadRepCopy()?.repName ?? "المندوب" : teamMemberName();
    const message = newChatMessage({
      conv: target.conv,
      from: side.rep ? "rep" : "owner",
      by: me === "أنا" ? "المسؤول" : me,
      member: side.rep ? undefined : side.memberId,
      ...(voice ? { text: "", audio: voice.audio, seconds: voice.seconds } : { text, image, device }),
    });
    if (!message) return;
    if (!voice) {
      setText("");
      setImage(null);
      setDevice(null);
    }
    const ok = await postChat(target, message);
    setNote(ok ? null : "⏳ لم تُرسل بعد - تُرسل وحدها حين يتصل الإنترنت");
  }

  return (
    <main className="home chat-page chat-conversation">
      <div className="session-header chat-head">
        {onBack ? (
          <button type="button" className="btn-link" onClick={onBack}>
            ← المحادثات
          </button>
        ) : (
          <Link href="/" className="btn-link">
            ← رجوع
          </Link>
        )}
        <h1 className="section-title">{target.title}</h1>
        <button type="button" className="chat-call" onClick={() => startCall(target.conv)} aria-label="مكالمة صوتية">
          📞
        </button>
        <span className={`chat-live${live === false ? " is-off" : ""}`} title={live === false ? "غير متصل" : "مباشر"} aria-label={live === false ? "غير متصل" : "مباشر"} />
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="party-empty">لا رسائل بعد - اكتب أول رسالة.</p>}
        {messages.map((m) => {
          const mine = isMine(m, side);
          return (
            <div key={m.id} className={`chat-bubble${mine ? " is-mine" : ""}`}>
              {!mine && <strong className="chat-by">{m.by}</strong>}
              {m.image && (
                <button type="button" className="chat-image" onClick={() => setViewer(m.image!)} aria-label="عرض الصورة">
                  <img src={m.image} alt="صورة" />
                </button>
              )}
              {m.device && (
                <button type="button" className="chat-device" onClick={() => onOpenDevice(m.device!.name)}>
                  📡 {m.device.name}
                </button>
              )}
              {m.audio && (
                <span className="chat-voice">
                  <audio className="chat-audio" controls preload="none" src={m.audio} />
                  {m.seconds ? <small className="chat-meta">🎤 {m.seconds} ث</small> : null}
                </span>
              )}
              {m.mediaGone && <small className="chat-meta">🗑️ الصورة / التسجيل لم يعد محفوظًا في هذا الهاتف</small>}
              {m.text && <p className={`chat-text${m.call ? " chat-call-line" : ""}`}>{m.text}</p>}
              <small className="chat-meta">
                {chatTime(m.at, Date.now())}
                {mine && (unsent.includes(m.id) ? " ⏳" : " ✓")}
              </small>
            </div>
          );
        })}
      </div>
      {note && <p className="settings-hint chat-note">{note}</p>}
      {(image || device) && (
        <div className="chat-attached">
          {image && (
            <span className="chat-attached-item">
              <img src={image} alt="" /> <button type="button" className="text-action" onClick={() => setImage(null)} aria-label="إزالة الصورة">✕</button>
            </span>
          )}
          {device && (
            <span className="chat-attached-item">
              📡 {device.name} <button type="button" className="text-action" onClick={() => setDevice(null)} aria-label="إزالة الجهاز">✕</button>
            </span>
          )}
        </div>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {!recording && (
          <>
            <button type="button" className="chat-tool" onClick={() => fileRef.current?.click()} aria-label="إرفاق صورة">
              📷
            </button>
            <button type="button" className="chat-tool" onClick={() => setPicking(true)} aria-label="إرفاق جهاز">
              📡
            </button>
            <textarea
              className="chat-input"
              rows={1}
              maxLength={MAX_CHAT_TEXT}
              placeholder="اكتب رسالة…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </>
        )}
        {/* 🎤 an empty field: record a voice message; something typed / attached: send it */}
        {!text.trim() && !image && !device ? (
          <VoiceRecorder onState={setRecording} onRecorded={(audio, seconds) => void send({ audio, seconds })} onError={setNote} />
        ) : (
          <button type="submit" className="chat-send" aria-label="إرسال">
            ➤
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const url = await chatPicture(file);
            if (url) setImage(url);
            else setNote("تعذّر تجهيز الصورة - جرّب صورة أخرى");
          }}
        />
      </form>
      {picking && (
        <DevicePicker
          onPick={(d) => {
            setDevice(d);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {viewer && (
        <div className="rep-receipt-viewer" role="dialog" aria-label="الصورة" onClick={() => setViewer(null)}>
          <button type="button" className="rep-receipt-close" aria-label="إغلاق" onClick={() => setViewer(null)}>
            ✕
          </button>
          <img src={viewer} alt="الصورة" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
}

/** 📡 Attach a device: search by name / email / KIT. */
function DevicePicker({ onPick, onClose }: { onPick: (d: { id: string; name: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const devices = useMemo(() => loadDemoAccounts(demoAccounts).filter((a) => !a.deletedAt && !a.archivedAt), []);
  const found = devices
    .filter((a) => {
      const t = q.trim().toLowerCase();
      if (!t) return true;
      return [a.name, a.expectedEmail, a.starlinkAccountEmail, a.kitNumber].some((v) => (v ?? "").toLowerCase().includes(t));
    })
    .slice(0, 40);
  return (
    <PartySheet title="📡 أرفق جهازًا" onClose={onClose}>
      <input className="msg-input" placeholder="ابحث: اسم، إيميل، KIT" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="msg-list chat-picker">
        {found.map((a) => (
          <button key={a.id} type="button" className="msg-item" onClick={() => onPick({ id: a.id, name: a.name })}>
            <span className="msg-item-label">{a.name}</span>
            {a.expectedEmail && <small className="msg-item-hint">{a.expectedEmail}</small>}
          </button>
        ))}
        {found.length === 0 && <p className="party-empty">لا جهاز بهذا البحث.</p>}
      </div>
    </PartySheet>
  );
}

/** 👤 The customers have no app: each one's WhatsApp. */
function CustomersSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const clients = useMemo(
    () =>
      Object.values(loadClientStore())
        .filter((c) => c.phone && buildWhatsAppLink(c.phone))
        .sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [],
  );
  const found = clients.filter((c) => !q.trim() || c.name.includes(q.trim()) || (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~")).slice(0, 60);
  return (
    <PartySheet title="👤 الزبائن - واتساب" onClose={onClose}>
      <input className="msg-input" placeholder="ابحث باسم الزبون أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="msg-list chat-picker">
        {found.map((c) => (
          <a key={c.id} className="msg-item" href={buildWhatsAppLink(c.phone) ?? "#"} target="_blank" rel="noopener noreferrer">
            <span className="msg-item-label">💬 {c.name}</span>
            <small className="msg-item-hint">
              <bdi dir="ltr">{c.phone}</bdi>
            </small>
          </a>
        ))}
        {found.length === 0 && <p className="party-empty">لا زبون برقم بهذا البحث.</p>}
      </div>
    </PartySheet>
  );
}
