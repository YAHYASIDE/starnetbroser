"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, openSession, vncWebSocketUrl } from "@/lib/apiClient";

type ViewState = "loading" | "connecting" | "connected" | "error";

/** A real noVNC session, not a placeholder: opens the account's cloud
 * browser session over the backend, then streams it live via RFB.js. */
export function VncViewer({ accountId }: { accountId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let rfb: { disconnect: () => void } | null = null;

    async function connect() {
      setState("loading");
      setErrorMessage("");
      try {
        const opened = await openSession(accountId);
        if (cancelled) return;

        setState("connecting");
        const { default: RFB } = await import("@novnc/novnc/lib/rfb.js");
        if (cancelled || !containerRef.current) return;

        const wsUrl = vncWebSocketUrl(opened.vncTicket);
        const client = new RFB(containerRef.current, wsUrl);
        client.scaleViewport = true;
        client.resizeSession = true;
        rfb = client;

        client.addEventListener("connect", () => {
          if (!cancelled) setState("connected");
        });
        client.addEventListener("disconnect", () => {
          if (!cancelled) {
            setState("error");
            setErrorMessage("انقطع الاتصال بالمتصفح السحابي");
          }
        });
        client.addEventListener("securityfailure", () => {
          if (!cancelled) {
            setState("error");
            setErrorMessage("فشل التحقق الأمني من الاتصال");
          }
        });
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setErrorMessage(err instanceof ApiError ? err.message : "تعذّر فتح الجلسة السحابية");
      }
    }

    connect();
    return () => {
      cancelled = true;
      rfb?.disconnect();
    };
  }, [accountId, attempt]);

  return (
    <div className="vnc-viewer">
      {state !== "connected" && (
        <div className="vnc-overlay">
          {state === "error" ? (
            <>
              <p className="account-card-alert">{errorMessage || "حدث خطأ غير متوقع"}</p>
              <button className="btn-icon" onClick={() => setAttempt((a) => a + 1)}>
                إعادة المحاولة
              </button>
            </>
          ) : (
            <p>{state === "loading" ? "جارِ فتح الجلسة السحابية…" : "جارِ الاتصال بالمتصفح…"}</p>
          )}
        </div>
      )}
      <div ref={containerRef} className="vnc-canvas-host" />
    </div>
  );
}
