// 🖥️ STAR NET for Windows (his Oct 21 2026 choice after the council): the same app as the phone -
// the static export of apps/web - in its own window, served from app://starnet/ so its data (the
// browser storage of that address) stays on this laptop in the app's own folder. Links to other
// sites open in the normal browser. Phase 1: the app + moving the data from the phone (backup file).
// Phase 3 (his choice «فتح حسابات Starlink أولًا»): each device's own isolated Starlink window
// (devices.js), signed in by the sessions of the phone's backup.
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { resolveFile } = require("./paths");
const devices = require("./devices");

const ORIGIN = "app://starnet";
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "apps", "web", "out");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// The data folder stays the one phase 1 installed with ("starnet-desktop") - the program's shown
// name became «STAR NET» (dialog titles), and a new folder would lose the restored data.
app.setPath("userData", path.join(app.getPath("appData"), "starnet-desktop"));

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
  devices.register(ipcMain, () => win);
  createWindow();
});

app.on("window-all-closed", () => app.quit());
