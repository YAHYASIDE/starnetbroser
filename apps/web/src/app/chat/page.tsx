"use client";

import { useKeptState } from "@/lib/dataReload";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PartySheet } from "@/components/AccountsSection";
import { chatView, CHAT_LIVE_EVENT, loadUnsent, postChat } from "@/components/ChatRunner";
import { startCall } from "@/components/CallManager";
import { CALL_RECORDINGS_EVENT, loadRecordings, recordingKey, recordingsOf, saveRecordings, type CallRecording } from "@/lib/callRecordings";
import { callClock } from "@/lib/callSignal";
import { deleteChatMedia, getChatMedia } from "@/lib/chatMediaStore";
import { deleteProof, getProof } from "@/lib/paymentProofStore";
import { ChatImageEditor } from "@/components/ChatImageEditor";
import { ChatOpCard } from "@/components/ChatOpCard";
import { opStatusOf } from "@/lib/chatOps";
import { CHAT_FILTERS, CHAT_PREFS_EVENT, chatRows, EMPTY_PREFS, loadChatListPrefs, saveChatListPrefs, togglePref, type ChatFilter, type ChatListPrefs } from "@/lib/chatList";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { teamMemberName } from "@/components/TeamFlagSheet";
import {
  CHAT_EVENT,
  chatMediaKey,
  chatTime,
  dayLabel,
  deleteForMe,
  hasAudio,
  hasImage,
  isMine,
  isReadByOthers,
  loadChat,
  loadChatRead,
  loadChatSeen,
  markChatRead,
  messagesOf,
  MAX_CHAT_TEXT,
  messagePreview,
  nameHue,
  newChatMessage,
  readerId,
  replyOf,
  repIdOfConv,
  saveChat,
  unreadCount,
  visibleMessages,
  type ChatMessage,
  type ChatSeen,
  type ChatStore,
} from "@/lib/chat";
import { chatTargets, sendChatRead, type ChatTarget } from "@/lib/chatTransport";
import { loadClientStore } from "@/lib/clientStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { browserLinkStorage, loadLinkConfig, loadTeam } from "@/lib/deviceLink";
import { listRepresentatives, loadRepresentativeStore, type Representative } from "@/lib/repStore";
import { sendRepCopy } from "@/lib/repCopySend";
import { homeSearchHref } from "@/lib/homeActions";
import { loadRepCopy } from "@/lib/repCopy";
import { isRepWorkspace } from "@/lib/repMode";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { chatMediaOf, fullChatMessage } from "@/lib/chatMediaKeep";
import { buildRepChatStatement } from "@/lib/chatStatement";
import { chatDeviceChoices } from "@/lib/chatDevices";
import { saveChatMedia } from "@/lib/localBrowser";
import { pushAlertWatch } from "@/lib/alertWatchRun";

type Side = { rep: boolean; memberId: string };

function myName(side: Side): string {
  if (side.rep) return loadRepCopy()?.repName ?? "المندوب";
  const n = teamMemberName();
  return n === "أنا" ? "المسؤول" : n;
}

/** A message from this phone, in a conversation. */
function draft(target: ChatTarget, side: Side, fields: Omit<Parameters<typeof newChatMessage>[0], "conv" | "from" | "by" | "member">) {
  return newChatMessage({ conv: target.conv, from: side.rep ? "rep" : "owner", by: myName(side), member: side.rep ? undefined : side.memberId, ...fields });
}

/** The round picture: 👥 for the team, the rep's first letter. */
function avatarOf(target: Pick<ChatTarget, "conv" | "title">): string {
  if (target.conv === "team") return "👥";
  return target.title.replace(/^\S+\s/, "").trim().slice(0, 1) || "💬";
}

/**
 * 💬 الدردشة (his Nov 7 2026 ask; WhatsApp's look and gestures since Nov 8 2026 - lib/chat.ts): the conversations -
 * 👥 الفريق, 🤝 each rep (on the rep's phone: only his own) and 👤 الزبائن (their WhatsApp) -, then one conversation.
 */
