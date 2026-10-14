"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { PartySheet } from "./AccountsSection";
import {
  drainAppEvents,
  EVENT_LOG_CHANGED,
  eventTitle,
  loadEventLog,
  markRead,
  removeEvent,
  saveEventLog,
  unreadCount,
  type LoggedEvent,
} from "@/lib/eventLog";

function whenLabel(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 🔔 Every notification the app posted, kept until he deletes it (lib/eventLog.ts). */
export function NotificationsBell() {
  const router = useRouter();
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => void drainAppEvents().then(setEvents);
    const reload = () => setEvents(loadEventLog());
    refresh();
    window.addEventListener(EVENT_LOG_CHANGED, reload);
    let handle: { remove: () => void } | undefined;
    let alive = true;
    App.addListener("resume", refresh)
      .then((h) => {
        if (alive) handle = h;
        else void h.remove();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      window.removeEventListener(EVENT_LOG_CHANGED, reload);
      handle?.remove();
    };
  }, []);

  function update(next: LoggedEvent[]) {
    setEvents(next);
    saveEventLog(next);
  }

  const unread = unreadCount(events);

  return (
    <>
      <button type="button" className="header-more header-bell" data-tour="bell" aria-label={`الإشعارات${unread ? ` (${unread} جديد)` : ""}`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <b className="header-bell-badge">{unread > 99 ? "99+" : unread}</b>}
      </button>
      {open && (
        <PartySheet title={`🔔 الإشعارات (${events.length})`} onClose={() => setOpen(false)}>
          {events.length === 0 ? (
            <p className="sync-choice-hint">لا إشعارات بعد - كل إشعار يصل يبقى هنا حتى تحذفه أنت.</p>
          ) : (
            <>
              <div className="settings-actions">
                {unread > 0 && (
                  <button type="button" className="text-action" onClick={() => update(markRead(events))}>
                    ✓ قراءة الكل
                  </button>
                )}
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    if (window.confirm("مسح كل الإشعارات؟")) update([]);
                  }}
                >
                  🗑 مسح الكل
                </button>
              </div>
              <div className="event-log">
                {events.map((event) => {
                  const { title, body } = eventTitle(event);
                  return (
                    <div key={event.id} className={`event-log-row${event.read ? "" : " event-log-unread"}`}>
                      <button
                        type="button"
                        className="event-log-open"
                        onClick={() => {
                          update(markRead(events, event.id));
                          setOpen(false);
                          router.push(event.route || "/");
                        }}
                      >
                        <strong>{title}</strong>
                        {body && <span>{body}</span>}
                        <small dir="ltr">{whenLabel(event.at)}</small>
                      </button>
                      <button type="button" className="event-log-delete" aria-label="حذف الإشعار" onClick={() => update(removeEvent(events, event.id))}>
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </PartySheet>
      )}
    </>
  );
}
