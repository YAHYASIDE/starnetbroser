"use client";

import { useEffect } from "react";
import { latinNumberText } from "@/lib/latinDigits";

/**
 * 🔢 Number fields in Latin digits (0-9) on every page. On the operator's phone a
 * <input type="number"> showed Arabic digits (٥٤٨٧٦,٤٨) whatever its lang said (real screenshot),
 * so the app's number fields are text fields with the number keypad (inputMode="decimal"), and
 * this fixes whatever is typed in them - Arabic digits, «٫»/«,» as the decimal point - into
 * 54876.48 before the page reads it. Mounted once in the root layout.
 */
export function LatinDigitInputs() {
  useEffect(() => {
    // Runs before React's own listener (document is above the app's root): fixes the text with
    // the prototype setter, so React still sees a change and passes the fixed value to onChange.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const onInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.inputMode !== "decimal" || !setValue) return;
      const fixed = latinNumberText(input.value);
      if (fixed !== input.value) setValue.call(input, fixed);
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);
  return null;
}
