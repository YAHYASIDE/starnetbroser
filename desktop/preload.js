// 🖥️ What the page may know about the Windows app - nothing else from Node reaches it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starnetDesktop", {
  platform: "windows",
  version: "2",
  /** A device's own Starlink window ({accountId, accountName, loginEmail, loginPassword}). */
  openDevice: (opts) => ipcRenderer.invoke("starnet:open-device", opts),
  /** A backup's sessions (the phone's format) into the device windows -> {importedCount}. */
  importSessions: (sessions) => ipcRenderer.invoke("starnet:import-sessions", sessions),
  /** The devices' sessions for a backup, in the phone's format. */
  exportSessions: (accountIds) => ipcRenderer.invoke("starnet:export-sessions", accountIds),
  /** Signs one device's window out (its storage cleared). */
  deleteSession: (accountId) => ipcRenderer.invoke("starnet:delete-session", accountId),
});
