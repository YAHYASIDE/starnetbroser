"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isRunningInAndroidApp } from "@/lib/localBrowser";

/**
 * 🧭 Inside the phone app a page loaded straight from its address (a reload, an older build's reload after a team
 * change) gets the HOME page's content - the app's local server answers every unknown path with index.html - while the
 * bar shows the address's tab, and tapping that tab then does nothing (his Nov 7 2026 report «الزبائن لا يظهرون»).
 * Once per load, a page other than home is rebuilt by the router from its own data.
 */
export function RouteRepair() {
  const router = useRouter();
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    const path = window.location.pathname;
    if (path === "/" || path === "") return;
    router.replace(`${path}${window.location.search}${window.location.hash}`);
    // once, for the page the app was loaded on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
