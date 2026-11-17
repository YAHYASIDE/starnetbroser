"use client";

import { useEffect, useState } from "react";
import { LOW_NET_EVENT, looksWeak, lowNetOn, setLowNet } from "@/lib/lowNet";
import { pushScheduledSyncs } from "@/lib/scheduledSyncs";

type Conn = { effectiveType?: string; downlink?: number; rtt?: number; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };

/**
 * 📶 «إنترنت ضعيف» (lib/lowNet.ts) - a button in the home header, on / off with one tap (his Nov 17 2026 ask). When the
 * phone itself reports a weak connection and the button is off, it blinks to suggest it.
 */
export function LowNetButton() {
  const [on, setOn] = useState(false);
  const [weak, setWeak] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setOn(lowNetOn());
    read();
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    const check = () => setWeak(looksWeak(conn));
    check();
    conn?.addEventListener?.("change", check);
    window.addEventListener(LOW_NET_EVENT, read);
    return () => {
      conn?.removeEventListener?.("change", check);
      window.removeEventListener(LOW_NET_EVENT, read);
    };
  }, []);

  const toggle = () => {
    const next = !on;
    setLowNet(next);
    setOn(next);
    void pushScheduledSyncs();
    setNote(next ? "📶 وضع الإنترنت الضعيف: أوقفت ما يعمل في الخلفية - ما تطلبه أنت يعمل" : "✓ رجع كل شيء كما كان");
    window.setTimeout(() => setNote(null), 3500);
  };

  return (
    <>
      <button
        type="button"
        className={`header-more low-net-btn${on ? " low-net-on" : weak ? " low-net-hint" : ""}`}
        aria-pressed={on}
        aria-label={on ? "وضع الإنترنت الضعيف مفعّل - اضغط لإطفائه" : "تفعيل وضع الإنترنت الضعيف"}
        data-tour="low-net"
        onClick={toggle}
      >
        <span aria-hidden="true">📶</span>
        <span className="low-net-word">{on ? "ضعيف ✓" : "ضعيف؟"}</span>
      </button>
      {note && (
        <div className="low-net-note" role="status">
          {note}
        </div>
      )}
    </>
  );
}
