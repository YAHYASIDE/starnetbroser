/**
 * "*" (or unset) must resolve to the boolean `true`, not the array
 * `["*"]` - the `cors` package treats an origin array as an exact-match
 * allowlist, so `["*"]` only matches a request whose Origin header is
 * literally the string "*" (never true for a real browser), silently
 * blocking every real cross-origin request instead of allowing them.
 */
export function resolveCorsOrigin(raw: string | undefined): boolean | string[] {
  if (!raw || raw === "*") return true;
  return raw.split(",").map((s) => s.trim());
}
