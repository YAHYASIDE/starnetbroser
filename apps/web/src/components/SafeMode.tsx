"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PartySheet } from "./AccountsSection";
import {
  BACKGROUND_PARTS,
  dismissSafeAsk,
  isAlwaysOn,
  partRuns,
  SAFE_MODE_EVENT,
  safeAskPending,
  safeEnteredByItself,
  safeModeOn,
  setPartRunning,
  setSafeMode,
} from "@/lib/safeMode";

function useSafeTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener(SAFE_MODE_EVENT, on);
    return () => window.removeEventListener(SAFE_MODE_EVENT, on);
  }, []);
  return n;
}

/**
 * ⏱️ The background parts start one after the other, not all at the moment the app opens (his Nov 26 2026 «عندما أنهيت
 * الوضع الآمن خرج التطبيق ولا يدخل»): each cuts / hashes all the data on its first round - together, at the first
 * second, they were a memory spike on a phone with a lot of data.
 */
export const START_AFTER_MS: Record<string, number> = { link: 2000, whatsapp: 8000, reps: 14000, chat: 20000, telegram: 26000, receipts: 32000, browser: 38000 };

/** 🛟 A background job that runs only as he left it (lib/safeMode.ts): stopped by him, or in the safe mode. */
export function BackgroundPart({ part, children }: { part: string; children: ReactNode }) {
  useSafeTick();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), START_AFTER_MS[part] ?? 0);
    return () => window.clearTimeout(t);
  }, [part]);
  if (!ready || !partRuns(part)) return null;
  return <>{children}</>;
}

/** Each background part with its own ▶️ / ⏸️ - his tap only, it stays so. */
function PartsList() {
  useSafeTick();
  return (
    <ul className="safe-mode-list">
      {BACKGROUND_PARTS.map((p) => {
        const runs = partRuns(p.id);
        return (
          <li key={p.id} className="safe-mode-part">
            <span>
              {p.label}
              <small className="settings-hint">{isAlwaysOn(p.id) ? " ✓ يعمل دائمًا" : runs ? " ✓ يعمل" : " ⏸️ متوقف"}</small>
            </span>
            {isAlwaysOn(p.id) ? (
              <span className="settings-hint">🔒 دائمًا</span>
            ) : (
              <button type="button" className="dialog-secondary" onClick={() => setPartRunning(p.id, !runs)}>
                {runs ? "⏸️ أوقف" : "▶️ شغّل"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 🛟 The safe mode's question (3 quick opens), its banner while on, and its sheet. */
export function SafeModeBanner() {
  useSafeTick();
  const [state, setState] = useState<"none" | "ask" | "on">("none");
  const [open, setOpen] = useState(false);
  useEffect(() => setState(safeModeOn() ? "on" : safeAskPending() ? "ask" : "none"));

  useEffect(() => {
    if (state === "ask") setOpen(true);
  }, [state]);
  if (state === "none") return null;
  return (
    <>
      <button type="button" className="safe-mode-banner" role="alert" onClick={() => setOpen(true)}>
        {state === "ask" ? "🛟 فُتح التطبيق 3 مرات بسرعة - هل أشغّل الوضع الآمن؟ اضغط" : "🛟 وضع آمن - أعمال الخلفية متوقفة · اضغط"}
      </button>
      {open && state === "ask" && (
        <PartySheet title="🛟 الوضع الآمن؟" onClose={() => setOpen(false)}>
          <p className="settings-hint">
            فُتح التطبيق 3 مرات في 3 دقائق. إن كان يتجمّد، شغّل الوضع الآمن (تتوقف أعمال الخلفية حتى تنهيه أنت). إن كنت فقط تعيد فتحه، اختر «لا».
            أعمال الخلفية تنتظر جوابك.
          </p>
          <div className="agent-actions">
            <button type="button" className="dialog-primary" onClick={() => setSafeMode(true)}>
              🛟 نعم، شغّل الوضع الآمن
            </button>
            <button
              type="button"
              className="dialog-secondary"
              onClick={() => {
                dismissSafeAsk();
                setOpen(false);
              }}
            >
              لا، شغّل كما كان
            </button>
          </div>
        </PartySheet>
      )}
      {open && state === "on" && (
        <PartySheet title="🛟 الوضع الآمن" onClose={() => setOpen(false)}>
          <p className="settings-hint">
            {safeEnteredByItself() ? "دخل التطبيق الوضع الآمن وحده لأنه أُغلق مرتين متتاليتين فور فتحه. " : ""}
            يبقى الوضع الآمن مفعّلًا حتى تنهيه أنت - لا يتوقف ولا يتغيّر وحده. شغّل الأجزاء واحدًا واحدًا (وانتظر نصف دقيقة بعد كل جزء): إن أُغلق التطبيق بعد تشغيل
            جزء، فهو السبب - أخبرني باسمه.
          </p>
          <PartsList />
          <button
            type="button"
            className="dialog-primary"
            onClick={() => {
              setSafeMode(false);
              setOpen(false);
              window.location.reload();
            }}
          >
            ✅ أنهِ الوضع الآمن
          </button>
        </PartySheet>
      )}
    </>
  );
}

/** ⚙️ Settings ← الأمان ← «الوضع الآمن وأعمال الخلفية»: turn it on / off, stop or start any part - only by his tap. */
export function SafeModeSection() {
  useSafeTick();
  const on = safeModeOn();
  return (
    <section className="section">
      <p className="settings-hint">
        {on
          ? "🛟 الوضع الآمن مفعّل: كل أعمال الخلفية متوقفة إلا ما شغّلته أنت. يبقى كذلك حتى تنهيه."
          : "كل عمل في الخلفية يبقى كما تركته: ما توقفه يبقى متوقفًا حتى تشغّله أنت. لا يتغيّر شيء وحده."}
      </p>
      <PartsList />
      <button
        type="button"
        className={on ? "dialog-primary" : "dialog-secondary"}
        onClick={() => {
          setSafeMode(!on);
          if (on) window.location.reload();
        }}
      >
        {on ? "✅ أنهِ الوضع الآمن" : "🛟 شغّل الوضع الآمن"}
      </button>
    </section>
  );
}
