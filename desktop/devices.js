// 🖥️ Each device's own Starlink window on Windows - the phone's isolated device browser: its own
// browser storage (partition), so two devices never share a sign-in; only starlink.com pages, any
// other site opens in the normal browser; the saved email/password typed into the sign-in page
// (never submitted). The sessions of a backup (the phone's format) are put into those partitions.
const { BrowserWindow, Menu, session, shell, app } = require("electron");
const { SESSION_COOKIE_URLS, isStarlinkUrl, partitionFor, starlinkRestorePlan, combineCookies } = require("./sessions");
const { loginScript } = require("./autofill");
const { attachZoom } = require("./zoom");
const mail = require("./mail");
const codes = require("./codes");
const sync = require("./sync");

const HOME_URL = "https://starlink.com/account/home";
const open = new Map();
let zoomStore = null;

/** Starlink sees a normal Chrome, not «Electron/…» or the program's own name. */
function chromeUserAgent(ses) {
  return ses.getUserAgent().replace(/\s+Electron\/\S+/i, "").replace(/\s+starnet-desktop\/\S+/i, "").replace(/\s+STAR NET\/\S+/i, "");
}

function deviceSession(accountId) {
  const ses = session.fromPartition(partitionFor(accountId));
  ses.setUserAgent(chromeUserAgent(ses));
  return ses;
}

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function deviceMenu(view) {
  const go = (fn) => () => {
    if (!view.isDestroyed()) fn(view.webContents);
  };
  return Menu.buildFromTemplate([
    { label: "→ رجوع", accelerator: "Alt+Left", click: go((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
    { label: "تقدّم ←", accelerator: "Alt+Right", click: go((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
    { label: "⟳ تحديث", accelerator: "F5", click: go((wc) => wc.reload()) },
    { label: "🏠 الرئيسية", click: go((wc) => wc.loadURL(HOME_URL)) },
    { label: "✕ إغلاق", accelerator: "Ctrl+W", click: () => !view.isDestroyed() && view.close() },
  ]);
}

function openDevice(opts) {
  const accountId = text(opts && opts.accountId, 200).trim();
  if (!accountId) return { ok: false, message: "جهاز غير معروف" };
  const existing = open.get(accountId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return { ok: true, view: existing };
  }
  const name = text(opts.accountName, 120).trim() || "حساب Starlink";
  const script = loginScript(text(opts.loginEmail, 320), text(opts.loginPassword, 500));
  const view = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    title: `${name} - STAR NET`,
    backgroundColor: "#ffffff",
    webPreferences: { session: deviceSession(accountId), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  open.set(accountId, view);
  view.on("closed", () => open.get(accountId) === view && open.delete(accountId));
  view.setMenu(deviceMenu(view));
  // The page's own title must not hide which device this window is.
  view.on("page-title-updated", (event) => {
    event.preventDefault();
  });
  const wc = view.webContents;
  if (zoomStore) attachZoom(wc, zoomStore);
  wc.setWindowOpenHandler(({ url }) => {
    if (isStarlinkUrl(url)) {
      void wc.loadURL(url);
    } else if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (isStarlinkUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  wc.on("will-redirect", (event, url) => {
    if (!isStarlinkUrl(url)) event.preventDefault();
  });
  if (script) {
    const fill = () => {
      if (isStarlinkUrl(wc.getURL())) wc.executeJavaScript(script, false).catch(() => {});
    };
    wc.on("did-finish-load", fill);
    wc.on("did-navigate-in-page", fill);
  }
  // 🔑 «التحقق بخطوتين»: the code from this device's mailbox, typed by itself.
  const mailEmail = text(opts.mailEmail, 320) || text(opts.loginEmail, 320);
  const mailPassword = text(opts.mailPassword, 500) || text(opts.loginPassword, 500);
  if (mailEmail) {
    codes.watch(view, accountId, (show) => mail.openMailbox({ accountId, accountName: name, email: mailEmail, password: mailPassword }, { show }));
  }
  view.loadURL(HOME_URL).catch(() => {});
  return { ok: true, view };
}

async function importSessions(sessions) {
  let importedCount = 0;
  for (const { accountId, cookies } of starlinkRestorePlan(sessions, Date.now() / 1000)) {
    const ses = deviceSession(accountId);
    let any = false;
    for (const cookie of cookies) {
      try {
        await ses.cookies.set(cookie);
        any = true;
      } catch {
        // One refused cookie must not stop the rest of the device (or the other devices).
      }
    }
    if (any) {
      await ses.cookies.flushStore().catch(() => {});
      importedCount++;
    }
  }
  // 📧 the phone's «mail:<id>» mailboxes into each device's mailbox window.
  importedCount += await mail.importMailSessions(sessions);
  return { importedCount };
}

async function exportSessions(accountIds, includeMailbox) {
  const out = {};
  for (const raw of Array.isArray(accountIds) ? accountIds : []) {
    const accountId = text(raw, 200).trim();
    if (!accountId) continue;
    const ses = deviceSession(accountId);
    const byUrl = {};
    for (const url of SESSION_COOKIE_URLS) {
      const combined = combineCookies(await ses.cookies.get({ url }).catch(() => []));
      if (combined) byUrl[url] = combined;
    }
    if (Object.keys(byUrl).length) out[accountId] = byUrl;
  }
  if (includeMailbox) Object.assign(out, await mail.exportMailSessions(accountIds));
  return out;
}

async function deleteSession(accountId) {
  const id = text(accountId, 200).trim();
  if (!id) return false;
  const view = open.get(id);
  if (view && !view.isDestroyed()) view.close();
  await deviceSession(id).clearStorageData();
  return true;
}

/** Only the app's own window may ask (never a Starlink page). */
function register(ipcMain, mainWindow, zoom) {
  zoomStore = zoom || null;
  const fromApp = (event) => {
    const win = mainWindow();
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  };
  ipcMain.handle("starnet:open-device", (event, opts) => {
    if (!fromApp(event)) return { ok: false, message: "غير مسموح" };
    const result = openDevice(opts || {});
    return { ok: result.ok, ...(result.message ? { message: result.message } : {}) };
  });
  // 🔄 «تحديث من Starlink» on the laptop: the device's window walks its pages (sync.js).
  ipcMain.handle("starnet:sync-device", async (event, opts) => {
    if (!fromApp(event)) return { ok: false, message: "غير مسموح" };
    const opened = openDevice(opts || {});
    if (!opened.ok || !opened.view) return { ok: false, message: opened.message || "تعذر فتح الجهاز" };
    const accountId = text(opts.accountId, 200).trim();
    return sync.syncDevice(opened.view, accountId, (entry) => {
      const win = mainWindow();
      if (win && !win.isDestroyed()) win.webContents.send("starnet:synced", entry);
    });
  });
  ipcMain.handle("starnet:list-pending-syncs", (event) => (fromApp(event) ? sync.listPending() : []));
  ipcMain.handle("starnet:ack-syncs", (event, ids) => (fromApp(event) ? sync.ackPending(ids) : false));
  ipcMain.handle("starnet:import-sessions", (event, sessions) => (fromApp(event) ? importSessions(sessions) : { importedCount: 0 }));
  ipcMain.handle("starnet:export-sessions", (event, ids, includeMailbox) => (fromApp(event) ? exportSessions(ids, includeMailbox === true) : {}));
  ipcMain.handle("starnet:delete-session", (event, id) => (fromApp(event) ? deleteSession(id) : false));
  ipcMain.handle("starnet:list-codes", (event) => (fromApp(event) ? codes.listCodes() : []));
  ipcMain.handle("starnet:clear-codes", (event) => (fromApp(event) ? codes.clearCodes() : undefined));
  app.on("before-quit", () => {
    for (const view of open.values()) if (!view.isDestroyed()) view.destroy();
  });
}

module.exports = { register };
