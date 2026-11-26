"use client";

import { useMemo, useState } from "react";
import { activityLine, dayKey, filterLog, LOG_CATEGORIES, logSummary, type LogCategory, type TeamActivity } from "@/lib/teamActivity";

const KINDS: { id: TeamActivity["kind"] | "all"; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "add", label: "➕ إضافة" },
  { id: "edit", label: "✏️ تعديل" },
  { id: "del", label: "🗑️ حذف" },
];

/**
 * 📜 «سجل العمليات» (his Nov 26 2026): everything the team did that reached this phone - additions, edits, deletions
 * (🗑️ in red), D, rates, alerts - with a search by day, by kind, by type and by words. lib/teamActivity.ts (`filterLog`).
 */
export function TeamLog({ log }: { log: TeamActivity[] }) {
  const [day, setDay] = useState("");
  const [kind, setKind] = useState<TeamActivity["kind"] | "all">("all");
  const [cat, setCat] = useState<LogCategory>("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => filterLog(log, { day, kind, cat, q }), [log, day, kind, cat, q]);
  const today = dayKey(new Date().toISOString());
  const dels = log.filter((a) => a.kind === "del" && dayKey(a.at) === today).length;
  return (
    <details className="device-link-conflicts device-link-log team-log">
      <summary>
        📜 سجل العمليات ({log.length}){dels > 0 && <span className="team-log-del-badge"> · 🗑️ {dels} حذف اليوم</span>}
      </summary>
      <div className="team-log-filters">
        <input className="search-input" type="search" placeholder="🔎 ابحث: اسم، مبلغ، عضو…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="team-log-day">
          <input className="search-input" type="date" dir="ltr" value={day} onChange={(e) => setDay(e.target.value)} aria-label="اليوم" />
          <button type="button" className={`tool-chip${day === today ? " tool-chip-on" : ""}`} onClick={() => setDay(today)}>
            اليوم
          </button>
          <button type="button" className={`tool-chip${day === "" ? " tool-chip-on" : ""}`} onClick={() => setDay("")}>
            كل الأيام
          </button>
        </div>
        <div className="tool-chips">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={`tool-chip${kind === k.id ? " tool-chip-on" : ""}`} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="tool-chips">
          {LOG_CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`tool-chip${cat === c.id ? " tool-chip-on" : ""}`} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="settings-hint">{logSummary(list)}</p>
      {list.length === 0 ? (
        <p className="settings-hint">لا توجد عمليات بهذا الاختيار.</p>
      ) : (
        <ul className="team-log-list">
          {list.slice(0, 200).map((a, i) => (
            <li key={`${a.at}|${a.k}|${a.r}|${i}`} className={a.kind === "del" ? "team-log-del" : undefined}>
              <b>{a.by}</b>: {activityLine(a)}
              <small>
                <bdi dir="ltr">{new Date(a.at).toLocaleString("en-GB")}</bdi>
              </small>
            </li>
          ))}
        </ul>
      )}
      {list.length > 200 && <p className="settings-hint">يظهر أحدث 200 فقط - ضيّق البحث باليوم أو الكلمات.</p>}
    </details>
  );
}
