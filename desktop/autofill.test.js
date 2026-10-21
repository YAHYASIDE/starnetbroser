const test = require("node:test");
const assert = require("node:assert/strict");
const { literal, loginScript } = require("./autofill");

test("nothing to fill -> no script", () => {
  assert.equal(loginScript("", ""), null);
  assert.equal(loginScript("  ", undefined), null);
});

test("values are embedded safely", () => {
  assert.equal(literal('a"</script>\u2028'), '"a\\"\\u003c/script\\u003e\\u2028"');
  const s = loginScript(" fake@example.com ", "p'ass");
  assert.ok(s.endsWith('("fake@example.com","p\'ass");'));
  // It is a valid script.
  assert.doesNotThrow(() => new Function(s));
});
