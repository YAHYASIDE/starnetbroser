/**
 * "تحديث جديد متوفر": every staging APK is published to the public staging-latest GitHub release,
 * whose body names the commit it was built from (see .github/workflows/preview.yml). The app knows
 * its own commit (NEXT_PUBLIC_COMMIT_SHA, baked in at build time), so comparing the two says
 * whether a newer APK exists - no server of our own, no account, nothing sent but a plain GET.
 */

export const RELEASE_API_URL = "https://api.github.com/repos/YAHYASIDE/starnetbroser/releases/tags/staging-latest";
export const APK_DOWNLOAD_URL = "https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Browser-debug.apk";

export const CURRENT_COMMIT = process.env.NEXT_PUBLIC_COMMIT_SHA || "dev";

/** The full or short commit SHA named in the release body, or null. */
export function parseReleaseCommit(body: string | null | undefined): string | null {
  const match = /commit\s+([0-9a-f]{7,40})/i.exec(body ?? "");
  return match ? match[1]!.toLowerCase() : null;
}

/** True only when both commits are known and differ - a dev build, or a release whose commit
 * can't be read, never claims an update. */
export function isUpdateAvailable(currentCommit: string, releaseCommit: string | null): boolean {
  if (!releaseCommit || !/^[0-9a-f]{7,40}$/i.test(currentCommit)) return false;
  const a = currentCommit.toLowerCase();
  const b = releaseCommit.toLowerCase();
  return !(a.startsWith(b) || b.startsWith(a));
}

export type UpdateCheckResult =
  | { status: "update"; releaseCommit: string; publishedAt?: string }
  | { status: "current" }
  | { status: "unknown"; message: string };

const LAST_CHECK_KEY = "starnet.updateCheckAt";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Automatic checks run at most every 6 hours; a manual check from الإعدادات always runs. */
export function shouldAutoCheck(now = Date.now()): boolean {
  try {
    const last = Number(window.localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    return !Number.isFinite(last) || now - last >= CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(RELEASE_API_URL, { headers: { Accept: "application/vnd.github+json" }, signal: controller.signal });
    clearTimeout(timer);
    try {
      window.localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {
      // Storage unavailable - just means the next launch checks again.
    }
    if (!response.ok) return { status: "unknown", message: `تعذر التحقق (${response.status})` };
    const release = (await response.json()) as { body?: string; published_at?: string; assets?: { updated_at?: string }[] };
    const releaseCommit = parseReleaseCommit(release.body);
    if (isUpdateAvailable(CURRENT_COMMIT, releaseCommit)) {
      return { status: "update", releaseCommit: releaseCommit!, publishedAt: release.assets?.[0]?.updated_at ?? release.published_at };
    }
    return releaseCommit ? { status: "current" } : { status: "unknown", message: "تعذر قراءة رقم الإصدار" };
  } catch {
    return { status: "unknown", message: "تعذر الاتصال للتحقق من التحديثات" };
  }
}
