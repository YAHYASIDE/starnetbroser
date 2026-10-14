"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isRepWorkspace } from "@/lib/repMode";
import {
  loadSeenReleases,
  markSeen,
  pendingReleases,
  samePath,
  saveSeenReleases,
  tourSteps,
  WHATS_NEW,
  WHATS_NEW_EVENT,
  type WhatsNewStep,
} from "@/lib/whatsNew";

type TourStep = WhatsNewStep & { releaseId: string };

/** How long a step waits for its page / element to appear before showing the card alone. */
const FIND_TIMEOUT_MS = 4000;

/**
 * 🆕 The update tour (lib/whatsNew.ts): once by itself after an update, or on demand from
 * Settings. Each step opens its page, scrolls to the `data-tour` element, lights it up and shows
 * «كان: … / الآن: …» with «موافق» (next) and «تخطي» (end).
 */
export function WhatsNewTour() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  // Once after an update (not in a rep's app - the tour is about the owner's screens).
  useEffect(() => {
    if (isRepWorkspace()) return;
    const timer = window.setTimeout(() => {
      const pending = pendingReleases(WHATS_NEW, loadSeenReleases());
      if (pending.length) {
        setSteps(tourSteps(pending));
        setIndex(0);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Settings → «▶️ شاهد».
  useEffect(() => {
    function onPlay(event: Event) {
      const id = (event as CustomEvent<{ releaseId?: string }>).detail?.releaseId;
      const release = WHATS_NEW.find((r) => r.id === id) ?? WHATS_NEW[0];
      if (!release) return;
      setSteps(tourSteps([release]));
      setIndex(0);
    }
    window.addEventListener(WHATS_NEW_EVENT, onPlay);
    return () => window.removeEventListener(WHATS_NEW_EVENT, onPlay);
  }, []);

  // Open the step's page, then find, scroll to and keep measuring its element.
  useEffect(() => {
    if (!step) return;
    setRect(null);
    if (step.path && !samePath(pathname, step.path)) {
      router.push(step.path);
      return;
    }
    if (!step.target) return;
    let found: Element | null = null;
    let raf = 0;
    const started = Date.now();
    const measure = () => {
      if (found) setRect(found.getBoundingClientRect());
    };
    const look = window.setInterval(() => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        found = el;
        window.clearInterval(look);
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        // follow the smooth scroll, then keep in step with any later scroll / resize
        const follow = () => {
          measure();
          if (Date.now() - started < FIND_TIMEOUT_MS + 1500) raf = window.requestAnimationFrame(follow);
        };
        follow();
      } else if (Date.now() - started > FIND_TIMEOUT_MS) {
        window.clearInterval(look);
      }
    }, 150);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(look);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step, pathname, router]);

  const finish = useCallback(() => {
    const ids = Array.from(new Set(steps.map((s) => s.releaseId)));
    saveSeenReleases(markSeen(loadSeenReleases(), ids));
    setSteps([]);
    setIndex(0);
    setRect(null);
  }, [steps]);

  if (!step) return null;
  const last = index === steps.length - 1;
  // The card sits away from the lit place: at the top when the place is in the lower half.
  const cardAtTop = rect !== null && rect.top + Math.min(rect.height, 200) / 2 > window.innerHeight / 2;
  const pad = 6;
  const visible = rect && rect.bottom > 0 && rect.top < window.innerHeight;

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="ما الجديد في التحديث">
      {visible ? (
        <div
          className="tour-spotlight"
          style={{
            top: Math.max(rect.top - pad, 4),
            left: Math.max(rect.left - pad, 4),
            width: Math.min(rect.width + pad * 2, window.innerWidth - 8),
            height: Math.min(rect.bottom + pad, window.innerHeight - 4) - Math.max(rect.top - pad, 4),
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className={`tour-card${cardAtTop ? " tour-card-top" : ""}`}>
        <div className="tour-card-head">
          <span className="tour-badge">🆕 ما الجديد</span>
          <span className="tour-count">
            <bdi dir="ltr">
              {index + 1}/{steps.length}
            </bdi>
          </span>
        </div>
        <strong className="tour-title">{step.title}</strong>
        {step.before && (
          <p className="tour-before">
            <span>كان:</span> {step.before}
          </p>
        )}
        <p className="tour-after">
          <span>الآن:</span> {step.after}
        </p>
        <div className="tour-actions">
          <button type="button" className="dialog-primary" onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? "تم ✓" : "موافق"}
          </button>
          {!last && (
            <button type="button" className="text-action" onClick={finish}>
              تخطي الجولة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
