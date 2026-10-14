"use client";

import type { InputHTMLAttributes } from "react";

/** A native date picker that always SHOWS its value in Latin digits ("2026-09-25"): Android's
 * WebView formats <input type="date"> with the phone's language (Arabic-Indic digits) whatever
 * the page asks for, so the native text is hidden and the value is drawn on top instead. Tapping
 * still opens the phone's own date picker. */
export function DateInput({
  value,
  className,
  placeholder = "اختر التاريخ",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & { value: string }) {
  return (
    <span className="date-input">
      <input {...rest} type="date" lang="en-GB" dir="ltr" value={value} className={`${className ?? ""} date-input-native`.trim()} />
      <span className={`date-input-text${value ? "" : " date-input-empty"}`} aria-hidden="true">
        {value ? <bdi dir="ltr">{value}</bdi> : placeholder}
      </span>
    </span>
  );
}
