/**
 * 🔑 Starlink's sign-in ticket in a device's cookies (moved out of teamSessions.ts so the reps' files use the same test -
 * his Nov 15 2026 report «كل المسؤولين والمندوبين عندما يسجّلون جهازًا لا يأتيني صالحًا، تأتي الجلسة غير مسجّلة»).
 * The ASP.NET cookies `Starlink.Com.Access.V1` (or its chunks `…V1C1`, `…V1C2`) and `Starlink.Com.Sso`; a ticket under
 * another name still shows by its size: no visit leaves a 1,000-character cookie.
 */

export const SIGN_IN_COOKIE = /^starlink\.com\.(access|sso)/i;
export const TICKET_CHARS = 1000;

/**
 * Whether these cookies carry a Starlink sign-in - not just what any visit leaves (his Nov 5 2026 report: a device opened
 * once while signed out has a few cookies too). `cookies`: address → its cookie line («a=1; b=2») - or name → value.
 */
export function isSignedInSession(cookies: Record<string, string> | undefined): boolean {
  if (!cookies) return false;
  for (const [key, value] of Object.entries(cookies)) {
    if (!value || !value.trim()) continue;
    if (SIGN_IN_COOKIE.test(key.trim())) return true;
    for (const part of value.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const v = part.slice(eq + 1).trim();
      if (v && (SIGN_IN_COOKIE.test(part.slice(0, eq).trim()) || v.length >= TICKET_CHARS)) return true;
    }
  }
  return false;
}

/** One cookie as the report shows it: its name and size only - never its value. */
export interface CookieName {
  name: string;
  chars: number;
  ticket: boolean;
}

/**
 * 🔍 «تقرير الجلسة»: per address, each cookie's NAME and length (no value, nothing secret) and whether a sign-in ticket
 * is there - what he sends so the cause of a session arriving signed out can be found.
 */
export function sessionReport(cookies: Record<string, string> | undefined): { signedIn: boolean; lines: string[] } {
  const lines: string[] = [];
  for (const [url, line] of Object.entries(cookies ?? {})) {
    const names: CookieName[] = [];
    for (const part of (line ?? "").split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      names.push({ name, chars: v.length, ticket: Boolean(v) && (SIGN_IN_COOKIE.test(name) || v.length >= TICKET_CHARS) });
    }
    lines.push(`${url.replace(/^https:\/\//, "")}: ${names.length ? names.map((n) => `${n.ticket ? "🔑" : ""}${n.name}(${n.chars})`).join(" ") : "-"}`);
  }
  if (!lines.length) lines.push("لا كوكيز أبدًا (لم يُفتح هذا الجهاز على هذا الهاتف)");
  return { signedIn: isSignedInSession(cookies), lines };
}
