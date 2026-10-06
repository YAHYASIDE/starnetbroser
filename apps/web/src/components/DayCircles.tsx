"use client";

import { useRef } from "react";
import { SPECIAL_BUCKETS, type DayKey } from "@/lib/dayBuckets";

interface Props {
  /** Days 1-28 (Starlink never renews later) + the four lists in place of 29-31 (dayBuckets.ts). */
  counts: Map<DayKey, number>;
  selectedDay: DayKey | null;
  onSelectDay: (day: DayKey | null) => void;
  /** 📅 A long press on a day with devices opens its actions (DayActionsSheet). */
  onLongPressDay?: (day: number) => void;
}

const LONG_PRESS_MS = 550;

export function DayCircles({ counts, selectedDay, onSelectDay, onLongPressDay }: Props) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The click that ends a long press must not also filter by that day.
  const longPressed = useRef(false);

  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <div className="day-circles" role="listbox" aria-label="تصفية حسب يوم التجديد">
      {days.map((day) => {
        const count = counts.get(day) ?? 0;
        const active = selectedDay === day;
        return (
          <button
            key={day}
            className={`day-circle ${active ? "day-circle-active" : ""} ${count === 0 ? "day-circle-empty" : ""}`}
            onPointerDown={() => {
              longPressed.current = false;
              if (!onLongPressDay || count === 0) return;
              cancelPress();
              timer.current = setTimeout(() => {
                longPressed.current = true;
                onLongPressDay(day);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (longPressed.current) {
                longPressed.current = false;
                return;
              }
              onSelectDay(active ? null : day);
            }}
            aria-pressed={active}
          >
            <span className="day-circle-num">{day}</span>
            {count > 0 && <span className="day-circle-count">{count}</span>}
          </button>
        );
      })}
      {SPECIAL_BUCKETS.map((bucket) => {
        const count = counts.get(bucket.key) ?? 0;
        const active = selectedDay === bucket.key;
        return (
          <button
            key={bucket.key}
            type="button"
            className={`day-circle day-circle-special ${active ? "day-circle-active" : ""} ${count === 0 ? "day-circle-empty" : ""}`}
            title={bucket.label}
            aria-label={bucket.label}
            aria-pressed={active}
            data-tour={bucket.key === "unknown" ? "day-specials" : undefined}
            onClick={() => onSelectDay(active ? null : bucket.key)}
          >
            <span className="day-circle-num" aria-hidden="true">{bucket.icon}</span>
            {count > 0 && <span className="day-circle-count">{count}</span>}
          </button>
        );
      })}
      <p className="day-circles-legend">
        {SPECIAL_BUCKETS.map((b) => (
          <span key={b.key}>
            {b.icon} {b.label}
          </span>
        ))}
      </p>
    </div>
  );
}
