/**
 * A device card's gestures (the "التفاصيل" button's replacement): one tap (his Oct 2026 request
 * «تفتح كامل بضغطة واحدة») or a short long-press opens the full details, two quick taps open
 * "إضافة دفعة", three open "تعديل البيانات". Pure - the timing
 * rules; useCardGestures.ts wires them to pointer events.
 */

export type CardGesture = "details" | "payment" | "edit";

/** Held this long (ms) = a long press. */
export const LONG_PRESS_MS = 450;
/** A tap within this long (ms) of the previous one counts toward the same double / triple tap. */
export const TAP_GAP_MS = 320;
/** A finger that moved more than this (px) was scrolling, not tapping. */
export const MOVE_TOLERANCE_PX = 10;

/** What a run of quick taps asks for. */
export function gestureForTaps(count: number): CardGesture | null {
  if (count >= 3) return "edit";
  if (count === 2) return "payment";
  if (count === 1) return "details";
  return null;
}

/** Taps on the card's own buttons, links and fields keep their normal meaning. */
export function isInteractiveTarget(target: { closest?: (selector: string) => unknown } | null): boolean {
  return Boolean(target?.closest?.("button, a, input, select, textarea, label, [role='button'], [role='menuitem'], .dialog-backdrop"));
}
