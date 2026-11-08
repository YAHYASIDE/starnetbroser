"use client";

import { useEffect, useRef, useState } from "react";
import { newChatMessage } from "@/lib/chat";
import { chatTargets, firestoreFor, type ChatTarget } from "@/lib/chatTransport";
import { CALL_INCOMING_EVENT, callClock, callDocPath, CONNECT_MS, endWords, ICE_GATHER_MS, ICE_SERVERS, isCallState, RING_MS, type CallState } from "@/lib/callSignal";
import { openText, sealText, type Sealed } from "@/lib/deviceSyncCrypto";
import { updateDocumentFields, writeDocument } from "@/lib/firestoreRest";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
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

/**
 * 📞 The voice call on every page (lib/callSignal.ts): «📞 يتصل…» with «إلغاء», the incoming screen with «✓ رد» /
 * «✕ رفض» (and a vibration), then the call: its time, «🔇 كتم» and «إنهاء». One call at a time.
 */
export function CallManager() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState("");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [since, setSince] = useState(0);
  const [, tick] = useState(0);
  const call = useRef<{ target: ChatTarget; id: string; offer?: string; mine: boolean } | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const unsub = useRef<(() => void) | null>(null);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function cleanup() {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    unsub.current?.();
    unsub.current = null;
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    if (audio.current) audio.current.srcObject = null;
    navigator.vibrate?.(0);
  }

  function finish(reason: Parameters<typeof endWords>[0], tell?: CallState) {
    const c = call.current;
    if (c && tell) void updateDocumentFields(c.target.firebase, callDocPath(c.target.spaceId, c.id), { state: tell });
    cleanup();
    setNote(endWords(reason));
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
    const remote = new MediaStream();
    if (!audio.current) {
      audio.current = document.createElement("audio");
      audio.current.autoplay = true;
    }
    audio.current.srcObject = remote;
    void audio.current.play().catch(() => undefined);
    return remote;
  }

  async function connection(remote: MediaStream): Promise<RTCPeerConnection | null> {
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      finish("nomic", call.current?.mine ? undefined : "declined");
      return null;
    }
    const p = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    for (const t of local.current.getTracks()) p.addTrack(t, local.current);
    p.ontrack = (e) => e.track && remote.addTrack(e.track);
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") {
        setSince(Date.now());
        setPhase("active");
      } else if (p.connectionState === "failed") {
        finish("failed", "ended");
      } else if (p.connectionState === "disconnected" && phaseRef.current === "active") {
        later(() => p.connectionState === "disconnected" && finish("ended", "ended"), 6000);
      }
    };
    pc.current = p;
    return p;
  }

  /** Follows the call's document: the answer (caller), or the call ending / answered elsewhere (callee). */
  async function follow() {
    const c = call.current;
    if (!c) return;
    try {
      const { db, fs } = await firestoreFor(c.target.firebase);
      unsub.current = fs.onSnapshot(fs.doc(db, "starnet", c.target.spaceId, "calls", c.id), (snap) => {
        const d = snap.data() as { state?: string; answer?: string; answeredBy?: string } | undefined;
        if (!d || !isCallState(d.state) || call.current?.id !== c.id) return;
        if (c.mine) {
          if (d.state === "answered" && d.answer && phaseRef.current === "outgoing") {
            setPhase("connecting");
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
    setMuted(false);
    setPhase("outgoing");
    const remote = prepareAudio();
    const p = await connection(remote);
    if (!p || !call.current) return;
    try {
      await p.setLocalDescription(await p.createOffer({ offerToReceiveAudio: true }));
      await gathered(p);
      const sealed = await sealText(JSON.stringify(p.localDescription), target.key);
      const w = await writeDocument(target.firebase, callDocPath(target.spaceId, call.current.id), { state: "ringing", offer: JSON.stringify(sealed), at: String(Date.now()) });
      if (!w.ok) return finish("offline");
      const message = newChatMessage({ conv: target.conv, from: isRepWorkspace() ? "rep" : "owner", by: myName(), member: loadLinkConfig(browserLinkStorage())?.memberId, text: "", call: { id: call.current.id } });
      if (message) void postChat(target, message);
      await follow();
      later(() => phaseRef.current === "outgoing" && finish("missed", "missed"), RING_MS);
    } catch {
      finish("failed", "ended");
    }
  }

  async function incoming(conv: string, id: string, by: string) {
    if (phaseRef.current !== "idle" && phaseRef.current !== "ended") return;
    const target = chatTargets().find((t) => t.conv === conv);
    if (!target) return;
    cleanup();
    call.current = { target, id, mine: false };
    setPeer(by || target.title);
    setNote("");
    setMuted(false);
    setPhase("incoming");
    navigator.vibrate?.([600, 400, 600, 400, 600, 400, 600, 400, 600, 400, 600]);
    await follow();
    later(() => phaseRef.current === "incoming" && finish("missed"), RING_MS);
  }

  async function answer() {
    const c = call.current;
    if (!c) return;
    navigator.vibrate?.(0);
    setPhase("connecting");
    const remote = prepareAudio();
    const p = await connection(remote);
    if (!p) return;
    try {
      const { db, fs } = await firestoreFor(c.target.firebase);
      const snap = await fs.getDoc(fs.doc(db, "starnet", c.target.spaceId, "calls", c.id));
      const d = snap.data() as { state?: string; offer?: string } | undefined;
      if (!d?.offer || d.state !== "ringing") return finish(d?.state === "answered" ? "elsewhere" : "ended");
      await p.setRemoteDescription(JSON.parse(await openText(JSON.parse(d.offer) as Sealed, c.target.key)) as RTCSessionDescriptionInit);
      await p.setLocalDescription(await p.createAnswer());
      await gathered(p);
      const sealed = await sealText(JSON.stringify(p.localDescription), c.target.key);
      await updateDocumentFields(c.target.firebase, callDocPath(c.target.spaceId, c.id), { state: "answered", answer: JSON.stringify(sealed) });
      later(() => phaseRef.current === "connecting" && finish("failed", "ended"), CONNECT_MS);
    } catch {
      finish("failed", "ended");
    }
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
  return (
    <div className={`call-screen call-${phase}`} role="dialog" aria-label="مكالمة صوتية">
      <div className="call-card">
        <div className="call-avatar" aria-hidden="true">
          📞
        </div>
        <strong className="call-peer">{peer}</strong>
        <span className="call-status">{phase === "active" ? <bdi dir="ltr">{status}</bdi> : status}</span>
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
          {(phase === "connecting" || phase === "active") && (
            <button
              type="button"
              className={`call-btn call-btn-mute${muted ? " is-on" : ""}`}
              onClick={() => {
                const next = !muted;
                local.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
                setMuted(next);
              }}
            >
              {muted ? "🔇 مكتوم" : "🎤 كتم"}
            </button>
          )}
          {(phase === "outgoing" || phase === "connecting" || phase === "active") && (
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
    </div>
  );
}
