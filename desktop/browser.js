"use strict";

/**
 * 🌐 Links out of STAR NET open in Google Chrome (his Nov 17 2026 ask «اجعل الفتح يكون من Google Chrome لا من Edge»):
 * Windows' default browser was Edge. Chrome where it is installed (the usual three places), else the default browser.
 * `chromePath` is pure (tested in browser.test.js).
 */

const path = require("path");

/** The places Chrome installs itself on Windows, in order. */
function chromeCandidates(env) {
  const out = [];
  for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]) {
    if (base) out.push(path.win32.join(base, "Google", "Chrome", "Application", "chrome.exe"));
  }
  return out;
}

/** Chrome's exe, or null when it isn't installed. */
function chromePath(env, exists) {
  for (const p of chromeCandidates(env)) if (exists(p)) return p;
  return null;
}

/** Opens an http(s) link in Chrome, else in the default browser. */
function openLink(url) {
  if (!/^https?:/i.test(url)) return;
  const { shell } = require("electron");
  const fs = require("fs");
  const chrome = process.platform === "win32" ? chromePath(process.env, (p) => fs.existsSync(p)) : null;
  if (!chrome) {
    void shell.openExternal(url);
    return;
  }
  try {
    const child = require("child_process").spawn(chrome, [url], { detached: true, stdio: "ignore" });
    child.on("error", () => void shell.openExternal(url));
    child.unref();
  } catch {
    void shell.openExternal(url);
  }
}

module.exports = { chromeCandidates, chromePath, openLink };
