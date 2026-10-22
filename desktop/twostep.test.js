const test = require("node:test");
const assert = require("node:assert/strict");
const { fillScript, findMailCode, remember, isNew, appendCode, LOG_MAX } = require("./twostep");

test("🔑 the newest Starlink code on an Outlook page (sender, subject, preview lines)", () => {
  const page = ["Starlink", "Your Starlink verification code", "Use 482913 to sign in. 2026", "Starlink", "Your code", "111222"].join("\n");
  assert.equal(findMailCode(page), "482913");
  assert.equal(findMailCode("رمز التحقق الخاص بك ٤٨٢٩١٣"), "482913");
  assert.equal(findMailCode("Invoice 2026 total 12.50"), null);
  assert.equal(findMailCode("Starlink order\ncall 22123456"), null);
  assert.equal(findMailCode("Your code: 4821"), "4821");
  assert.equal(findMailCode("code 2025"), null);
});

test("🔑 an old code is never typed twice; at most 10 remembered", () => {
  let tried = [];
  for (let i = 0; i < 12; i++) tried = remember(tried, String(100000 + i));
  assert.equal(tried.length, 10);
  assert.equal(tried[0], "100011");
  assert.equal(isNew("100011", tried), false);
  assert.equal(isNew("999999", tried), true);
  assert.equal(isNew(null, tried), false);
});

test("🔑 the fill script embeds the code as a safe string literal", () => {
  assert.match(fillScript("482913"), /\("482913"\);$/);
  assert.doesNotMatch(fillScript("</script>"), /<\/script>/);
});

test("🔑 the laptop's codes log: one per device+code, 30 days, 200 at most", () => {
  const now = 40 * 24 * 3600_000;
  let log = appendCode([{ at: 0, accountId: "old", kind: "starlink", code: "1" }], { at: now, accountId: "d1", code: "482913" }, now);
  assert.deepEqual(log, [{ at: now, accountId: "d1", kind: "starlink", code: "482913" }]);
  log = appendCode(log, { at: now + 1, accountId: "d1", code: "482913" }, now + 1);
  assert.equal(log.length, 1);
  for (let i = 0; i < 250; i++) log = appendCode(log, { at: now + i, accountId: `d${i}`, code: String(i) }, now + i);
  assert.equal(log.length, LOG_MAX);
});
