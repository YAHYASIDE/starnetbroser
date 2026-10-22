const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRestoreCookies, starlinkRestorePlan, partitionFor, isStarlinkUrl, combineCookies, RESTORED_MAX_AGE_SECONDS } = require("./sessions");

const NOW = 1_700_000_000;

test("apex root cookies go domain-wide; a __Host- cookie stays host-only with Path=/", () => {
  const out = buildRestoreCookies({ "https://starlink.com": "a=1; __Host-b=2" }, "starlink.com", NOW);
  assert.deepEqual(out, [
    { url: "https://starlink.com/", name: "a", value: "1", secure: true, expirationDate: NOW + RESTORED_MAX_AGE_SECONDS, domain: "starlink.com", path: "/" },
    { url: "https://starlink.com/", name: "__Host-b", value: "2", secure: true, expirationDate: NOW + RESTORED_MAX_AGE_SECONDS, path: "/" },
  ]);
});

test("a cookie also seen on a subdomain is not restored twice; one only there stays host-only", () => {
  const out = buildRestoreCookies(
    { "https://starlink.com": "a=1", "https://api.starlink.com": "a=1; t=x=y", "https://www.starlink.com/auth": "d=4" },
    "starlink.com",
    NOW,
  );
  assert.deepEqual(
    out.map((c) => [c.url, c.name, c.value, c.domain ?? null, c.path]),
    [
      ["https://starlink.com/", "a", "1", "starlink.com", "/"],
      ["https://api.starlink.com/", "t", "x=y", null, "/"],
      ["https://www.starlink.com/auth", "d", "4", null, "/auth"],
    ],
  );
});

test("broken input yields fewer cookies, never a throw", () => {
  assert.deepEqual(buildRestoreCookies(null, "starlink.com", NOW), []);
  assert.deepEqual(buildRestoreCookies({ "http://starlink.com": "a=1", "nope": "b=2", "https://starlink.com": ";; =x; novalue" }, "starlink.com", NOW), []);
});

test("restore plan: Starlink urls only, mailbox sessions and empty devices skipped", () => {
  const plan = starlinkRestorePlan(
    {
      dev1: { "https://starlink.com": "a=1", "https://evil.example": "s=1", "https://starlink.com.evil.example": "s=2" },
      "mail:dev1": { "https://login.live.com": "m=1" },
      dev2: { "https://evil.example": "s=1" },
      " ": { "https://starlink.com": "a=1" },
    },
    NOW,
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].accountId, "dev1");
  assert.deepEqual(plan[0].cookies.map((c) => c.name), ["a"]);
});

test("each device has its own persistent partition", () => {
  assert.match(partitionFor("dev1"), /^persist:device-[0-9a-f]{64}$/);
  assert.notEqual(partitionFor("dev1"), partitionFor("dev2"));
  assert.throws(() => partitionFor("  "));
});

test("allowed urls and export string", () => {
  assert.ok(isStarlinkUrl("https://www.starlink.com/account/home"));
  assert.ok(!isStarlinkUrl("http://starlink.com"));
  assert.ok(!isStarlinkUrl("https://notstarlink.com"));
  assert.equal(combineCookies([{ name: "a", value: "1" }, { name: "b", value: "" }, { name: "" }]), "a=1; b=");
});

const { isMailUrl, inboxUrlFor, mailSessionState, mailPartitionFor, mailRestorePlan, isGmail } = require("./sessions");

test("📧 a mailbox window opens only Outlook / Microsoft sign-in (and Gmail) over https", () => {
  assert.equal(isMailUrl("https://outlook.live.com/mail/0/"), true);
  assert.equal(isMailUrl("https://login.live.com/oauth"), true);
  assert.equal(isMailUrl("https://login.microsoftonline.com/x"), true);
  assert.equal(isMailUrl("http://outlook.live.com/"), false);
  assert.equal(isMailUrl("https://evil-live.com/"), false);
  assert.equal(isMailUrl("https://starlink.com/"), false);
  assert.equal(inboxUrlFor("demo@outlook.com"), "https://outlook.live.com/mail/0/?login_hint=demo%40outlook.com");
  assert.equal(inboxUrlFor(""), "https://outlook.live.com/mail/0/");
  assert.equal(isGmail("x@gmail.com"), true);
  assert.equal(isGmail("x@outlook.com"), false);
});

test("📧 the inbox = signed in, Microsoft's login = signed out", () => {
  assert.equal(mailSessionState("https://outlook.live.com/mail/0/inbox"), "signedIn");
  assert.equal(mailSessionState("https://login.live.com/login.srf"), "signedOut");
  assert.equal(mailSessionState("https://account.microsoft.com/"), "unknown");
  assert.equal(mailSessionState("https://starlink.com/"), "unknown");
});

test("📧 the phone's «mail:<id>» sessions restore into the device's own mailbox storage", () => {
  assert.notEqual(mailPartitionFor("d1"), partitionFor("d1"));
  const plan = mailRestorePlan({ "mail:d1": { "https://live.com": "a=1", "https://evil.com": "x=1" }, d1: { "https://starlink.com": "s=1" } }, NOW);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].accountId, "d1");
  assert.deepEqual(plan[0].cookies.map((c) => [c.name, c.domain]), [["a", "live.com"]]);
  assert.equal(starlinkRestorePlan({ "mail:d1": { "https://live.com": "a=1" } }, NOW).length, 0);
});
