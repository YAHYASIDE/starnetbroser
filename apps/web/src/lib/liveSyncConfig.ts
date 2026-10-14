/**
 * ☁️ Where the live sync with the reps lives: the operator's own Firebase project (his Oct 2026
 * choice). He pastes its web `apiKey` and `projectId` in Settings; `spaceId` is a random name for
 * his data inside it. The rep's phone receives the same three inside his (encrypted) copy.
 * A phone setting (`starnet.*`, not in the backup) - never committed, never sent anywhere else.
 */

export interface LiveSyncConfig {
  apiKey: string;
  projectId: string;
  spaceId: string;
  enabled: boolean;
}

const KEY = "starnet.liveSync";

export function newSpaceId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ConfigCheck = { ok: true; apiKey: string; projectId: string } | { ok: false; message: string };

/** Light checks of what he pasted (the real test is «اختبار الاتصال»). */
export function checkConfigInput(apiKey: string, projectId: string): ConfigCheck {
  const key = apiKey.trim();
  const project = projectId.trim();
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) return { ok: false, message: "apiKey غير صحيح - يبدأ بـ AIza (من إعدادات المشروع ← تطبيقاتك)" };
  if (!/^[a-z0-9][a-z0-9-]{3,38}[a-z0-9]$/.test(project)) return { ok: false, message: "projectId غير صحيح - حروف إنجليزية صغيرة وأرقام و-" };
  return { ok: true, apiKey: key, projectId: project };
}

export function isUsableConfig(config: Partial<LiveSyncConfig> | null | undefined): config is LiveSyncConfig {
  return Boolean(config && config.apiKey && config.projectId && config.spaceId && checkConfigInput(config.apiKey, config.projectId).ok);
}

export function loadLiveSyncConfig(): LiveSyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LiveSyncConfig>) : null;
    return isUsableConfig(parsed) ? { ...parsed, enabled: parsed.enabled !== false } : null;
  } catch {
    return null;
  }
}

export function saveLiveSyncConfig(config: LiveSyncConfig | null): void {
  if (typeof window === "undefined") return;
  try {
    if (config) window.localStorage.setItem(KEY, JSON.stringify(config));
    else window.localStorage.removeItem(KEY);
  } catch {
    // a setting only
  }
}

/** What the rep's copy carries so his phone joins the same space. */
export type LiveSyncShare = Pick<LiveSyncConfig, "apiKey" | "projectId" | "spaceId">;
