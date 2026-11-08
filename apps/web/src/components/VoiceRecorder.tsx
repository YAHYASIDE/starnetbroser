"use client";

import { useEffect, useRef, useState } from "react";
import { isChatAudio, MAX_VOICE_SECONDS } from "@/lib/chat";

/** The first recording format this phone can make (opus: small for speech). */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 🎤 A voice message (his Nov 8 2026 ask «التسجيل الصوتي»): tap 🎤 to record (the phone asks for the microphone the
 * first time), then «➤» sends or «✕» drops it. At most 90 s, at a speech bitrate, so it travels in the sealed message.
 */
export function VoiceRecorder({
  onRecorded,
  onError,
  onState,
  disabled,
}: {
  onRecorded: (audio: string, seconds: number) => void;
  onError: (text: string) => void;
  onState?: (recording: boolean) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const send = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("هذا الهاتف لا يسمح بالتسجيل هنا - حدّث التطبيق");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      onError("🎤 اسمح للتطبيق بالميكروفون ثم أعد المحاولة");
      return;
    }
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
    chunks.current = [];
    send.current = false;
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setRecording(false);
      onState?.(false);
      if (!send.current || chunks.current.length === 0) return;
      const length = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      const url = await blobToDataUrl(new Blob(chunks.current, { type: recorder.mimeType || mime || "audio/webm" })).catch(() => "");
      if (isChatAudio(url)) onRecorded(url, length);
      else onError("التسجيل أطول أو أكبر من المسموح - سجّل رسالة أقصر");
    };
    rec.current = recorder;
    started.current = Date.now();
    setSeconds(0);
    setRecording(true);
    onState?.(true);
    recorder.start(1000);
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS) stop(true);
    }, 500);
  }

  function stop(keep: boolean) {
    send.current = keep;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }

  if (!recording) {
    return (
      <button type="button" className="chat-send chat-mic" onClick={() => void start()} disabled={disabled} aria-label="تسجيل رسالة صوتية">
        🎤
      </button>
    );
  }
  return (
    <div className="chat-recording" role="status">
      <button type="button" className="chat-tool" onClick={() => stop(false)} aria-label="إلغاء التسجيل">
        ✕
      </button>
      <span className="chat-recording-dot" aria-hidden="true" />
      <span className="chat-recording-time">
        🎤 <bdi dir="ltr">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / ${Math.floor(MAX_VOICE_SECONDS / 60)}:${String(MAX_VOICE_SECONDS % 60).padStart(2, "0")}`}</bdi>
      </span>
      <button type="button" className="chat-send" onClick={() => stop(true)} aria-label="إرسال التسجيل">
        ➤
      </button>
    </div>
  );
}
