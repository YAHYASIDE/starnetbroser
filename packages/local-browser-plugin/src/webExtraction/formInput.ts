/**
 * ✍️ Setting a value into a form field so a *framework* (React/Angular, which Starlink and its
 * payment company use) treats it as a real person's edit - the point being the field's "valid"
 * state, and therefore a «Submit»/«Save» button's disabled flag, actually updates.
 *
 * Why it's needed: React keeps a hidden `_valueTracker` of the last value it saw. A plain
 * `input.value = x` (and even `execCommand("insertText")`) leaves that tracker stale, so React's
 * `onChange` never fires and the form stays "pristine" - the exact reason a filled OTP / card field
 * leaves «Submit» greyed out until the operator deletes a digit and retypes it by hand. The fix is
 * to write through the *prototype* value setter (which bypasses React's patched instance setter),
 * reset the tracker, then dispatch a genuine `InputEvent` plus key events, mimicking a keystroke.
 */

interface ValueTracker {
  setValue(value: string): void;
}

/** Writes `value` through the native prototype setter and resets React's value tracker, so the next
 * `input` event is seen as a real change (not a no-op against a stale tracked value). */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const own = Object.getOwnPropertyDescriptor(el, "value")?.set;
  const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")?.set;
  if (proto && own !== proto) proto.call(el, value);
  else if (own) own.call(el, value);
  else el.value = value;
  const tracker = (el as unknown as { _valueTracker?: ValueTracker })._valueTracker;
  // Stash a different value so React compares tracker != current and fires onChange on the event.
  if (tracker) tracker.setValue(value === "" ? "\u0000" : "");
}

/** Types `value` into `el` the way a person would: focus, set the value natively, then fire the
 * `input` / key / `change` events a framework re-validates on. Returns whether the value stuck. */
export function typeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  try {
    (el as HTMLInputElement).select?.();
  } catch {
    // some input types can't be selected - the value is replaced wholesale anyway
  }
  setNativeValue(el, value);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  const last = value.slice(-1) || "Unidentified";
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: last }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: last }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value === value;
}
