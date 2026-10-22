// 🖥️📧 Each device's own mailbox window on Windows (his Oct 22 2026 choice «نافذة لكل بريد بجلسته») -
// the phone's «📧 البريد»: Outlook in its own storage (never the Starlink window's, never another
// device's), only Outlook / Microsoft sign-in pages, the saved email + password typed into the sign-in
// (never submitted). The phone's backup brings each mailbox's session («mail:<id>»); a laptop backup
// carries them back. Which mailboxes are signed in is kept in mail-sessions.json (no secret in it).
const { BrowserWindow, Menu, session, shell, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { MAIL_COOKIE_URLS, MAIL_PREFIX, isMailUrl, isGmail, inboxUrlFor, mailSessionState, mailPartitionFor, mailRestorePlan, combineCookies } = require("./sessions");
const { loginScript } = require("./autofill");
const { attachZoom } = require("./zoom");

const open = new Map();
let zoomStore = null;

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function chromeUserAgent(ses) {
  return ses.getUserAgent().replace(/\s+Electron\/\S+/i, "").replace(/\s+starnet-desktop\/\S+/i, "").replace(/\s+STAR NET\/\S+/i, "");
}

function mailSession(accountId) {
  const ses = session.fromPartition(mailPartitionFor(accountId));
  ses.setUserAgent(chromeUserAgent(ses));
  return ses;
}

// ---- which mailboxes are signed in (accountId -> {email, signedInAt}) ----
const recordsFile = () => path.join(app.getPath("userData"), "mail-sessions.json");
function readRecords() {
  try {
    const parsed = JSON.parse(fs.readFileSync(recordsFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeRecords(records) {
  try {
    fs.writeFileSync(recordsFile(), JSON.stringify(records));
  } catch {
    // Only the «✓ مسجّل» mark is lost - the session itself stays in its storage.
  }
}
function markSignedIn(accountId, email) {
  const records = readRecords();
  const old = records[accountId];
  records[accountId] = { email: email || (old && old.email) || "", signedInAt: (old && old.signedInAt) || Date.now() };
  writeRecords(records);
}
function markSignedOut(accountId) {
  const records = readRecords();
  if (!(accountId in records)) return;
  delete records[accountId];
  writeRecords(records);
}

function listMailSessions() {
  return Object.entries(readRecords()).map(([accountId, r]) => ({ accountId, email: (r && r.email) || "", signedInAt: (r && r.signedInAt) || 0 }));
}

function mailMenu(view, inbox) {
  const go = (fn) => () => {
    if (!view.isDestroyed()) fn(view.webContents);
  };
  return Menu.buildFromTemplate([
    { label: "→ رجوع", accelerator: "Alt+Left", click: go((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
    { label: "تقدّم ←", accelerator: "Alt+Right", click: go((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
    { label: "⟳ تحديث", accelerator: "F5", click: go((wc) => wc.reload()) },
    { label: "📥 الوارد", click: go((wc) => wc.loadURL(inbox)) },
    { label: "✕ إغلاق", accelerator: "Ctrl+W", click: () => !view.isDestroyed() && view.close() },
  ]);
}

/** The device's mailbox window - focused when already open. `show: false` keeps it hidden (reading a code). */
function openMailbox(opts, { show = true } = {}) {
  const accountId = text(opts && opts.accountId, 200).trim();
  if (!accountId) return { ok: false, message: "جهاز غير معروف" };
  const email = text(opts.email, 320).trim();
  if (isGmail(email)) {
    // Google refuses its sign-in inside other programs: Gmail opens in the normal browser.
    void shell.openExternal("https://mail.google.com/mail/u/0/");
    return { ok: true };
  }
  const existing = open.get(accountId);
  if (existing && !existing.isDestroyed()) {
    if (show) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
    }
    return { ok: true, view: existing };
  }
  const name = text(opts.accountName, 120).trim() || "البريد";
  const script = loginScript(email, text(opts.password, 500));
  const inbox = inboxUrlFor(email);
  const view = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    show,
    title: `📧 ${name} - STAR NET`,
    backgroundColor: "#ffffff",
    webPreferences: { session: mailSession(accountId), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  open.set(accountId, view);
  view.on("closed", () => open.get(accountId) === view && open.delete(accountId));
  view.setMenu(mailMenu(view, inbox));
  view.on("page-title-updated", (event) => event.preventDefault());
  const wc = view.webContents;
  if (zoomStore) attachZoom(wc, zoomStore);
  wc.setWindowOpenHandler(({ url }) => {
    if (isMailUrl(url)) void wc.loadURL(url);
    else if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (isMailUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  wc.on("will-redirect", (event, url) => {
    if (!isMailUrl(url)) event.preventDefault();
  });
  const track = () => {
    const state = mailSessionState(wc.getURL());
    if (state === "signedIn") markSignedIn(accountId, email);
    else if (state === "signedOut") markSignedOut(accountId);
    if (script && isMailUrl(wc.getURL())) wc.executeJavaScript(script, false).catch(() => {});
  };
  wc.on("did-finish-load", track);
  wc.on("did-navigate-in-page", track);
  view.loadURL(inbox).catch(() => {});
  return { ok: true, view };
}

async function importMailSessions(sessions) {
  let importedCount = 0;
  for (const { accountId, cookies } of mailRestorePlan(sessions, Date.now() / 1000)) {
    const ses = mailSession(accountId);
    let any = false;
    for (const cookie of cookies) {
      try {
        await ses.cookies.set(cookie);
        any = true;
      } catch {
        // one refused cookie never stops the rest
      }
    }
    if (any) {
      await ses.cookies.flushStore().catch(() => {});
      markSignedIn(accountId, "");
      importedCount++;
    }
  }
  return importedCount;
}

/** «mail:<id>» -> url -> cookies, for the devices that have a signed-in mailbox here. */
async function exportMailSessions(accountIds) {
  const out = {};
  const records = readRecords();
  for (const raw of Array.isArray(accountIds) ? accountIds : []) {
    const accountId = text(raw, 200).trim();
    if (!accountId || !records[accountId]) continue;
    const ses = mailSession(accountId);
    const byUrl = {};
    for (const url of MAIL_COOKIE_URLS) {
      const combined = combineCookies(await ses.cookies.get({ url }).catch(() => []));
      if (combined) byUrl[url] = combined;
    }
    if (Object.keys(byUrl).length) out[`${MAIL_PREFIX}${accountId}`] = byUrl;
  }
  return out;
}

async function deleteMailSession(accountId) {
  const id = text(accountId, 200).trim();
  if (!id) return false;
  const view = open.get(id);
  if (view && !view.isDestroyed()) view.close();
  await mailSession(id).clearStorageData();
  markSignedOut(id);
  return true;
}

function register(ipcMain, mainWindow, zoom) {
  zoomStore = zoom || null;
  const fromApp = (event) => {
    const win = mainWindow();
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  };
  ipcMain.handle("starnet:open-mailbox", (event, opts) => {
    if (!fromApp(event)) return { ok: false, message: "غير مسموح" };
    const result = openMailbox(opts || {});
    return { ok: result.ok, ...(result.message ? { message: result.message } : {}) };
  });
  ipcMain.handle("starnet:list-mail-sessions", (event) => (fromApp(event) ? listMailSessions() : []));
  app.on("before-quit", () => {
    for (const view of open.values()) if (!view.isDestroyed()) view.destroy();
  });
}

module.exports = { register, openMailbox, importMailSessions, exportMailSessions, deleteMailSession };
