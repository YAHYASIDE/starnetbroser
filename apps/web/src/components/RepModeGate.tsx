"use client";

import { ReactNode, useEffect, useState } from "react";
import { loadRepMode, REP_MODE_EVENT, type RepModeSettings, saveRepMode } from "@/lib/repDeviceTransfer";
import { RepModeView } from "./RepModeView";

/** On a rep's phone (📱 وضع المندوب) the whole app is RepModeView - no pages, no bottom bar. */
export function RepModeGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RepModeSettings | null>(null);
  useEffect(() => {
    const refresh = () => setMode(loadRepMode());
    refresh();
    window.addEventListener(REP_MODE_EVENT, refresh);
    return () => window.removeEventListener(REP_MODE_EVENT, refresh);
  }, []);
  if (!mode) return <>{children}</>;
  return (
    <RepModeView
      settings={mode}
      onExit={() => {
        saveRepMode(null);
        setMode(null);
      }}
    />
  );
}
