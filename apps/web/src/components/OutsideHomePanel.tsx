"use client";

import type { StarlinkAccountSummary } from "@starnet/shared";
import { arabicDate } from "@/lib/partyMovements";
import { daysLeftLabel, type OutsideHomeDay } from "@/lib/outsideHome";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/**
 * 🌍 «خارج البلد»: day after day, the devices whose travel allowance runs out that day - so each one
 * is moved to global roaming before Starlink restricts it (his Oct 21 2026 ask). Tapping a device
 * takes him to its card below.
 */
export function OutsideHomePanel({
  days,
  repName,
  onPick,
}: {
  days: OutsideHomeDay[];
  repName: (account: StarlinkAccountSummary) => string | undefined;
  onPick: (account: StarlinkAccountSummary) => void;
}) {
  if (days.length === 0) return <p className="settings-hint">🌍 لا جهاز خارج بلده الآن (حسب آخر قراءة لصفحة الاشتراك).</p>;
  return (
    <div className="outside-home-days">
      <p className="settings-hint">فعّل «التجوال العالمي» للجهاز قبل يومه حتى لا يتوقف. الأيام من آخر قراءة لصفحة الاشتراك - حدّث الجهاز لتتجدد.</p>
      {days.map((day) => {
        const [y, m, d] = day.date.split("-").map(Number);
        const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
        const urgent = day.daysLeft <= 2;
        return (
          <div key={day.date} className={`outside-home-day${day.accounts.length ? "" : " is-empty"}${urgent && day.accounts.length ? " is-urgent" : ""}`}>
            <div className="outside-home-day-head">
              <strong>{day.daysLeft < 0 ? "⛔ انتهت أيامها" : `${weekday} ${arabicDate(day.date)}`}</strong>
              <span>{day.daysLeft < 0 ? "" : daysLeftLabel(day.daysLeft)}</span>
              {day.accounts.length > 0 && <span className="outside-home-count">{day.accounts.length}</span>}
            </div>
            {day.accounts.map((a) => {
              const rep = repName(a);
              return (
                <button key={a.id} type="button" className="outside-home-device" onClick={() => onPick(a)}>
                  <span>🌍 {a.name}</span>
                  <small>
                    {[a.planName, a.outsideHome?.allowanceDays ? `من ${a.outsideHome.allowanceDays} يومًا` : "", rep ? `🤝 ${rep}` : ""].filter(Boolean).join(" · ")}
                  </small>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
