"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PartySheet } from "./AccountsSection";
import { allowInSafeMode, allowedInSafeMode, BACKGROUND_PARTS, partRuns, SAFE_MODE_EVENT, safeModeOn, setSafeMode } from "@/lib/safeMode";

function useSafeTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener(SAFE_MODE_EVENT, on);
    return () => window.removeEventListener(SAFE_MODE_EVENT, on);
  }, []);
  return n;
}

/** 🛟 A background job that stays off in the safe mode until he starts it (lib/safeMode.ts). */
export function BackgroundPart({ part, children }: { part: string; children: ReactNode }) {
  useSafeTick();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || !partRuns(part)) return null;
  return <>{children}</>;
}

/** 🛟 The banner while the safe mode is on: what is stopped, start each part, or end it. */
export function SafeModeBanner() {
  useSafeTick();
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setOn(safeModeOn()));
  if (!on) return null;
  const allowed = allowedInSafeMode();
  return (
    <>
      <button type="button" className="safe-mode-banner" role="alert" onClick={() => setOpen(true)}>
        🛟 وضع آمن - أعمال الخلفية متوقفة · اضغط
      </button>
      {open && (
        <PartySheet title="🛟 الوضع الآمن" onClose={() => setOpen(false)}>
          <p className="settings-hint">
            فُتح التطبيق 3 مرات في 3 دقائق، فشغّلته دون أي عمل في الخلفية لكي لا يتجمد. بياناتك كلها هنا وتعمل. شغّل الأجزاء واحدًا واحدًا: إن
            تجمّد التطبيق بعد تشغيل جزء، فهو السبب - أخبرني باسمه.
          </p>
          <ul className="safe-mode-list">
            {BACKGROUND_PARTS.map((p) => (
              <li key={p.id} className="safe-mode-part">
                <span>{p.label}</span>
                {allowed.includes(p.id) ? (
                  <span className="settings-hint">✓ يعمل</span>
                ) : (
                  <button type="button" className="dialog-secondary" onClick={() => allowInSafeMode(p.id)}>
                    ▶️ شغّل
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="dialog-primary"
            onClick={() => {
              setSafeMode(false);
              setOpen(false);
              window.location.reload();
            }}
          >
            ✅ أنهِ الوضع الآمن (يعمل كل شيء)
          </button>
        </PartySheet>
      )}
    </>
  );
}
