"use client";

import { useRef } from "react";
import { canGoForward, RANGE_SPANS, rangeForDay, rangeLabel, rangeWindow, shiftRange, type ReportRange } from "@/lib/reportRange";

/** 📅 The reports' one period bar, fixed on top (his Oct 22 2026 ask): يوم / أسبوع / شهر, ‹ the one
 * before (أمس…) and › the next, and 📅 to open a chosen day. */
export function ReportRangeBar({ range, today, onChange }: { range: ReportRange; today: string; onChange: (next: ReportRange) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const { from, to } = rangeWindow(range);
  const forward = canGoForward(range, today);
  return (
    <div className="report-range" data-tour="report-range">
      <div className="report-range-spans" role="group" aria-label="طول الفترة">
        {RANGE_SPANS.map(({ span, label }) => (
          <button
            key={span}
            type="button"
            className={`report-range-span${range.span === span ? " is-active" : ""}`}
            aria-pressed={range.span === span}
            onClick={() => onChange({ ...range, span })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="report-range-nav">
        <button type="button" className="report-range-arrow" aria-label="الفترة السابقة" onClick={() => onChange(shiftRange(range, -1, today))}>
          ›
        </button>
        <span className="report-range-label" title={from === to ? from : `${from} → ${to}`}>
          {rangeLabel(range, today)}
        </span>
        <button type="button" className="report-range-arrow" aria-label="الفترة التالية" disabled={!forward} onClick={() => onChange(shiftRange(range, 1, today))}>
          ‹
        </button>
        <label className="report-range-pick" aria-label="اختر يومًا">
          📅
          <input
            ref={picker}
            type="date"
            max={today}
            value={range.end}
            onChange={(e) => e.target.value && onChange(rangeForDay(e.target.value, today))}
          />
        </label>
      </div>
    </div>
  );
}
