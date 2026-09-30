"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { HOME_ACTION_EVENT, parseHomeAction } from "@/lib/homeActions";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isShortcutRoute, phoneShortcut, type PhoneShortcut } from "@/lib/shortcuts";

// Android's WebView turns a long press into a "context menu" around 500 ms (and cancels the
// pointer) - so open a bit before that, and on that contextmenu event too.
const HOLD_MS = 420;
const MOVE_PX = 10;

/** The route an element leads to: its data-shortcut-route, or its in-app link. */
function routeOf(el: Element): string | null {
  const explicit = el.getAttribute("data-shortcut-route");
  if (explicit) return explicit;
  const href = el.getAttribute("href");
  return href && isShortcutRoute(href) ? href : null;
}

/**
 * 📌 Long-press any page or tool (an in-app link, or a button marked data-shortcut-route) to pin
 * it on the phone's home screen; the shortcut opens the app on that page. Rendered once in the
 * layout - it also opens the page a shortcut launched the app with.
 */
export function PhoneShortcutLayer() {
  const router = useRouter();
  const pathname = usePathname();
  const [offer, setOffer] = useState<PhoneShortcut | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Open the page a shortcut asked for - at launch, on coming back, and while running.
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    const go = (route: string | null | undefined) => {
      if (!route || !isShortcutRoute(route)) return;
      const action = route.startsWith("/?") ? parseHomeAction(route.slice(1)) : null;
      if (action && pathRef.current === "/") window.dispatchEvent(new CustomEvent(HOME_ACTION_EVENT, { detail: action }));
      else router.push(route);
    };
    const take = () => void LocalBrowser.takeShortcutRoute().then((r) => go(r.route)).catch(() => {});
    take();
    const onVisible = () => {
      if (document.visibilityState === "visible") take();
    };
    document.addEventListener("visibilitychange", onVisible);
    const handle = LocalBrowser.addListener("shortcutOpened", () => take());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void handle.then((h) => h.remove()).catch(() => {});
    };
  }, [router]);

  // The long press itself.
  useEffect(() => {
    let timer: number | undefined;
    let start: { x: number; y: number } | null = null;
    let suppressClick = false;
    let openedAt = 0;
    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      start = null;
    };
    /** The shortcut an element offers, or null. */
    const shortcutOf = (el: EventTarget | null): PhoneShortcut | null => {
      const target = (el as Element | null)?.closest?.("[data-shortcut-route], a[href]");
      if (!target || target.closest("[data-no-shortcut]")) return null;
      const route = routeOf(target);
      if (!route) return null;
      const label = target.getAttribute("data-shortcut-label") || target.getAttribute("aria-label") || target.textContent || "";
      return phoneShortcut(route, label);
    };
    const open = (shortcut: PhoneShortcut) => {
      openedAt = Date.now();
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 1500);
      setStatus(null);
      setOffer(shortcut);
      if (navigator.vibrate) navigator.vibrate(20);
    };
    const onDown = (e: PointerEvent) => {
      const shortcut = shortcutOf(e.target);
      if (!shortcut) return;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        timer = undefined;
        open(shortcut);
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) cancel();
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onContextMenu = (e: MouseEvent) => {
      const shortcut = shortcutOf(e.target);
      if (!shortcut) return;
      e.preventDefault();
      // The phone's own long press (it may cancel the pointer first): open it if not already.
      cancel();
      if (Date.now() - openedAt > 1000) open(shortcut);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", cancel, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", cancel, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, []);

  async function pin() {
    if (!offer) return;
    if (!isRunningInAndroidApp()) return setStatus("متاح في تطبيق الهاتف فقط");
    try {
      const result = await LocalBrowser.pinShortcut(offer);
      if (result.unsupported) return setStatus("هاتفك لا يسمح بإضافة اختصارات من التطبيق");
      if (!result.pinned) return setStatus("لم تتم الإضافة - حاول مرة أخرى");
      setStatus("✓ وافق في نافذة الهاتف ليظهر الاختصار على الشاشة");
      window.setTimeout(() => setOffer(null), 1800);
    } catch {
      setStatus("تعذرت الإضافة");
    }
  }

  if (!offer) return null;
  return (
    <div className="shortcut-sheet-layer" role="presentation" onClick={() => setOffer(null)} data-no-shortcut>
      <div className="shortcut-sheet" role="dialog" aria-modal="true" aria-label="إضافة اختصار" onClick={(e) => e.stopPropagation()}>
        <span className="shortcut-sheet-icon" style={{ background: offer.color }} aria-hidden="true">
          {offer.emoji}
        </span>
        <strong>📌 إضافة «{offer.label}» إلى شاشة الهاتف؟</strong>
        <p className="settings-hint">تظهر أيقونة بجانب تطبيقاتك تفتح هذه الصفحة مباشرة.</p>
        {status && <p className="settings-hint">{status}</p>}
        <div className="settings-actions">
          <button type="button" className="dialog-primary" onClick={() => void pin()}>
            📌 أضف إلى الشاشة
          </button>
          <button type="button" className="text-action" onClick={() => setOffer(null)}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
