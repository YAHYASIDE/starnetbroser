/**
 * 📋 «لصق جلسة»: a Starlink session copied out of another browser (e.g. a Firefox clone made with
 * Infinite Clone, using the free «Cookie-Editor» add-on → Export) and pasted onto a device, so its
 * STAR NET browser opens already signed in. Accepts Cookie-Editor's JSON, a Netscape cookies.txt,
 * or a plain "name=value; name2=value2" header. Only starlink.com cookies are kept - anything else
 * pasted by mistake is ignored. Output: the same per-address cookie strings the encrypted backup
 * restores (importSessionCookies). Pure.
 */

export type PastedSessionResult = { ok: true; cookiesByUrl: Record<string, string>; count: number } | { ok: false; message: string };

const APEX = "starlink.com";

interface RawCookie {
  domain: string;
  path: string;
  name: string;
  value: string;
}

function isStarlinkHost(host: string): boolean {
  const h = host.replace(/^\./, "").toLowerCase();
  return h === APEX || h.endsWith(`.${APEX}`);
}

function fromJson(text: string): RawCookie[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { cookies?: unknown }).cookies) ? (parsed as { cookies: unknown[] }).cookies : null;
  if (!list) return null;
  return list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      domain: String(c.domain ?? c.host ?? APEX),
      path: String(c.path ?? "/"),
      name: String(c.name ?? ""),
      value: String(c.value ?? ""),
    }));
}

function fromNetscape(text: string): RawCookie[] | null {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#HttpOnly_/, ""))
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("\t"));
  if (rows.length === 0 || rows.some((r) => r.length < 7)) return null;
  return rows.map((r) => ({ domain: r[0]!, path: r[2] || "/", name: r[5]!, value: r[6]! }));
}

function fromHeader(text: string): RawCookie[] {
  return text
    .replace(/^cookie:\s*/i, "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .map((part) => {
      const i = part.indexOf("=");
      return { domain: APEX, path: "/", name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
    });
}

export function parsePastedSession(input: string): PastedSessionResult {
  const text = input.trim();
  if (!text) return { ok: false, message: "الصق الجلسة أولاً" };
  const raw = (text.startsWith("[") || text.startsWith("{") ? fromJson(text) : null) ?? (text.includes("\t") ? fromNetscape(text) : null) ?? fromHeader(text);
  const cookies = raw.filter((c) => c.name && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(c.name) && !/[;\r\n]/.test(c.value) && isStarlinkHost(c.domain));
  if (cookies.length === 0) {
    return { ok: false, message: raw.length ? "لا توجد كوكيز لـ starlink.com في المنسوخ - صدّرها وأنت على صفحة Starlink" : "لم أفهم المنسوخ - استعمل Export ثم JSON في Cookie-Editor" };
  }
  const byUrl = new Map<string, string[]>();
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, "").toLowerCase();
    const path = c.path.startsWith("/") ? c.path : "/";
    const url = `https://${host}${path}`;
    const pairs = byUrl.get(url) ?? [];
    pairs.push(`${c.name}=${c.value}`);
    byUrl.set(url, pairs);
  }
  return { ok: true, cookiesByUrl: Object.fromEntries(Array.from(byUrl, ([url, pairs]) => [url, pairs.join("; ")])), count: cookies.length };
}
