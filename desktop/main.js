// 🖥️ STAR NET for Windows (his Oct 21 2026 choice after the council): the same app as the phone -
// the static export of apps/web - in its own window, served from app://starnet/ so its data (the
// browser storage of that address) stays on this laptop in the app's own folder. Links to other
// sites open in the normal browser. Phase 1: the app + moving the data from the phone (backup file);
// the live link and the Starlink browsers come next.
const { app, BrowserWindow, protocol, net, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { resolveFile } = require("./paths");

const ORIGIN = "app://starnet";
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "apps", "web", "out");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: "#060A14",
    title: "STAR NET",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadURL(`${ORIGIN}/`);
  // Another site: the normal browser, never inside the app's window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle("app", (request) => {
    const file = resolveFile(WEB_ROOT, new URL(request.url).pathname, fs.existsSync);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
