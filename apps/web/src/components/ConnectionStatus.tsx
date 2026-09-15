"use client";

import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/apiClient";
import { getApiBaseUrl, isDemoMode } from "@/lib/settingsStore";

type Status = "checking" | "connected" | "unreachable" | "demo";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(getApiBaseUrl());
    if (isDemoMode()) {
      setStatus("demo");
      return;
    }
    let cancelled = false;
    checkHealth().then((ok) => {
      if (!cancelled) setStatus(ok ? "connected" : "unreachable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "demo") {
    return <span className="conn-badge conn-demo">وضع العرض التجريبي</span>;
  }
  if (status === "checking") {
    return <span className="conn-badge conn-checking">جارِ التحقق من الاتصال…</span>;
  }
  if (status === "connected") {
    return <span className="conn-badge conn-ok">متصل بـ {baseUrl}</span>;
  }
  return <span className="conn-badge conn-error">تعذّر الاتصال بالخادم: {baseUrl}</span>;
}
