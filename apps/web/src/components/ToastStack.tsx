"use client";

import { useEffect } from "react";

export interface ToastMessage {
  id: string;
  text: string;
}

interface Props {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3500;

/**
 * Small, non-blocking top-of-screen bubbles for background events (sync results, save failures)
 * that must never interrupt the user with a modal - unlike window.alert/confirm, these never
 * block input on the rest of the page and disappear on their own.
 */
export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <button type="button" className="toast-bubble" onClick={() => onDismiss(toast.id)}>
      {toast.text}
    </button>
  );
}
