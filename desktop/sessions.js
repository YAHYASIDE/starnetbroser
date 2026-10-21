// 🖥️ The device browsers' sign-in sessions on Windows - the same backup format as the phone
// (SessionsByAccount: device id -> url -> "name=value; name2=value2"), so a backup made on the
// phone signs the laptop's device browsers in, and one made here restores on the phone. Pure (no
// Electron) - tested in sessions.test.js. A port of the phone's CookieStringUtil.buildRestoreCookies.
const crypto = require("crypto");

const STARLINK_APEX = "starlink.com";
/** What a session is read from: the same fixed list as the phone (LocalBrowserPlugin). */
const SESSION_COOKIE_URLS = ["https://starlink.com", "https://www.starlink.com", "https://api.starlink.com", "https://auth.starlink.com"];
/** A restored sign-in must outlive the program being closed. */
const RESTORED_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MAIL_PREFIX = "mail:";

/** Only https pages of starlink.com and its subdomains (the phone's AllowedUrl). */
function isStarlinkUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host === STARLINK_APEX || host.endsWith(`.${STARLINK_APEX}`);
}

/** Each device's own browser storage, never shared with another device or the app itself. */
function partitionFor(accountId) {
  const id = String(accountId || "").trim();
  if (!id) throw new Error("accountId must not be blank");
  return `persist:device-${crypto.createHash("sha256").update(id).digest("hex")}`;
}

function splitPairs(combined) {
  if (typeof combined !== "string") return [];
  return combined
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitPair(pair) {
  const at = pair.indexOf("=");
  if (at <= 0) return null;
  return { name: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim() };
}

/**
 * The Electron cookies.set() calls that recreate one device's session (url -> combined string):
 * a cookie read at the apex root goes domain-wide (sent to www/api/auth again), a cookie seen only
 * on another host stays host-only there (keeping a deeper path), «__Host-» cookies never get a
 * domain and always Path=/, and every cookie is Secure with a long expiry. Non-https or unparsable
 * urls are skipped; the caller passes only allowed ones.
 */
function buildRestoreCookies(cookiesByUrl, apexHost, nowSeconds) {
  const out = [];
  if (!cookiesByUrl || typeof cookiesByUrl !== "object" || !apexHost) return out;
  const apex = apexHost.toLowerCase();
  const expirationDate = Math.floor(nowSeconds) + RESTORED_MAX_AGE_SECONDS;

  // host -> path -> pairs, in the export's own order.
  const byHost = new Map();
  for (const [url, combined] of Object.entries(cookiesByUrl)) {
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || !u.hostname) continue;
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    if (!byHost.has(host)) byHost.set(host, new Map());
    const paths = byHost.get(host);
    if (!paths.has(path)) paths.set(path, []);
    paths.get(path).push(...splitPairs(combined));
  }

  const apexRoot = new Set(byHost.get(apex)?.get("/") ?? []);
  const emitted = new Set();
  const push = (key, url, pair, extra) => {
    const parsed = splitPair(pair);
    if (!parsed || emitted.has(key)) return;
    emitted.add(key);
    out.push({ url, name: parsed.name, value: parsed.value, secure: true, expirationDate, ...extra });
  };

  // The apex first, so domain-wide cookies land before any host-only ones.
  for (const pair of apexRoot) {
    const hostOnly = pair.startsWith("__Host-");
    push(`${hostOnly ? apex : `.${apex}`}|/|${pair}`, `https://${apex}/`, pair, hostOnly ? { path: "/" } : { domain: apex, path: "/" });
  }

  for (const [host, paths] of byHost) {
    const hostRoot = new Set(paths.get("/") ?? []);
    for (const [path, pairs] of paths) {
      for (const pair of pairs) {
        const hostPrefixed = pair.startsWith("__Host-");
        if (!hostPrefixed && apexRoot.has(pair)) continue;
        if (path !== "/" && hostRoot.has(pair)) continue;
        const cookiePath = hostPrefixed ? "/" : path;
        push(`${host}|${cookiePath}|${pair}`, `https://${host}${path}`, pair, { path: cookiePath });
      }
    }
  }
  return out;
}

/** The Starlink devices of a backup's sessions: [{accountId, cookies}] with only Starlink urls.
 * The phone's «mail:<id>» mailbox sessions are left out (no mailbox on the laptop yet). */
function starlinkRestorePlan(sessions, nowSeconds) {
  const plan = [];
  if (!sessions || typeof sessions !== "object") return plan;
  for (const [accountId, byUrl] of Object.entries(sessions)) {
    if (!accountId.trim() || accountId.startsWith(MAIL_PREFIX)) continue;
    if (!byUrl || typeof byUrl !== "object") continue;
    const allowed = {};
    for (const [url, combined] of Object.entries(byUrl)) {
      if (isStarlinkUrl(url) && typeof combined === "string") allowed[url] = combined;
    }
    const cookies = buildRestoreCookies(allowed, STARLINK_APEX, nowSeconds);
    if (cookies.length) plan.push({ accountId, cookies });
  }
  return plan;
}

/** Electron's cookies of one url back into the phone's "name=value; ..." string ("" when none). */
function combineCookies(cookies) {
  return (cookies || [])
    .filter((c) => c && c.name)
    .map((c) => `${c.name}=${c.value ?? ""}`)
    .join("; ");
}

module.exports = {
  SESSION_COOKIE_URLS,
  STARLINK_APEX,
  RESTORED_MAX_AGE_SECONDS,
  isStarlinkUrl,
  partitionFor,
  buildRestoreCookies,
  starlinkRestorePlan,
  combineCookies,
};
