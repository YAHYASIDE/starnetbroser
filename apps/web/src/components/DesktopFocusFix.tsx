"use client";

import { useEffect } from "react";

type Desktop = { refocus?: () => void };

/**
 * ⌨️ The laptop (Electron on Windows): after an alert / confirm / prompt the page's fields no longer take a click or
 * typing (his Nov 7 2026 report: «في اللابتوب لا يمكن الضغط على المبلغ، لا يظهر شيء»). Each of the three is wrapped
 * here to give the window its focus back right after (desktop/main.js «starnet:refocus»). Nothing on the phone.
 */
export function DesktopFocusFix() {
  useEffect(() => {
    const desktop = (window as unknown as { starnetDesktop?: Desktop }).starnetDesktop;
    if (!desktop?.refocus) return;
    const refocus = () => {
      desktop.refocus?.();
      // and once more after the dialog's own focus handling settles
      window.setTimeout(() => desktop.refocus?.(), 60);
    };
    const original = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
    window.alert = (message?: unknown) => {
      original.alert.call(window, message);
      refocus();
    };
    window.confirm = (message?: string) => {
      const answer = original.confirm.call(window, message);
      refocus();
      return answer;
    };
    window.prompt = (message?: string, value?: string) => {
      const answer = original.prompt.call(window, message, value);
      refocus();
      return answer;
    };
    return () => {
      window.alert = original.alert;
      window.confirm = original.confirm;
      window.prompt = original.prompt;
    };
  }, []);
  return null;
}
