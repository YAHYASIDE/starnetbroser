"use client";

import { useEffect, useState } from "react";
import { isDesktopApp } from "@/lib/desktop";

/** The Windows app on a wide window - the same condition as globals.css «Windows layout». */
export const DESK_WIDE_QUERY = "(min-width: 900px)";

export function useDeskWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!isDesktopApp() || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DESK_WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}
