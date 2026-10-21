const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { candidates, resolveFile } = require("./paths");

const root = path.resolve("/srv/web");
const files = new Set(["index.html", "clients.html", "settings/index.html", "_next/static/a.js"].map((f) => path.join(root, f)));
const exists = (f) => files.has(f);

test("a page address finds its file in the static export", () => {
  assert.strictEqual(resolveFile(root, "/", exists), path.join(root, "index.html"));
  assert.strictEqual(resolveFile(root, "/clients/", exists), path.join(root, "clients.html"));
  assert.strictEqual(resolveFile(root, "/clients?x=1", exists), path.join(root, "clients.html"));
  assert.strictEqual(resolveFile(root, "/settings/", exists), path.join(root, "settings", "index.html"));
  assert.strictEqual(resolveFile(root, "/_next/static/a.js", exists), path.join(root, "_next", "static", "a.js"));
});

test("never a file outside the export; an unknown page opens the app", () => {
  assert.strictEqual(resolveFile(root, "/../../etc/passwd", exists), path.join(root, "index.html"));
  assert.strictEqual(resolveFile(root, "/%2e%2e/%2e%2e/secret", exists), path.join(root, "index.html"));
  assert.deepStrictEqual(candidates("/%E0%A4%A"), []);
  assert.strictEqual(resolveFile(root, "/nope/", exists), path.join(root, "index.html"));
});
