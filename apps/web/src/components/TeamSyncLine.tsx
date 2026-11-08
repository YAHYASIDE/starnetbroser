"use client";

import { useEffect, useRef, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { DEVICE_LINK_EVENT, DEVICE_LINK_NOW_EVENT } from "./DeviceLinkRunner";
import { browserLinkStorage, loadLinkConfig, loadLinkState, loadTeam } from "@/lib/deviceLink";
import { lastingOutOfSync, teamLineCaption, teamSyncRows, type MemberSync } from "@/lib/teamSyncStatus";

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 🟥 A red line on the right edge, on every page (his Nov 7 2026 ask), while a device of the link team has stayed out
 * of step with YAHYA for 2 minutes - tapped: which device, what it lacks against YAHYA, its last sync, and what to do.
 * Only the line (his Nov 8 2026 ask «أزل زر "2 أجهزة غير مكتملة"، اجعل الخط فقط» - the label covered the chat's field).
 * Below the green sync line, never over it.
 */
export function TeamSyncLine() {
  const [rows, setRows] = useState<MemberSync[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const since = useRef<Record<string, number>>({});

  useEffect(() => {
    const read = () => {
      const s = browserLinkStorage();
      const config = loadLinkConfig(s);
      if (!config?.enabled) {
        setShown([]);
        return;
      }
      const next = teamSyncRows(loadLinkState(s), loadTeam(s), config.memberId);
      const lasting = lastingOutOfSync(next, since.current, Date.now());
      since.current = lasting.since;
      setRows(next);
      setShown(lasting.ids);
    };
    read();
    const timer = window.setInterval(read, 5000);
    window.addEventListener(DEVICE_LINK_EVENT, read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(DEVICE_LINK_EVENT, read);
    };
  }, []);

  if (shown.length === 0) return null;
  const late = rows.filter((r) => shown.includes(r.id));
  return (
    <>
      <button type="button" className="team-line" onClick={() => setOpen(true)} aria-label={`${teamLineCaption(late.map((r) => r.name))} - اضغط للتفاصيل`}>
        <span className="team-line-track" aria-hidden="true" />
      </button>
      {open && (
        <PartySheet title="🔗 أجهزة الفريق غير المكتملة" onClose={() => setOpen(false)}>
          <p className="settings-hint">مقارنة بـ ⭐ YAHYA (الرئيسي). كل جهاز يحمل نسخة كاملة، وهذه الأجهزة ينقصها شيء منذ أكثر من دقيقتين.</p>
          <ul className="team-line-list">
            {late.map((r) => (
              <li key={r.id} className="team-line-item">
                <strong>
                  📱 {r.name}
                  {r.isMe ? " (هذا)" : ""}
                </strong>
                {!r.known ? (
                  <span className="settings-hint">لا تصل أرقامه - تطبيقه قديم: حدّثه وافتحه.</span>
                ) : (
                  <ul className="team-line-diffs">
                    {r.diffs.map((d) => (
                      <li key={d.label}>
                        {d.label}: <bdi dir="ltr">{d.theirs}</bdi> من <bdi dir="ltr">{d.main}</bdi>
                        {d.theirs < d.main ? ` (ينقصه ${d.main - d.theirs})` : ` (أكثر بـ ${d.theirs - d.main})`}
                      </li>
                    ))}
                  </ul>
                )}
                {r.at && (
                  <span className="settings-hint">
                    آخر مزامنة له: <bdi dir="ltr">{when(r.at)}</bdi>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="settings-hint">
            الحل: افتح التطبيق على ذلك الجهاز (محدَّثًا) واتركه دقيقة. إن بقي ناقصًا: فيه «✕ فك الربط» ثم «🔗 انضم برمز» برمز YAHYA -
            يُبنى من نسخة الفريق كاملة. وإن كان «أكثر»: انظر في YAHYA هل حذفٌ منه ينتظر موافقتك.
          </p>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" onClick={() => window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT))}>
              🔄 مزامنة الآن
            </button>
            <button type="button" className="text-action" onClick={() => window.location.assign("/settings#device-link")}>
              ⚙️ فتح ربط الأجهزة
            </button>
          </div>
        </PartySheet>
      )}
    </>
  );
}
