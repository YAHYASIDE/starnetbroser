"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { gestureForTaps, isInteractiveTarget, LONG_PRESS_MS, MOVE_TOLERANCE_PX, TAP_GAP_MS, type CardGesture } from "@/lib/cardGestures";

/** Pointer handlers for a device card - see cardGestures.ts. */
export function useCardGestures(onGesture: (gesture: CardGesture) => void) {
  const press = useRef<{ x: number; y: number; timer: number; long: boolean } | null>(null);
  const taps = useRef({ count: 0, timer: 0 });
  const handler = useRef(onGesture);
  handler.current = onGesture;

  useEffect(() => () => {
    if (press.current) window.clearTimeout(press.current.timer);
    window.clearTimeout(taps.current.timer);
  }, []);

  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || isInteractiveTarget(event.target as HTMLElement)) return;
      cancelPress();
      const state = { x: event.clientX, y: event.clientY, long: false, timer: 0 };
      state.timer = window.setTimeout(() => {
        state.long = true;
        taps.current.count = 0;
        handler.current("details");
      }, LONG_PRESS_MS);
      press.current = state;
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const state = press.current;
      if (state && Math.hypot(event.clientX - state.x, event.clientY - state.y) > MOVE_TOLERANCE_PX) cancelPress();
    },
    onPointerUp() {
      const state = press.current;
      cancelPress();
      if (!state || state.long) return;
      window.clearTimeout(taps.current.timer);
      taps.current.count += 1;
      taps.current.timer = window.setTimeout(() => {
        const gesture = gestureForTaps(taps.current.count);
        taps.current.count = 0;
        if (gesture) handler.current(gesture);
      }, TAP_GAP_MS);
    },
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    // The phone's own long-press menu (copy / select) would cover the details.
    onContextMenu(event: PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) {
      if (!isInteractiveTarget(event.target as HTMLElement)) event.preventDefault();
    },
  };
}
