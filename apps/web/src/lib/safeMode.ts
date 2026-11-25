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
/** 🛟 Set by the boot script after 3 quick opens: ASK him (his Nov 25 2026 «لا تفعل إلا بإذن مني»). */
export const SAFE_ASK_KEY = "starnet.safeAsk";
/** The parts he stopped himself (outside the safe mode) - they stay stopped until he starts them. */
export const PARTS_OFF_KEY = "starnet.partsOff";
export const SAFE_MODE_EVENT = "starnet:safe-mode";

export const BOOTS_TO_SAFE = 2;
export const BOOTS_WINDOW_MS = 3 * 60_000;
/** An open that stays up this long is a good one: the counter of unfinished opens is cleared (markBootOk). */
export const BOOT_OK_AFTER_MS = 20_000;
/** Set with the automatic entry, so the banner can say why (cleared when he ends the safe mode). */
export const SAFE_AUTO_KEY = "starnet.safeAuto";
/** The automatic backups wait this long after the app opens. */
export const BACKUP_AFTER_OPEN_MS = 2 * 60_000;

/** The boots kept (newest last) and whether this one should ASK about the safe mode. Pure. */
export function nextBoots(previous: number[], now: number): { boots: number[]; safe: boolean } {
  const boots = [...previous.filter((t) => Number.isFinite(t) && now - t < BOOTS_WINDOW_MS && t <= now), now].slice(-BOOTS_TO_SAFE);
  return { boots, safe: boots.length >= BOOTS_TO_SAFE };
}

/**
 * Runs first in the page as plain JS (no module) - the same rule as nextBoots. His Nov 26 2026 «اجعلني أدخل تلقائيًا
 * بالوضع الآمن، فإن دخلت عاديًا لا يعمل»: two opens in a row that did not stay up (each is counted here and cleared by
 * markBootOk after 20 s) turn the safe mode ON by itself - no background part runs, so the app opens. It never TURNS IT
 * OFF and never touches the parts he stopped himself (his Nov 25 «لا يتوقف إلا بإذن مني»).
 */
export const SAFE_MODE_BOOT_SCRIPT = `try{var n=Date.now(),b=JSON.parse(localStorage.getItem("${BOOTS_KEY}")||"[]");if(!Array.isArray(b))b=[];b=b.filter(function(t){return typeof t==="number"&&n-t<${BOOTS_WINDOW_MS}&&t<=n});b.push(n);b=b.slice(-${BOOTS_TO_SAFE});localStorage.setItem("${BOOTS_KEY}",JSON.stringify(b));if(b.length>=${BOOTS_TO_SAFE}&&localStorage.getItem("${SAFE_MODE_KEY}")!=="1"){localStorage.setItem("${SAFE_MODE_KEY}","1");localStorage.setItem("${SAFE_AUTO_KEY}","1");localStorage.removeItem("${SAFE_ALLOWED_KEY}");}}catch(e){}`;

/** The app stayed up: the next open is not a «second in a row». */
export function markBootOk(): void {
  try {
    window.localStorage.removeItem(BOOTS_KEY);
  } catch {
    // stays
  }
}

/** Why the safe mode is on: it entered by itself after two unfinished opens. */
export function safeEnteredByItself(): boolean {
  return read(SAFE_AUTO_KEY) === "1";
}

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readList(key: string): string[] {
  try {
    const v = JSON.parse(read(key) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // stays
  }
}

const changed = () => window.dispatchEvent(new Event(SAFE_MODE_EVENT));

export function safeModeOn(): boolean {
  return read(SAFE_MODE_KEY) === "1";
}

/** 3 quick opens: waiting for his «نعم / لا». */
export function safeAskPending(): boolean {
  return read(SAFE_ASK_KEY) === "1" && !safeModeOn();
}

/** Only from his own tap. Off: every part runs again except the ones he stopped himself. */
export function setSafeMode(on: boolean): void {
  write(SAFE_ASK_KEY, null);
  write(BOOTS_KEY, null);
  write(SAFE_AUTO_KEY, null);
  if (on) {
    write(SAFE_MODE_KEY, "1");
  } else {
    write(SAFE_MODE_KEY, null);
    write(SAFE_ALLOWED_KEY, null);
  }
  changed();
}

/** His answer «لا»: nothing changes, everything runs as he left it. */
export function dismissSafeAsk(): void {
  write(SAFE_ASK_KEY, null);
  write(BOOTS_KEY, null);
  changed();
}

export function allowedInSafeMode(): string[] {
  return readList(SAFE_ALLOWED_KEY);
}

export function partsOff(): string[] {
  return readList(PARTS_OFF_KEY);
}

/** Pure: does a part run, from the saved state. */
export function partRunsIn(state: { safe: boolean; ask: boolean; allowed: string[]; off: string[] }, part: string): boolean {
  if (state.ask) return false;
  if (state.safe) return state.allowed.includes(part);
  return !state.off.includes(part);
}

/** May this background part run now. */
export function partRuns(part: string): boolean {
  return partRunsIn({ safe: safeModeOn(), ask: safeAskPending(), allowed: allowedInSafeMode(), off: partsOff() }, part);
}

/** His tap on one part: start / stop it - and it stays so until his next tap (in or outside the safe mode). */
export function setPartRunning(part: string, run: boolean): void {
  if (safeModeOn()) {
    const now = allowedInSafeMode().filter((p) => p !== part);
    write(SAFE_ALLOWED_KEY, JSON.stringify(run ? [...now, part] : now));
  } else {
    const now = partsOff().filter((p) => p !== part);
    write(PARTS_OFF_KEY, JSON.stringify(run ? now : [...now, part]));
  }
  changed();
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
