import type { DeviceReminder } from "@starnet/local-browser-plugin";

/**
 * ⏰ The reminders he sets in a device's browser (⏰ under 📌, his Oct 30 2026 ask) as the app shows them: «⏰
 * تذكيراتي» on the reminders page and a line on the device's card, until «تم». Kept on the phone by the plugin
 * (DeviceReminderStore); the notification rings by itself. Pure.
 */

export type { DeviceReminder };

function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «اليوم 21:00» · «غدًا 09:00» · «2026/11/02 09:00» - and «🔔 حان» once it rang (or its time passed). */
export function reminderWhenLabel(reminder: Pick<DeviceReminder, "at" | "fired">, now: number): string {
  const at = new Date(reminder.at);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const when =
    dayKey(at) === dayKey(today)
      ? `اليوم ${hm(at)}`
      : dayKey(at) === dayKey(tomorrow)
        ? `غدًا ${hm(at)}`
        : `${at.getFullYear()}/${String(at.getMonth() + 1).padStart(2, "0")}/${String(at.getDate()).padStart(2, "0")} ${hm(at)}`;
  return reminder.fired || reminder.at <= now ? `🔔 حان · ${when}` : when;
}

/** Due first (rung / past), then the soonest. */
export function sortReminders(list: DeviceReminder[], now: number): DeviceReminder[] {
  const due = (r: DeviceReminder) => r.fired || r.at <= now;
  return [...list].sort((a, b) => (due(a) !== due(b) ? (due(a) ? -1 : 1) : a.at - b.at));
}

/** Each device's next reminder (a due one first). */
export function remindersByAccount(list: DeviceReminder[], now: number): Record<string, DeviceReminder> {
  const out: Record<string, DeviceReminder> = {};
  for (const r of sortReminders(list, now)) if (r.accountId && !out[r.accountId]) out[r.accountId] = r;
  return out;
}
