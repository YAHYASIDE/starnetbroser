"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { isRunningInAndroidApp, takeSharedFile } from "@/lib/localBrowser";
import { applyRepCopyText, REP_WORKSPACE_EVENT } from "@/lib/repCopyApply";
import { loadRepMode, REP_MODE_EVENT, type RepModeSettings } from "@/lib/repDeviceTransfer";
import { exitRepMode, isRepAllowedPath, REP_SENDER_EVENT } from "@/lib/repMode";
import { hasRepWorkspace } from "@/lib/repWorkspace";
import { repChangesFileRep } from "@/lib/repChanges";
import { receiveRepChanges } from "@/lib/repChangesApply";
import { RepModeView } from "./RepModeView";

const MESSAGE_KEY = "starnet.repCopyMessage";

/**
 * 📱 On a rep's phone: until the first copy arrives the app is RepModeView (open the copy, add and
 * send devices). Once a copy with stores is applied, it is the operator's own app - same cards,
 * same pages - limited to the pages he allowed, on the rep's data only (lib/repWorkspace.ts).
 */
export function RepModeGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RepModeSettings | null>(null);
  const [workspace, setWorkspace] = useState(false);
  const [sender, setSender] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setMode(loadRepMode());
      setWorkspace(hasRepWorkspace());
    };
    refresh();
    const openSender = () => setSender(true);
    window.addEventListener(REP_MODE_EVENT, refresh);
    window.addEventListener(REP_WORKSPACE_EVENT, refresh);
    window.addEventListener(REP_SENDER_EVENT, openSender);
    return () => {
      window.removeEventListener(REP_MODE_EVENT, refresh);
      window.removeEventListener(REP_WORKSPACE_EVENT, refresh);
      window.removeEventListener(REP_SENDER_EVENT, openSender);
    };
  }, []);
  if (!mode) {
    return (
      <>
        <RepChangesListener />
        {children}
      </>
    );
  }
  if (!workspace || sender) {
    return <RepModeView settings={mode} onExit={exitRepMode} onBack={workspace ? () => setSender(false) : undefined} />;
  }
  return (
    <>
      <RepPagesGuard />
      <RepCopyListener code={mode.code} />
      {children}
    </>
  );
}

/** A page the rep's app doesn't have goes back home. */
function RepPagesGuard() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname && !isRepAllowedPath(pathname)) router.replace("/");
  }, [pathname, router]);
  return null;
}

/** 📥 A new copy opened with STAR NET (from Telegram) is applied here, then the app reloads its
 * data; the result shows for a few seconds. */
function RepCopyListener({ code }: { code: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const check = useCallback(async () => {
    const text = await takeSharedFile();
    if (!text) return;
    const result = await applyRepCopyText(text, code);
    if (result.ok) {
      try {
        window.sessionStorage.setItem(MESSAGE_KEY, result.message);
      } catch {
        // only the message is lost
      }
      window.location.reload();
    } else {
      setMessage(result.message);
    }
  }, [code]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(MESSAGE_KEY);
      if (saved) {
        setMessage(saved);
        window.sessionStorage.removeItem(MESSAGE_KEY);
      }
    } catch {
      // ignored
    }
    void check();
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (isRunningInAndroidApp()) handles.push(App.addListener("resume", () => void check()));
    return () => {
      for (const h of handles) void h.then((x) => x.remove());
    };
  }, [check]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div className="rep-copy-banner" role="status" onClick={() => setMessage(null)}>
      {message}
    </div>
  );
}

/** 📥 On the operator's phone: a rep's «تسجيلاتي» file opened with STAR NET (sent by WhatsApp
 * instead of the bot) is applied like one from the bot. */
function RepChangesListener() {
  const [message, setMessage] = useState<string | null>(null);
  const check = useCallback(async () => {
    const text = await takeSharedFile();
    if (!text || !repChangesFileRep(text)) return;
    setMessage("⏳ جارِ تثبيت تسجيلات المندوب…");
    setMessage((await receiveRepChanges(text)).message);
  }, []);

  useEffect(() => {
    void check();
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (isRunningInAndroidApp()) handles.push(App.addListener("resume", () => void check()));
    return () => {
      for (const h of handles) void h.then((x) => x.remove());
    };
  }, [check]);

  useEffect(() => {
    if (!message || message.startsWith("⏳")) return;
    const t = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div className="rep-copy-banner" role="status" onClick={() => setMessage(null)}>
      {message}
    </div>
  );
}
