"use client";

interface Props {
  counts: Map<number, number>;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
}

export function DayCircles({ counts, selectedDay, onSelectDay }: Props) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="day-circles" role="listbox" aria-label="تصفية حسب يوم التجديد">
      {days.map((day) => {
        const count = counts.get(day) ?? 0;
        const active = selectedDay === day;
        return (
          <button
            key={day}
            className={`day-circle ${active ? "day-circle-active" : ""} ${count === 0 ? "day-circle-empty" : ""}`}
            onClick={() => onSelectDay(active ? null : day)}
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
