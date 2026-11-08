"use client";

import { useEffect, useRef, useState } from "react";
import { newChatMessage } from "@/lib/chat";
import { chatTargets, firestoreFor, type ChatTarget } from "@/lib/chatTransport";
import { CALL_INCOMING_EVENT, callClock, callDocPath, CONNECT_MS, endWords, ICE_GATHER_MS, ICE_SERVERS, isCallState, RING_MS, type CallState } from "@/lib/callSignal";
import { addRecording, loadRecordings, recordingKey, RECORDING_STARTED_TEXT, saveRecordings } from "@/lib/callRecordings";
import { openText, sealText, type Sealed } from "@/lib/deviceSyncCrypto";
import { updateDocumentFields, writeDocument } from "@/lib/firestoreRest";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
import { callAudio, ringCall, stopCallRing } from "@/lib/localBrowser";
import { deleteProof, putProof } from "@/lib/paymentProofStore";
import { loadRepCopy } from "@/lib/repCopy";
import { isRepWorkspace } from "@/lib/repMode";
import { postChat } from "./ChatRunner";
import { teamMemberName } from "./TeamFlagSheet";

export const CALL_START_EVENT = "starnet:call-start";

/** 📞 Calls the conversation (from its 📞 button). */
export function startCall(conv: string): void {
  window.dispatchEvent(new CustomEvent(CALL_START_EVENT, { detail: { conv } }));
}

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function myName(): string {
  if (isRepWorkspace()) return loadRepCopy()?.repName ?? "المندوب";
  const n = teamMemberName();
  return n === "أنا" ? "المسؤول" : n;
}

function myMessage(target: ChatTarget, fields: { text: string; call?: { id: string } }) {
  return newChatMessage({ conv: target.conv, from: isRepWorkspace() ? "rep" : "owner", by: myName(), member: isRepWorkspace() ? undefined : loadLinkConfig(browserLinkStorage())?.memberId, ...fields });
}

/** Waits for the phone's addresses (non-trickle: the whole description goes at once). */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    window.setTimeout(done, ICE_GATHER_MS);
  });
}

/** 🔔 A ring in the app itself (when the phone's own ringtone isn't there: the laptop, the browser). */
function beepRing(): () => void {
  let ctx: AudioContext | null = null;
  let timer: number | null = null;
  try {
    ctx = new AudioContext();
    const beep = () => {
      if (!ctx) return;
      for (const [start, freq] of [
        [0, 440],
        [0.45, 480],
      ] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.4);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + 0.42);
      }
    };
    beep();
    timer = window.setInterval(beep, 2000);
  } catch {
    // no sound here
  }
  return () => {
    if (timer) window.clearInterval(timer);
    void ctx?.close().catch(() => undefined);
  };
}

/**
 * 📞 The voice call on every page (lib/callSignal.ts). Since his Nov 8 2026 report: a card at the TOP, not the whole
 * screen («مثل واتساب»), which folds into a thin bar (tap = back); the phone rings with its ringtone and vibrates
 * (CallRinger); 🔊 مكبّر / 🎧 سماعة; ⏺ تسجيل (both voices, kept on this phone - the other side is told); and a small line
 * saying where the connection is, so a call that doesn't connect says why.
 */
