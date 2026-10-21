// 🖥️ Which file of the app's static export answers a page address (app://starnet/clients/ →
// clients.html or clients/index.html). Pure - tested in paths.test.js. Never a file outside the
// export folder.
const path = require("path");

function candidates(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return [];
  }
  if (clean.includes("\0")) return [];
  clean = clean.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!clean.startsWith("/")) clean = `/${clean}`;
  if (clean === "/") return ["/index.html"];
  if (clean.endsWith("/")) return [`${clean}index.html`, `${clean.slice(0, -1)}.html`];
  if (path.posix.extname(clean)) return [clean];
  return [`${clean}.html`, `${clean}/index.html`, clean];
}

/** The absolute file for `urlPath` inside `root`, or null. `exists(file)` is fs.existsSync. */
function resolveFile(root, urlPath, exists) {
  const base = path.resolve(root);
  for (const c of candidates(urlPath)) {
    const file = path.resolve(base, `.${c}`);
    if (file !== base && !file.startsWith(base + path.sep)) continue;
    if (exists(file)) return file;
  }
  // An unknown page still opens the app (its own router shows the page or «not found»).
  const fallback = path.join(base, "index.html");
  return exists(fallback) ? fallback : null;
}

module.exports = { candidates, resolveFile };
