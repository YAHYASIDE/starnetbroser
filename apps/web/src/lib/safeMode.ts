/**
 * 🛟 «الوضع الآمن» (his Nov 18 2026 report: «هاتفي الرئيسي بطيء جدًا… يفتح التطبيق ويبقى متجمدًا على الرئيسية، وعندما أضغط
 * أي شيء يخرجني»). Opened 3 times within 3 minutes = it froze → the app starts with **no background job** (team link,
 * chat, WhatsApp, reps' automatic copies / statements, bots, backups…) so he can use it, and starts them one by one from
 * the banner to see which one freezes it. The boots are counted by a tiny script before anything else runs
 * (`SAFE_MODE_BOOT_SCRIPT`, app/layout.tsx), so even a frozen start counts. Phone-only keys.
 */

export const SAFE_MODE_KEY = "starnet.safeMode";
export const BOOTS_KEY = "starnet.boots";
/** The background parts he started again inside the safe mode. */
export const SAFE_ALLOWED_KEY = "starnet.safeAllowed";
export const SAFE_MODE_EVENT = "starnet:safe-mode";

export const BOOTS_TO_SAFE = 3;
export const BOOTS_WINDOW_MS = 3 * 60_000;
/** The automatic backups wait this long after the app opens. */
export const BACKUP_AFTER_OPEN_MS = 2 * 60_000;

/** The boots kept (newest last) and whether this one starts in the safe mode. Pure. */
export function nextBoots(previous: number[], now: number): { boots: number[]; safe: boolean } {
  const boots = [...previous.filter((t) => Number.isFinite(t) && now - t < BOOTS_WINDOW_MS && t <= now), now].slice(-BOOTS_TO_SAFE);
  return { boots, safe: boots.length >= BOOTS_TO_SAFE };
}

/** Runs first in the page as plain JS (no module) - the same rule as nextBoots. */
export const SAFE_MODE_BOOT_SCRIPT = `try{var n=Date.now(),b=JSON.parse(localStorage.getItem("${BOOTS_KEY}")||"[]");if(!Array.isArray(b))b=[];b=b.filter(function(t){return typeof t==="number"&&n-t<${BOOTS_WINDOW_MS}&&t<=n});b.push(n);b=b.slice(-${BOOTS_TO_SAFE});localStorage.setItem("${BOOTS_KEY}",JSON.stringify(b));if(b.length>=${BOOTS_TO_SAFE}){localStorage.setItem("${SAFE_MODE_KEY}","1");localStorage.removeItem("${SAFE_ALLOWED_KEY}");}}catch(e){}`;

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeModeOn(): boolean {
  return read(SAFE_MODE_KEY) === "1";
}

export function setSafeMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SAFE_MODE_KEY, "1");
    else {
      window.localStorage.removeItem(SAFE_MODE_KEY);
      window.localStorage.removeItem(SAFE_ALLOWED_KEY);
      window.localStorage.removeItem(BOOTS_KEY);
    }
  } catch {
    // stays
  }
  window.dispatchEvent(new Event(SAFE_MODE_EVENT));
}

export function allowedInSafeMode(): string[] {
  try {
    const v = JSON.parse(read(SAFE_ALLOWED_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function allowInSafeMode(part: string): void {
  try {
    const now = allowedInSafeMode();
    if (!now.includes(part)) window.localStorage.setItem(SAFE_ALLOWED_KEY, JSON.stringify([...now, part]));
  } catch {
    // stays
  }
  window.dispatchEvent(new Event(SAFE_MODE_EVENT));
}

/** May this background part run now. */
export function partRuns(part: string): boolean {
  return !safeModeOn() || allowedInSafeMode().includes(part);
}

/** The background parts, in his words, in the order to try them. */
export const BACKGROUND_PARTS: { id: string; label: string }[] = [
  { id: "telegram", label: "🤖 البوتات (تيليغرام)" },
  { id: "link", label: "👥 ربط الفريق" },
  { id: "chat", label: "💬 الدردشة والمكالمات" },
  { id: "whatsapp", label: "💬 واتساب (الإيميلات والوكيل)" },
  { id: "reps", label: "🤝 نسخ المندوبين وكشوفهم التلقائية وتحذيراتهم" },
  { id: "receipts", label: "🧾 قارئ الإيصالات" },
  { id: "browser", label: "🌐 أعمال متصفحات الأجهزة" },
];
