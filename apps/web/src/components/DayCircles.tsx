"use client";

import { useRef } from "react";

interface Props {
  counts: Map<number, number>;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  /** 📅 A long press on a day with devices opens its actions (DayActionsSheet). */
  onLongPressDay?: (day: number) => void;
}

const LONG_PRESS_MS = 550;

export function DayCircles({ counts, selectedDay, onSelectDay, onLongPressDay }: Props) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
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
    </div>
  );
}
