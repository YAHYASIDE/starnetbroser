"use client";

import { useEffect } from "react";
import { toastBody, toastTone } from "@/lib/toastTone";

export interface ToastMessage {
  id: string;
  text: string;
}

interface Props {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 4000;

/**
 * One compact notification at a time, just above the bottom bar - never a pile of bubbles.
 * Later messages wait their turn (a small "+N" shows how many), each disappears on its own or on
 * tap, and nothing here ever blocks the rest of the page.
 */
export function ToastStack({ toasts, onDismiss }: Props) {
  const current = toasts[0];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => onDismiss(current.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;
  const tone = toastTone(current.text);
  const waiting = toasts.length - 1;
  return (
    <div className="snackbar-host" aria-live="polite">
      <button key={current.id} type="button" className={`snackbar snackbar-${tone}`} onClick={() => onDismiss(current.id)}>
        <span className="snackbar-icon" aria-hidden="true">
          {tone === "success" ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
          ) : tone === "error" ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 7v6M12 17h.01" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 11v6M12 7h.01" /></svg>
          )}
        </span>
        <span className="snackbar-text">{toastBody(current.text)}</span>
        {waiting > 0 && <span className="snackbar-more">+{waiting}</span>}
      </button>
    </div>
  );
}
