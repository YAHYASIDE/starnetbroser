/**
 * 🔔 Is the phone's notification reader (bank / KAST notifications) really working? «Notification
 * access» on is not enough: after an app update some phones (HONOR, Huawei…) never bind the reader
 * again - nothing was read from 15:21 on Oct 10 2026 while access still showed on (his report:
 * Sedad and Bankily both missed). Pure.
 */

export interface ReaderStatus {
  enabled: boolean;
  connected?: boolean;
  lastSeenAt?: number;
}

/** off = access is off; down = access on but Android has the reader unbound; null = fine / not known. */
export function readerProblem(status: ReaderStatus | null): "off" | "down" | null {
  if (!status) return null;
  if (!status.enabled) return "off";
  return status.connected === false ? "down" : null;
}

/** «آخر إشعار وصل: اليوم 15:21» / «… 09/10 22:29» / «لم يصل أي إشعار بعد». */
export function lastSeenText(lastSeenAt: number | undefined, now = new Date()): string {
  if (!lastSeenAt) return "لم يصل أي إشعار بعد";
  const d = new Date(lastSeenAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return `آخر إشعار وصل: ${sameDay ? "اليوم" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`} ${time}`;
}
