"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { DATA_RELOAD_EVENT } from "@/lib/dataReload";

/** 🔄 The open page, remounted when the data changed underneath it (lib/dataReload.ts) - its scroll kept. The bars
 * outside it hear a «storage» event and read again too. */
export function DataReloadBoundary({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onReload = () => {
      const y = window.scrollY;
      setVersion((v) => v + 1);
      window.dispatchEvent(new Event("storage"));
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    };
    window.addEventListener(DATA_RELOAD_EVENT, onReload);
    return () => window.removeEventListener(DATA_RELOAD_EVENT, onReload);
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
}