export default function ChatPage() {
  const router = useRouter();
  const [rep, setRep] = useState(false);
  const [targets, setTargets] = useState<ChatTarget[]>([]);
  const [store, setStore] = useState<ChatStore>({});
  const [read, setRead] = useState<Record<string, number>>({});
  const [seen, setSeen] = useState<ChatSeen>({});
  const [unsent, setUnsent] = useState<string[]>([]);
  const [open, setOpen] = useKeptState<string | null>("chat.open", null);
  const [customers, setCustomers] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [live, setLive] = useState<Record<string, boolean>>({});
  // 👥 every rep (his Nov 8 2026 «لا يوجد فيه كل الفريق»): the ones without a channel yet wait for their new copy
  const [repsWaiting, setRepsWaiting] = useState<Representative[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [copyNote, setCopyNote] = useState<Record<string, string>>({});
  // 📌🔕🗄️ + filters + search (lib/chatList.ts)
  const [prefs, setPrefs] = useState<ChatListPrefs>(EMPTY_PREFS);
  const [filter, setFilter] = useKeptState<ChatFilter>("chat.filter", "all");
  const [query, setQuery] = useKeptState("chat.query", "");
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const itemPress = useRef<number | null>(null);

  useEffect(() => {
    const isRep = isRepWorkspace();
    if (!isRep) {
      const withChannel = new Set(chatTargets().map((t) => t.conv));
      setRepsWaiting(listRepresentatives(loadRepresentativeStore()).filter((r) => !withChannel.has(`rep:${r.id}`)));
      setMembers(loadTeam(browserLinkStorage()).map((m) => m.name).filter(Boolean));
    }
    setRep(isRep);
    setMemberId(loadLinkConfig(browserLinkStorage())?.memberId ?? "");
    const list = chatTargets();
    setTargets(list);
    if (isRep && list.length === 1) setOpen(list[0]!.conv);
    const reload = () => {
      setStore(loadChat());
      setRead(loadChatRead());
      setSeen(loadChatSeen());
      setUnsent(loadUnsent());
    };
    reload();
    const loadPrefs = () => setPrefs(loadChatListPrefs());
    loadPrefs();
    window.addEventListener(CHAT_PREFS_EVENT, loadPrefs);
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ conv: string; live: boolean }>).detail;
      setLive((cur) => ({ ...cur, [d.conv]: d.live }));
    };
    window.addEventListener(CHAT_EVENT, reload);
    window.addEventListener(CHAT_LIVE_EVENT, onLive);
    return () => {
      window.removeEventListener(CHAT_EVENT, reload);
      window.removeEventListener(CHAT_LIVE_EVENT, onLive);
      window.removeEventListener(CHAT_PREFS_EVENT, loadPrefs);
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
        targets={targets}
        store={store}
        seen={seen}
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
            ? "الدردشة وتنبيهاتك تحتاج نسخة جديدة من المسؤول: افتح آخر ملف نسخة أرسله لك في تيليغرام ← «فتح بـ STAR NET». إن لم يكن عندك، اطلب منه «📋 أرسل نسخته»."
            : "الدردشة تحتاج «🔗 ربط الأجهزة (الفريق)» في الإعدادات ← النسخ الاحتياطي (Firebase)."}
        </p>
      ) : (
        <>
        <div className="chat-tools">
          <input className="msg-input chat-search" type="search" placeholder="🔎 ابحث: اسم أو كلمة في الرسائل" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chat-filters" role="tablist">
            {CHAT_FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`chat-filter${filter === f.id ? " is-on" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="chat-list">
          {chatRows(
            targets.map((t) => {
              const list = visibleMessages(store, t.conv);
              return { conv: t.conv, title: t.title, lastAt: list.at(-1)?.at ?? 0, unread: unreadCount(store, t.conv, read, side), texts: list.map((m) => m.text).filter(Boolean) };
            }),
            prefs,
            filter,
            query,
          ).map((row) => {
            const t = targets.find((x) => x.conv === row.conv)!;
            const list = visibleMessages(store, t.conv);
            const last = list.at(-1);
            const count = row.unread;
            const mine = last ? isMine(last, side) : false;
            return (
              <li key={t.conv}>
                <button
                  type="button"
                  className="chat-list-item"
                  onClick={() => {
                    if (itemPress.current === -1) return;
                    setOpen(t.conv);
                  }}
                  onPointerDown={() => {
                    itemPress.current = window.setTimeout(() => {
                      itemPress.current = -1;
                      setItemMenu(t.conv);
                    }, 500);
                  }}
                  onPointerUp={() => {
                    if (itemPress.current && itemPress.current > 0) window.clearTimeout(itemPress.current);
                    window.setTimeout(() => (itemPress.current = null), 50);
                  }}
                  onPointerLeave={() => {
                    if (itemPress.current && itemPress.current > 0) window.clearTimeout(itemPress.current);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setItemMenu(t.conv);
                  }}
                >
                  <span className="chat-avatar" aria-hidden="true">
                    {avatarOf(t)}
                  </span>
                  <span className="chat-list-body">
                    <span className="chat-list-top">
                      <span className="chat-list-title">
                        {t.title}
                        {t.conv === "team" && members.length > 0 && <small className="chat-list-members"> · {members.join("، ")}</small>}
                      </span>
                      {last && <small className={`chat-list-time${count ? " is-unread" : ""}`}>{chatTime(last.at, Date.now())}</small>}
                    </span>
                    <span className="chat-list-bottom">
                      <span className="chat-list-last">
                        {row.hit ? (
                          <>🔎 {row.hit}</>
                        ) : last ? (
                          <>
                            {mine && <span className={`chat-ticks${isReadByOthers(last, seen, readerId(t.conv, side)) ? " is-read" : ""}`}>{unsent.includes(last.id) ? "⏳" : "✓✓"}</span>}
                            {!mine && t.conv === "team" ? `${last.by}: ` : ""}
                            {messagePreview(last)}
                          </>
                        ) : (
                          "لا رسائل بعد"
                        )}
                      </span>
                      <span className="chat-list-marks" aria-hidden="true">
                        {prefs.muted.includes(t.conv) && "🔕"}
                        {prefs.pinned.includes(t.conv) && "📌"}
                      </span>
                      {count > 0 && <span className={`chat-badge${prefs.muted.includes(t.conv) ? " is-muted" : ""}`}>{count}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {repsWaiting.map((r) => (
            <li key={r.id}>
              <div className="chat-list-item chat-list-waiting">
                <span className="chat-avatar" aria-hidden="true">
                  {r.name.trim().slice(0, 1)}
                </span>
                <span className="chat-list-body">
                  <span className="chat-list-top">
                    <span className="chat-list-title">🤝 {r.name}</span>
                  </span>
                  <span className="chat-list-bottom">
                    <span className="chat-list-last">{copyNote[r.id] ?? "تبدأ الدردشة بعد أن تصله نسخته الجديدة"}</span>
                    <button
                      type="button"
                      className="text-action"
                      onClick={async () => {
                        setCopyNote((c) => ({ ...c, [r.id]: "⏳ تُرسل نسخته…" }));
                        const res = await sendRepCopy(r, loadDemoAccounts(demoAccounts));
                        setCopyNote((c) => ({ ...c, [r.id]: res.ok ? "✓ وصلته نسخته - يفتحها فتظهر الدردشة هنا" : `لم تُرسل: ${res.message}` }));
                        if (res.ok) setTargets(chatTargets());
                      }}
                    >
                      📋 أرسل نسخته
                    </button>
                  </span>
                </span>
              </div>
            </li>
          ))}
          {!rep && (
            <li>
              <button type="button" className="chat-list-item" onClick={() => setCustomers(true)}>
                <span className="chat-avatar" aria-hidden="true">
                  👤
                </span>
                <span className="chat-list-body">
                  <span className="chat-list-top">
                    <span className="chat-list-title">👤 الزبائن</span>
                  </span>
                  <span className="chat-list-bottom">
                    <span className="chat-list-last">ليس عندهم التطبيق - المحادثة في واتساب</span>
                  </span>
                </span>
              </button>
            </li>
          )}
        </ul>
        </>
      )}

      {customers && <CustomersSheet onClose={() => setCustomers(false)} />}
      {itemMenu && (
        <PartySheet title={targets.find((t) => t.conv === itemMenu)?.title ?? "محادثة"} onClose={() => setItemMenu(null)}>
          <div className="msg-list">
            {(
              [
                ["pinned", prefs.pinned.includes(itemMenu) ? "📌 إلغاء التثبيت" : "📌 تثبيت في الأعلى"],
                ["muted", prefs.muted.includes(itemMenu) ? "🔔 إلغاء الكتم" : "🔕 كتم الإشعارات"],
                ["archived", prefs.archived.includes(itemMenu) ? "🗄️ إخراج من الأرشيف" : "🗄️ أرشفة"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="msg-item"
                onClick={() => {
                  saveChatListPrefs(togglePref(loadChatListPrefs(), kind, itemMenu));
                  if (kind === "muted") void pushAlertWatch();
                  setItemMenu(null);
                }}
              >
                <span className="msg-item-label">{label}</span>
              </button>
            ))}
          </div>
        </PartySheet>
      )}
    </main>
  );
}

const LONG_PRESS_MS = 450;
const SWIPE_PX = 60;

function Conversation({
  target,
  targets,
  store,
  seen,
  unsent,
  side,
  live,
  onBack,
  onOpenDevice,
}: {
  target: ChatTarget;
  targets: ChatTarget[];
  store: ChatStore;
  seen: ChatSeen;
  unsent: string[];
  side: Side;
  live: boolean | undefined;
  onBack: (() => void) | null;
  onOpenDevice: (name: string) => void;
}) {
  const [text, setText] = useKeptState(`chat.text.${target.conv}`, "");
  const [device, setDevice] = useState<{ id: string; name: string } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [picking, setPicking] = useState(false);
  const [pictures, setPictures] = useState<File[] | null>(null);
  const [viewer, setViewer] = useState<{ src: string; m: ChatMessage } | null>(null);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [recordings, setRecordings] = useState(false);
  const [recCount, setRecCount] = useState(0);
  const [statementSheet, setStatementSheet] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const repOfConv = repIdOfConv(target.conv);
  useEffect(() => {
    const count = () => setRecCount(recordingsOf(loadRecordings(), target.conv).length);
    count();
    window.addEventListener(CALL_RECORDINGS_EVENT, count);
    return () => window.removeEventListener(CALL_RECORDINGS_EVENT, count);
  }, [target.conv]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const press = useRef<{ id: string; x: number; y: number; timer: number; moved: boolean } | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const sentRead = useRef(0);
  const messages = visibleMessages(store, target.conv);
  // 💳 the rep's answers to the cards are hidden messages - the cards read them here
  const allMessages = useMemo(() => messagesOf(store, target.conv), [store, target.conv]);
  const lastAt = messages.at(-1)?.at ?? 0;
  const me = readerId(target.conv, side);

  // a conversation takes the whole screen (the bottom bar hides, as in WhatsApp)
  useEffect(() => {
    document.documentElement.classList.add("chat-open");
    return () => document.documentElement.classList.remove("chat-open");
  }, []);

  useEffect(() => {
    if (lastAt) markChatRead(target.conv, lastAt);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    // ✓✓ tell the others what I read (once per new message, while the page is in front)
    if (lastAt > sentRead.current && document.visibilityState === "visible") {
      sentRead.current = lastAt;
      const t = window.setTimeout(() => void sendChatRead(target, me, lastAt), 1200);
      return () => window.clearTimeout(t);
    }
  }, [lastAt, target, me]);

  async function post(message: ChatMessage | null, to: ChatTarget = target) {
    if (!message) return;
    const ok = await postChat(to, message);
    setNote(ok ? null : "⏳ لم تُرسل بعد - تُرسل وحدها حين يتصل الإنترنت");
  }

  function flashNote(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 2500);
  }

  /** 🧾 The operator sends the rep his statement (a summary + a PDF); the rep asks for it. */
  async function statement() {
    if (!repOfConv || statementBusy) return;
    setStatementBusy(true);
    try {
      if (side.rep) {
        await post(draft(target, side, { text: "", statementAsk: true }));
        flashNote("🧾 طُلب كشفك - يصلك هنا");
        return;
      }
      setNote("⏳ يجهّز الكشف…");
      const built = await buildRepChatStatement(repOfConv);
      if (!built) return flashNote("⚠️ تعذّر تجهيز الكشف");
      await post(draft(target, side, { text: built.text, file: built.file }));
    } finally {
      setStatementBusy(false);
      setStatementSheet(false);
    }
  }

  /** ⬇️ A picture → the gallery, a voice → music, a file → downloads (`open`: shown too). */
  async function saveOf(m: ChatMessage, open = false) {
    const media = await chatMediaOf(m);
    const stamp = new Date(m.at).toISOString().slice(0, 19).replace(/[-:T]/g, "");
    if (m.file && media?.file) return flashNote(await saveChatMedia(media.file, m.file.name, open));
    if (media?.image) return flashNote(await saveChatMedia(media.image, `STARNET-${stamp}.jpg`, open));
    if (media?.audio) {
      const ext = /audio\/(mp4|aac)/.test(media.audio) ? "m4a" : /audio\/ogg/.test(media.audio) ? "ogg" : /audio\/mpeg/.test(media.audio) ? "mp3" : "webm";
      return flashNote(await saveChatMedia(media.audio, `STARNET-${stamp}.${ext}`, open));
    }
    flashNote("⚠️ لم يعد محفوظًا في هذا الهاتف");
  }

  async function sendText(voice?: { audio: string; seconds: number }) {
    const reply = replyTo ? replyOf(replyTo) : null;
    const message = draft(target, side, voice ? { text: "", audio: voice.audio, seconds: voice.seconds, reply } : { text, device, reply });
    if (!message) return;
    if (!voice) {
      setText("");
      setDevice(null);
    }
    setReplyTo(null);
    await post(message);
  }

  async function sendPictures(list: { image: string; caption: string }[]) {
    setPictures(null);
    const reply = replyTo ? replyOf(replyTo) : null;
    setReplyTo(null);
    for (const [i, p] of list.entries()) await post(draft(target, side, { text: p.caption, image: p.image, ...(i === 0 && reply ? { reply } : {}) }));
  }

  function jumpTo(id: string) {
    const el = listRef.current?.querySelector(`[data-msg="${id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1400);
  }

  // ⏱ hold = the menu; ↔ drag = reply (WhatsApp's swipe)
  function pressStart(m: ChatMessage, e: React.PointerEvent) {
    if (m.deleted) return;
    const timer = window.setTimeout(() => {
      if (press.current && !press.current.moved) {
        navigator.vibrate?.(20);
        setMenu(m);
      }
      press.current = null;
    }, LONG_PRESS_MS);
    press.current = { id: m.id, x: e.clientX, y: e.clientY, timer, moved: false };
  }

  function pressMove(m: ChatMessage, e: React.PointerEvent) {
    const p = press.current;
    if (!p || p.id !== m.id) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      p.moved = true;
      window.clearTimeout(p.timer);
    }
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) setSwipe({ id: m.id, dx: Math.max(-90, Math.min(90, dx)) });
  }

  function pressEnd(m: ChatMessage) {
    const p = press.current;
    if (p) window.clearTimeout(p.timer);
    press.current = null;
    if (swipe && swipe.id === m.id && Math.abs(swipe.dx) >= SWIPE_PX) {
      setReplyTo(m);
      inputRef.current?.focus();
    }
    setSwipe(null);
  }

  async function act(action: "reply" | "copy" | "forward" | "deleteMe" | "deleteAll" | "save") {
    const m = menu;
    setMenu(null);
    if (!m) return;
    if (action === "reply") {
      setReplyTo(m);
      inputRef.current?.focus();
    } else if (action === "copy") {
      await navigator.clipboard?.writeText(m.text || messagePreview(m)).catch(() => undefined);
      setNote("📋 نُسخ النص");
      window.setTimeout(() => setNote(null), 1500);
    } else if (action === "forward") {
      setForwarding(m);
    } else if (action === "save") {
      await saveOf(m);
    } else if (action === "deleteMe") {
      saveChat(deleteForMe(loadChat(), m.id));
      void deleteChatMedia(chatMediaKey(m.id));
    } else if (action === "deleteAll") {
      await post(draft(target, side, { text: "", deleteOf: m.id }));
    }
  }

  async function forwardTo(to: ChatTarget) {
    const one = forwarding;
    setForwarding(null);
    if (!one) return;
    const m = await fullChatMessage(one);
    const sideTo = { rep: side.rep, memberId: side.memberId };
    await post(
      newChatMessage({
        conv: to.conv,
        from: sideTo.rep ? "rep" : "owner",
        by: myName(sideTo),
        member: sideTo.rep ? undefined : sideTo.memberId,
        text: m.call ? "" : m.text,
        image: m.image,
        device: m.device,
        audio: m.audio,
        seconds: m.seconds,
        file: m.file?.data ? { name: m.file.name, data: m.file.data } : null,
        forwarded: true,
      }),
      to,
    );
    setNote(`↪️ أُعيد توجيهها إلى ${to.title}`);
    window.setTimeout(() => setNote(null), 1800);
  }

  const now = Date.now();
  let lastDay = "";
  return (
    <main className="home chat-page chat-conversation">
      <div className="chat-head">
        {onBack ? (
          <button type="button" className="chat-back" onClick={onBack} aria-label="المحادثات">
            →
          </button>
        ) : (
          <Link href="/" className="chat-back" aria-label="رجوع">
            →
          </Link>
        )}
        <span className="chat-avatar chat-avatar-sm" aria-hidden="true">
          {avatarOf(target)}
        </span>
        <span className="chat-head-text">
          <strong>{target.title}</strong>
          <small className={live === false ? "is-off" : ""}>{live === false ? "غير متصل الآن" : "مباشر"}</small>
        </span>
        {recCount > 0 && (
          <button type="button" className="chat-call" onClick={() => setRecordings(true)} aria-label="تسجيلات المكالمات">
            🎙️
          </button>
        )}
        {repOfConv && (
          <button type="button" className="chat-call" onClick={() => setStatementSheet(true)} aria-label={side.rep ? "اطلب كشف حسابك" : "أرسل كشف حسابه"}>
            🧾
          </button>
        )}
        <button type="button" className="chat-call" onClick={() => startCall(target.conv)} aria-label="مكالمة صوتية">
          📞
        </button>
      </div>
      {statementSheet && (
        <PartySheet title={side.rep ? "🧾 كشف حسابي" : `🧾 كشف ${target.title.replace(/^\S+\s/, "")}`} onClose={() => setStatementSheet(false)}>
          <p className="settings-hint">
            {side.rep ? "يصل طلبك للمسؤول، ويرسل لك كشفك هنا: ملخص الأرصدة + ملف PDF." : "يُرسل له هنا: ملخص كل حساب والباقي بعد خصم ربحه وبعد خصم كل شيء، ومعه ملف PDF بالعمليات."}
          </p>
          <button type="button" className="dialog-primary" disabled={statementBusy} onClick={() => void statement()}>
            {statementBusy ? "⏳ يجهّز…" : side.rep ? "🧾 اطلب كشفي" : "🧾 أرسل كشفه الآن"}
          </button>
        </PartySheet>
      )}
      {recordings && <RecordingsSheet conv={target.conv} onClose={() => setRecordings(false)} />}
      <div className="chat-messages chat-wallpaper" ref={listRef}>
        {messages.length === 0 && <p className="chat-day">لا رسائل بعد - اكتب أول رسالة.</p>}
        {messages.map((m) => {
          const mine = isMine(m, side);
          const day = dayLabel(m.at, now);
          const showDay = day !== lastDay;
          lastDay = day;
          const dx = swipe && swipe.id === m.id ? swipe.dx : 0;
          return (
            <div key={m.id} className="chat-row-wrap">
              {showDay && <p className="chat-day">{day}</p>}
              <div
                data-msg={m.id}
                className={`chat-bubble${mine ? " is-mine" : ""}${m.deleted ? " is-deleted" : ""}${flash === m.id ? " is-flash" : ""}`}
                style={dx ? { transform: `translateX(${dx}px)` } : undefined}
                onPointerDown={(e) => pressStart(m, e)}
                onPointerMove={(e) => pressMove(m, e)}
                onPointerUp={() => pressEnd(m)}
                onPointerCancel={() => pressEnd(m)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!m.deleted) setMenu(m);
                }}
              >
                {!mine && target.conv === "team" && (
                  <strong className="chat-by" style={{ color: `hsl(${nameHue(m.by)} 70% 55%)` }}>
                    {m.by}
                  </strong>
                )}
                {m.forwarded && <small className="chat-forwarded">↪️ مُعاد توجيهها</small>}
                {m.reply && (
                  <button type="button" className="chat-quote" onClick={() => jumpTo(m.reply!.id)}>
                    <strong style={{ color: `hsl(${nameHue(m.reply.by)} 70% 55%)` }}>{m.reply.by}</strong>
                    <span>{m.reply.preview}</span>
                  </button>
                )}
                {hasImage(m) && <ChatImage m={m} onOpen={(src) => setViewer({ src, m })} />}
                {m.file && (
                  <button type="button" className="chat-file" onClick={() => void saveOf(m, true)}>
                    <span className="chat-file-icon" aria-hidden="true">
                      📄
                    </span>
                    <span className="chat-file-text">
                      <strong>{m.file.name}</strong>
                      <small>
                        PDF · <bdi dir="ltr">{Math.max(1, Math.round(m.file.size / 1024))} KB</bdi> · اضغط للفتح
                      </small>
                    </span>
                  </button>
                )}
                {m.device && (
                  <button type="button" className="chat-device" onClick={() => onOpenDevice(m.device!.name)}>
                    📡 {m.device.name}
                  </button>
                )}
                {hasAudio(m) && <ChatVoice m={m} />}
                {m.mediaGone && <small className="chat-forwarded">🗑️ الصورة / التسجيل لم يعد محفوظًا في هذا الهاتف</small>}
                {m.op && !m.deleted && (
                  <ChatOpCard op={m.op} status={opStatusOf(allMessages, m.op.token)} rep={side.rep} onRate={(verdict, note) => void post(draft(target, side, { text: "", opRate: { token: m.op!.token, verdict, ...(note ? { note } : {}) } }))} />
                )}
                {m.deleted ? <p className="chat-text chat-text-deleted">🚫 حُذفت هذه الرسالة</p> : m.text && !m.op && <p className={`chat-text${m.call ? " chat-call-line" : ""}`}>{m.text}</p>}
                {m.statementAsk && !side.rep && !m.deleted && (
                  <button type="button" className="chat-device" disabled={statementBusy} onClick={() => void statement()}>
                    {statementBusy ? "⏳ يجهّز…" : "🧾 أرسل كشفه"}
                  </button>
                )}
                <small className="chat-meta">
                  {m.seconds ? `🎤 ${m.seconds} ث · ` : ""}
                  <bdi dir="ltr">{chatTime(m.at, now).replace(/^.* /, "")}</bdi>
                  {mine && !m.deleted && (
                    <span className={`chat-ticks${!unsent.includes(m.id) && isReadByOthers(m, seen, me) ? " is-read" : ""}`}>
                      {unsent.includes(m.id) ? " ⏳" : isReadByOthers(m, seen, me) ? " ✓✓" : " ✓"}
                    </span>
                  )}
                </small>
              </div>
            </div>
          );
        })}
      </div>
      {note && <p className="chat-note">{note}</p>}
      {(replyTo || device) && (
        <div className="chat-attached">
          {replyTo && (
            <span className="chat-reply-bar">
              <span className="chat-quote chat-quote-static">
                <strong style={{ color: `hsl(${nameHue(replyTo.by)} 70% 55%)` }}>↩️ {replyTo.by}</strong>
                <span>{messagePreview(replyTo)}</span>
              </span>
              <button type="button" className="text-action" onClick={() => setReplyTo(null)} aria-label="إلغاء الرد">
                ✕
              </button>
            </span>
          )}
          {device && (
            <span className="chat-attached-item">
              📡 {device.name}{" "}
              <button type="button" className="text-action" onClick={() => setDevice(null)} aria-label="إزالة الجهاز">
                ✕
              </button>
            </span>
          )}
        </div>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void sendText();
        }}
      >
        {!recording && (
          <div className="chat-field">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              maxLength={MAX_CHAT_TEXT}
              placeholder="اكتب رسالة…"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
              }}
            />
            <button type="button" className="chat-field-tool" onClick={() => setPicking(true)} aria-label="إرفاق جهاز">
              📡
            </button>
            <button type="button" className="chat-field-tool" onClick={() => fileRef.current?.click()} aria-label="صور من المعرض">
              🖼️
            </button>
            <button type="button" className="chat-field-tool" onClick={() => cameraRef.current?.click()} aria-label="صورة بالكاميرا">
              📷
            </button>
          </div>
        )}
        {!text.trim() && !device ? (
          <VoiceRecorder onState={setRecording} onRecorded={(audio, seconds) => void sendText({ audio, seconds })} onError={setNote} />
        ) : (
          <button type="submit" className="chat-send" aria-label="إرسال">
            ➤
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (list.length) setPictures(list);
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (list.length) setPictures(list);
          }}
        />
      </form>
      {pictures && <ChatImageEditor files={pictures} onSend={(list) => void sendPictures(list)} onClose={() => setPictures(null)} />}
      {picking && (
        <DevicePicker
          repId={side.rep ? null : repOfConv}
          onPick={(d) => {
            setDevice(d);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {menu && (
        <PartySheet title={messagePreview(menu).slice(0, 40) || "رسالة"} onClose={() => setMenu(null)}>
          <div className="msg-list">
            <button type="button" className="msg-item" onClick={() => void act("reply")}>
              <span className="msg-item-label">↩️ رد</span>
            </button>
            {menu.text && (
              <button type="button" className="msg-item" onClick={() => void act("copy")}>
                <span className="msg-item-label">📋 نسخ</span>
              </button>
            )}
            {(hasImage(menu) || hasAudio(menu) || menu.file) && !menu.deleted && (
              <button type="button" className="msg-item" onClick={() => void act("save")}>
                <span className="msg-item-label">⬇️ حفظ في الهاتف{hasImage(menu) ? " (المعرض)" : ""}</span>
              </button>
            )}
            {!menu.call && !menu.op && targets.length > 1 && (
              <button type="button" className="msg-item" onClick={() => void act("forward")}>
                <span className="msg-item-label">↪️ إعادة توجيه</span>
              </button>
            )}
            <button type="button" className="msg-item" onClick={() => void act("deleteMe")}>
              <span className="msg-item-label">🗑️ حذف عندي</span>
            </button>
            {isMine(menu, side) && !menu.op && (
              <button type="button" className="msg-item msg-item-bad" onClick={() => void act("deleteAll")}>
                <span className="msg-item-label">🗑️ حذف عند الجميع</span>
              </button>
            )}
          </div>
        </PartySheet>
      )}
      {forwarding && (
        <PartySheet title="↪️ إعادة توجيه إلى…" onClose={() => setForwarding(null)}>
          <div className="msg-list">
            {targets
              .filter((t) => t.conv !== target.conv)
              .map((t) => (
                <button key={t.conv} type="button" className="msg-item" onClick={() => void forwardTo(t)}>
                  <span className="msg-item-label">{t.title}</span>
                </button>
              ))}
          </div>
        </PartySheet>
      )}
      {viewer && (
        <div className="rep-receipt-viewer" role="dialog" aria-label="الصورة" onClick={() => setViewer(null)}>
          <button type="button" className="rep-receipt-close" aria-label="إغلاق" onClick={() => setViewer(null)}>
            ✕
          </button>
          <img src={viewer.src} alt="الصورة" onClick={(e) => e.stopPropagation()} />
          <button
            type="button"
            className="chat-viewer-save"
            onClick={(e) => {
              e.stopPropagation();
              void saveOf(viewer.m);
            }}
          >
            ⬇️ حفظ في المعرض
          </button>
        </div>
      )}
    </main>
  );
}

/** 📡 Attach a device: in a rep's conversation only his devices; by its name, the customer's name, email or KIT. */
function DevicePicker({ repId, onPick, onClose }: { repId: string | null; onPick: (d: { id: string; name: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const devices = useMemo(() => loadDemoAccounts(demoAccounts), []);
  const clients = useMemo(() => loadClientStore(), []);
  const found = useMemo(() => chatDeviceChoices(devices, (id) => clients[id]?.name, q, repId), [devices, clients, q, repId]);
  return (
    <PartySheet title="📡 أرفق جهازًا" onClose={onClose}>
      <input className="msg-input" placeholder="ابحث: الجهاز، الزبون، الإيميل، KIT" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="msg-list chat-picker">
        {found.map((a) => (
          <button key={a.id} type="button" className="msg-item" onClick={() => onPick({ id: a.id, name: a.name })}>
            <span className="msg-item-label">{a.name}</span>
            {a.hint && <small className="msg-item-hint">{a.hint}</small>}
          </button>
        ))}
        {found.length === 0 && <p className="party-empty">{q.trim() ? "لا جهاز بهذا البحث." : "لا أجهزة."}</p>}
      </div>
    </PartySheet>
  );
}

/** 📷 A picture: inline, else from the chat media store (it shows once read). */
function ChatImage({ m, onOpen }: { m: ChatMessage; onOpen: (src: string) => void }) {
  const src = useMedia(m, "image");
  if (src === null) return <small className="chat-forwarded">📷 الصورة غير موجودة في هذا الهاتف</small>;
  return (
    <button type="button" className="chat-image" onClick={() => src && onOpen(src)} aria-label="عرض الصورة">
      {src ? <img src={src} alt="صورة" /> : <span className="chat-image-wait">📷</span>}
    </button>
  );
}

/** 🎤 A voice message. */
function ChatVoice({ m }: { m: ChatMessage }) {
  const src = useMedia(m, "audio");
  if (src === null) return <small className="chat-forwarded">🎤 التسجيل غير موجود في هذا الهاتف</small>;
  return <span className="chat-voice">{src ? <audio className="chat-audio" controls preload="none" src={src} /> : <span className="chat-audio">🎤 …</span>}</span>;
}

/** The message's picture / voice: undefined while it loads, null when this phone hasn't got it. */
function useMedia(m: ChatMessage, kind: "image" | "audio"): string | null | undefined {
  const inline = m[kind];
  const [src, setSrc] = useState<string | null | undefined>(inline);
  useEffect(() => {
    if (inline) return setSrc(inline);
    let live = true;
    void chatMediaOf(m).then((p) => live && setSrc(p?.[kind] ?? null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, inline, m.stored?.join()]);
  return src;
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

/** 🎙️ This conversation's call recordings - kept on this phone only. */
function RecordingsSheet({ conv, onClose }: { conv: string; onClose: () => void }) {
  const [list, setList] = useState<CallRecording[]>(() => recordingsOf(loadRecordings(), conv));
  const [sound, setSound] = useState<Record<string, string | null>>({});
  const play = async (id: string) => {
    const url = (await getChatMedia(recordingKey(id))) ?? (await getProof(recordingKey(id))); // the first ones went to the proofs
    setSound((s) => ({ ...s, [id]: url ?? null }));
  };
  const remove = async (id: string) => {
    await deleteChatMedia(recordingKey(id));
    await deleteProof(recordingKey(id));
    saveRecordings(loadRecordings().filter((r) => r.id !== id));
    setList((l) => l.filter((r) => r.id !== id));
  };
  return (
    <PartySheet title="🎙️ تسجيلات المكالمات" onClose={onClose}>
      <p className="settings-hint">محفوظة على هذا الهاتف فقط - لا يُحذف منها شيء إلا بيدك.</p>
      {list.length === 0 && <p className="settings-hint">لا تسجيلات.</p>}
      <ul className="call-rec-list">
        {list.map((r) => (
          <li key={r.id} className="call-rec-item">
            <span className="call-rec-head">
              <strong>{r.peer}</strong>
              <small>
                {chatTime(r.at, Date.now())} · <bdi dir="ltr">{callClock(r.seconds * 1000)}</bdi>
              </small>
            </span>
            {sound[r.id] === undefined ? (
              <button type="button" className="text-action" onClick={() => void play(r.id)}>
                ▶ استمع
              </button>
            ) : sound[r.id] === null ? (
              <small className="settings-hint">الصوت لم يعد موجودًا</small>
            ) : (
              <audio className="chat-audio" controls autoPlay src={sound[r.id]!} />
            )}
            <button type="button" className="text-action" onClick={() => void remove(r.id)}>
              🗑️ حذف
            </button>
          </li>
        ))}
      </ul>
    </PartySheet>
  );
}