export function CallManager() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState("");
  const [note, setNote] = useState("");
  const [diag, setDiag] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [small, setSmall] = useState(false);
  const [recording, setRecording] = useState(false);
  const [since, setSince] = useState(0);
  const [, tick] = useState(0);
  const call = useRef<{ target: ChatTarget; id: string; mine: boolean } | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remote = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const unsub = useRef<(() => void) | null>(null);
  const timers = useRef<number[]>([]);
  const stopBeep = useRef<(() => void) | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; ctx: AudioContext; at: number } | null>(null);
  const handled = useRef<Set<string>>(new Set());
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function silence() {
    stopBeep.current?.();
    stopBeep.current = null;
    void stopCallRing();
    navigator.vibrate?.(0);
  }

  function cleanup() {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    silence();
    stopRecording();
    unsub.current?.();
    unsub.current = null;
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    remote.current = null;
    if (audio.current) audio.current.srcObject = null;
    void callAudio(false, false);
  }

  function finish(reason: Parameters<typeof endWords>[0], tell?: CallState) {
    const c = call.current;
    if (c && tell) void updateDocumentFields(c.target.firebase, callDocPath(c.target.spaceId, c.id), { state: tell });
    cleanup();
    setNote(endWords(reason));
    setSmall(false);
    setPhase("ended");
    later(() => {
      if (phaseRef.current === "ended") {
        setPhase("idle");
        call.current = null;
      }
    }, 3500);
  }

  /** The other phone's voice: an element started on the tap (so it may play), fed when the voice arrives. */
  function prepareAudio(): MediaStream {
    const stream = new MediaStream();
    remote.current = stream;
    if (!audio.current) {
      audio.current = document.createElement("audio");
      audio.current.autoplay = true;
      audio.current.setAttribute("playsinline", "");
      document.body.appendChild(audio.current);
    }
    audio.current.srcObject = stream;
    void audio.current.play().catch(() => undefined);
    return stream;
  }

  async function connection(stream: MediaStream): Promise<RTCPeerConnection | null> {
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      finish("nomic", call.current?.mine ? "missed" : "declined");
      return null;
    }
    const p = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    for (const t of local.current.getTracks()) p.addTrack(t, local.current);
    p.ontrack = (e) => {
      if (e.track) stream.addTrack(e.track);
      void audio.current?.play().catch(() => undefined);
    };
    p.oniceconnectionstatechange = () => setDiag(`الشبكة: ${p.iceConnectionState}`);
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") {
        setSince(Date.now());
        setDiag("");
        setPhase("active");
        void callAudio(true, speaker);
      } else if (p.connectionState === "failed") {
        finish("failed", "ended");
      } else if (p.connectionState === "disconnected" && phaseRef.current === "active") {
        setDiag("⚠️ الاتصال ضعيف…");
        later(() => p.connectionState === "disconnected" && finish("ended", "ended"), 8000);
      }
    };
    pc.current = p;
    void callAudio(true, speaker);
    return p;
  }

  /** Follows the call's document: the answer (caller), or the call ending / answered elsewhere (callee). */
  async function follow() {
    const c = call.current;
    if (!c) return;
    try {
      const { db, fs } = await firestoreFor(c.target.firebase);
      unsub.current = fs.onSnapshot(fs.doc(db, "starnet", c.target.spaceId, "calls", c.id), (snap) => {
        const d = snap.data() as { state?: string; answer?: string } | undefined;
        if (!d || !isCallState(d.state) || call.current?.id !== c.id) return;
        if (c.mine) {
          if (d.state === "answered" && d.answer && phaseRef.current === "outgoing") {
            setPhase("connecting");
            setDiag("رد - يوصل الصوت…");
            void openText(JSON.parse(d.answer) as Sealed, c.target.key)
              .then((sdp) => pc.current?.setRemoteDescription(JSON.parse(sdp) as RTCSessionDescriptionInit))
              .catch(() => finish("failed", "ended"));
            later(() => phaseRef.current === "connecting" && finish("failed", "ended"), CONNECT_MS);
          } else if (d.state === "declined") finish("declined");
          else if (d.state === "ended" && phaseRef.current !== "ended") finish("ended");
        } else {
          if (d.state === "answered" && phaseRef.current === "incoming") finish("elsewhere");
          else if ((d.state === "ended" || d.state === "missed") && phaseRef.current !== "ended") finish(d.state === "missed" ? "missed" : "ended");
        }
      });
    } catch {
      finish("offline");
    }
  }

  async function outgoing(target: ChatTarget) {
    if (phaseRef.current !== "idle" && phaseRef.current !== "ended") return;
    cleanup();
    call.current = { target, id: randomHex(), mine: true };
    setPeer(target.title);
    setNote("");
    setDiag("يجهّز المكالمة…");
    setMuted(false);
    setSmall(false);
    setPhase("outgoing");
    const p = await connection(prepareAudio());
    if (!p || !call.current) return;
    try {
      await p.setLocalDescription(await p.createOffer({ offerToReceiveAudio: true }));
      await gathered(p);
      const sealed = await sealText(JSON.stringify(p.localDescription), target.key);
      const w = await writeDocument(target.firebase, callDocPath(target.spaceId, call.current.id), { state: "ringing", offer: JSON.stringify(sealed), at: String(Date.now()) });
      if (!w.ok) return finish("offline");
      const message = myMessage(target, { text: "", call: { id: call.current.id } });
      if (message) void postChat(target, message);
      setDiag("يرنّ عنده…");
      await follow();
      later(() => phaseRef.current === "outgoing" && finish("missed", "missed"), RING_MS);
    } catch {
      finish("failed", "ended");
    }
  }

  async function incoming(conv: string, id: string, by: string) {
    if (handled.current.has(id)) return;
    if (phaseRef.current !== "idle" && phaseRef.current !== "ended") return;
    const target = chatTargets().find((t) => t.conv === conv);
    if (!target) return;
    handled.current.add(id);
    // still ringing? (a call already answered / ended / missed never rings again - e.g. on opening the app)
    try {
      const { db, fs } = await firestoreFor(target.firebase);
      const d = (await fs.getDoc(fs.doc(db, "starnet", target.spaceId, "calls", id))).data() as { state?: string } | undefined;
      if (d && d.state !== "ringing") return;
    } catch {
      // couldn't check (a weak network): ring anyway - a missed real call is worse than a stale ring
    }
    cleanup();
    call.current = { target, id, mine: false };
    setPeer(by || target.title);
    setNote("");
    setDiag("");
    setMuted(false);
    setSmall(false);
    setPhase("incoming");
    // 🔔 the phone's ringtone + vibration + call notification; elsewhere a ring in the app
    void ringCall(`📞 ${by || target.title} يتصل بك`, "مكالمة صوتية - اضغط للرد").then((native) => {
      if (!native && phaseRef.current === "incoming") stopBeep.current = beepRing();
    });
    await follow();
    later(() => phaseRef.current === "incoming" && finish("missed"), RING_MS);
  }

  async function answer() {
    const c = call.current;
    if (!c) return;
    silence();
    setPhase("connecting");
    setDiag("يرد…");
    const p = await connection(prepareAudio());
    if (!p) return;
    try {
      const { db, fs } = await firestoreFor(c.target.firebase);
      const d = (await fs.getDoc(fs.doc(db, "starnet", c.target.spaceId, "calls", c.id))).data() as { state?: string; offer?: string } | undefined;
      if (!d?.offer || d.state !== "ringing") return finish(d?.state === "answered" ? "elsewhere" : "ended");
      await p.setRemoteDescription(JSON.parse(await openText(JSON.parse(d.offer) as Sealed, c.target.key)) as RTCSessionDescriptionInit);
      await p.setLocalDescription(await p.createAnswer());
      await gathered(p);
      const sealed = await sealText(JSON.stringify(p.localDescription), c.target.key);
      const w = await updateDocumentFields(c.target.firebase, callDocPath(c.target.spaceId, c.id), { state: "answered", answer: JSON.stringify(sealed) });
      if (!w.ok) return finish("offline");
      setDiag("يوصل الصوت…");
      later(() => phaseRef.current === "connecting" && finish("failed", "ended"), CONNECT_MS);
    } catch {
      finish("failed", "ended");
    }
  }

  // ⏺ both voices into one recording, kept on this phone; the other side is told in the conversation
  function startRecording() {
    const c = call.current;
    if (!c || !local.current || !remote.current || recorder.current || typeof MediaRecorder === "undefined") return;
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(local.current).connect(dest);
      if (remote.current.getAudioTracks().length) ctx.createMediaStreamSource(remote.current).connect(dest);
      const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const at = Date.now();
      const id = c.id;
      const conv = c.target.conv;
      const who = peer;
      rec.onstop = () => {
        void ctx.close().catch(() => undefined);
        if (chunks.length === 0) return;
        const reader = new FileReader();
        reader.onload = async () => {
          if (!(await putProof(recordingKey(id), String(reader.result)))) return;
          const { list, dropped } = addRecording(loadRecordings(), { id, conv, peer: who, at, seconds: Math.max(1, Math.round((Date.now() - at) / 1000)) });
          saveRecordings(list);
          for (const old of dropped) void deleteProof(recordingKey(old));
        };
        reader.readAsDataURL(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }));
      };
      rec.start(1000);
      recorder.current = { rec, chunks, ctx, at };
      setRecording(true);
      const message = myMessage(c.target, { text: RECORDING_STARTED_TEXT });
      if (message) void postChat(c.target, message);
    } catch {
      setDiag("تعذّر بدء التسجيل على هذا الهاتف");
    }
  }

  function stopRecording() {
    const r = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (r && r.rec.state !== "inactive") r.rec.stop();
  }

  useEffect(() => {
    const onStart = (e: Event) => {
      const conv = (e as CustomEvent<{ conv: string }>).detail.conv;
      const target = chatTargets().find((t) => t.conv === conv);
      if (target) void outgoing(target);
    };
    const onIncoming = (e: Event) => {
      const d = (e as CustomEvent<{ conv: string; id: string; by: string }>).detail;
      void incoming(d.conv, d.id, d.by);
    };
    window.addEventListener(CALL_START_EVENT, onStart);
    window.addEventListener(CALL_INCOMING_EVENT, onIncoming);
    const clock = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      window.removeEventListener(CALL_START_EVENT, onStart);
      window.removeEventListener(CALL_INCOMING_EVENT, onIncoming);
      window.clearInterval(clock);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") return null;
  const status =
    phase === "outgoing" ? "📞 يتصل…" : phase === "incoming" ? "📞 مكالمة صوتية واردة" : phase === "connecting" ? "⏳ يوصل…" : phase === "active" ? callClock(Date.now() - since) : note;
  const live = phase === "connecting" || phase === "active";

  if (small && phase !== "incoming" && phase !== "ended") {
    return (
      <div className="call-bar" role="status">
        <button type="button" className="call-bar-main" onClick={() => setSmall(false)}>
          📞 {peer} · {phase === "active" ? <bdi dir="ltr">{status}</bdi> : status}
          {recording && <span className="call-rec-dot"> ⏺</span>}
          <small> - اضغط للعودة</small>
        </button>
        <button type="button" className="call-bar-end" onClick={() => finish("ended", phase === "outgoing" ? "missed" : "ended")} aria-label="إنهاء">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className={`call-card call-${phase}`} role="dialog" aria-label="مكالمة صوتية">
      <div className="call-top">
        <span className="call-avatar" aria-hidden="true">
          📞
        </span>
        <span className="call-who">
          <strong className="call-peer">{peer}</strong>
          <span className="call-status">
            {phase === "active" ? <bdi dir="ltr">{status}</bdi> : status}
            {recording && <span className="call-rec-dot"> · ⏺ يُسجَّل</span>}
          </span>
          {diag && phase !== "ended" && <small className="call-diag">{diag}</small>}
        </span>
        {phase !== "incoming" && phase !== "ended" && (
          <button type="button" className="call-fold" onClick={() => setSmall(true)} aria-label="تصغير">
            ⌃
          </button>
        )}
      </div>
      <div className="call-actions">
        {phase === "incoming" && (
          <>
            <button type="button" className="call-btn call-btn-decline" onClick={() => finish("declined", "declined")}>
              ✕ رفض
            </button>
            <button type="button" className="call-btn call-btn-accept" onClick={() => void answer()}>
              ✓ رد
            </button>
          </>
        )}
        {live && (
          <>
            <button
              type="button"
              className={`call-btn${muted ? " is-on" : ""}`}
              onClick={() => {
                const next = !muted;
                local.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
                setMuted(next);
              }}
            >
              {muted ? "🔇 مكتوم" : "🎤 كتم"}
            </button>
            <button
              type="button"
              className={`call-btn${speaker ? " is-on" : ""}`}
              onClick={() => {
                const next = !speaker;
                setSpeaker(next);
                void callAudio(true, next);
              }}
            >
              {speaker ? "🔊 مكبّر" : "🎧 سماعة"}
            </button>
            <button type="button" className={`call-btn${recording ? " is-on" : ""}`} onClick={() => (recording ? stopRecording() : startRecording())} disabled={phase !== "active"}>
              {recording ? "⏹ إيقاف" : "⏺ تسجيل"}
            </button>
          </>
        )}
        {(phase === "outgoing" || live) && (
          <button type="button" className="call-btn call-btn-decline" onClick={() => finish("ended", phase === "outgoing" ? "missed" : "ended")}>
            {phase === "outgoing" ? "✕ إلغاء" : "إنهاء"}
          </button>
        )}
        {phase === "ended" && (
          <button type="button" className="call-btn" onClick={() => setPhase("idle")}>
            إغلاق
          </button>
        )}
      </div>
    </div>
  );
}
