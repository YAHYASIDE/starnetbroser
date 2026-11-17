"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { chromePath } = require("./browser");

test("Chrome is found where Windows installs it, else null (the default browser is used)", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" };
  const local = "C:\\Users\\x\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.strictEqual(chromePath(env, (p) => p === local), local);
  assert.strictEqual(chromePath(env, (p) => p.startsWith("C:\\Program Files\\")), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  assert.strictEqual(chromePath(env, () => false), null);
  assert.strictEqual(chromePath({}, () => true), null);
});
