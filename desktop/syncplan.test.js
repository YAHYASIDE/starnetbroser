const test = require("node:test");
const assert = require("node:assert/strict");
const { SettleTracker, settleKey, hasColoredDot, hasRenewalDate, hasHomeRead, keepStoppedWithinRun, keepRestrictedWithinRun, isAccountPage } = require("./syncplan");

test("🔄 a page is read until it settled: same result twice, after its minimum, never past its maximum", () => {
  const t = new SettleTracker(600, 6000, 2);
  assert.equal(t.offer("a", true, 100), false);
  assert.equal(t.offer("a", true, 400), false); // stable but before the minimum
  assert.equal(t.offer("a", true, 700), true);
  const dots = new SettleTracker(0, 7000, 2);
  assert.equal(dots.offer("x", false, 100), false);
  assert.equal(dots.offer("x", false, 600), false); // not good yet (gray dot)
  assert.equal(dots.offer("", false, 7000), true); // time's up
});

test("🔄 the dot trace never makes two reads look different; empty = nothing", () => {
  assert.equal(settleKey({ a: 1, dotTrace: "t1" }), settleKey({ a: 1, dotTrace: "t2" }));
  assert.equal(settleKey({ dotTrace: "t" }), "");
  assert.equal(settleKey(null), "");
});

test("🔄 what each step waits for", () => {
  assert.equal(hasColoredDot({ dishStatus: "online" }), true);
  assert.equal(hasColoredDot({ dishStatus: "unknown" }), false);
  assert.equal(hasRenewalDate({ renewalDate: "2026/11/15" }), true);
  assert.equal(hasRenewalDate({ renewalDate: " " }), false);
  assert.equal(hasHomeRead({ travelRegistrationRequired: false }), true);
  assert.equal(hasHomeRead({}), false);
});

test("🔄 stopped / restricted seen once in a run are never undone by a later page", () => {
  assert.equal(keepStoppedWithinRun({ serviceStatus: "suspended" }, false), true);
  const later = { serviceStatus: "active", balance: 1 };
  assert.equal(keepStoppedWithinRun(later, true), true);
  assert.deepEqual(later, { balance: 1 });
  const noBanner = { isRestricted: false };
  assert.equal(keepRestrictedWithinRun(noBanner, true), true);
  assert.deepEqual(noBanner, {});
  assert.equal(keepRestrictedWithinRun({ isRestricted: true }, false), true);
  assert.equal(keepRestrictedWithinRun({}, false), false);
});

test("🔄 signed in = the account's own pages", () => {
  assert.equal(isAccountPage("https://starlink.com/account/home"), true);
  assert.equal(isAccountPage("https://www.starlink.com/account/billing"), true);
  assert.equal(isAccountPage("https://starlink.com/auth/login"), false);
  assert.equal(isAccountPage("https://evilstarlink.com/account"), false);
});
