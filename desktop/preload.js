// 🖥️ What the page may know about the Windows app - nothing else from Node reaches it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starnetDesktop", {
  platform: "windows",
  version: "3",
  /** A device's own Starlink window ({accountId, accountName, loginEmail, loginPassword}). */
  openDevice: (opts) => ipcRenderer.invoke("starnet:open-device", opts),
  /** A backup's sessions (the phone's format) into the device windows -> {importedCount}. */
  importSessions: (sessions) => ipcRenderer.invoke("starnet:import-sessions", sessions),
  /** The devices' sessions for a backup, in the phone's format. */
  exportSessions: (accountIds, includeMailbox) => ipcRenderer.invoke("starnet:export-sessions", accountIds, includeMailbox === true),
  /** 📧 A device's own mailbox window ({accountId, accountName, email, password}). */
  openMailbox: (opts) => ipcRenderer.invoke("starnet:open-mailbox", opts),
  /** 📧 The mailboxes signed in on this laptop: [{accountId, email, signedInAt}]. */
  listMailSessions: () => ipcRenderer.invoke("starnet:list-mail-sessions"),
  /** 🔑 The codes read here: [{at, accountId, kind, code}], newest first. */
  listVerificationCodes: () => ipcRenderer.invoke("starnet:list-codes"),
  clearVerificationCodes: () => ipcRenderer.invoke("starnet:clear-codes"),
  /** Signs one device's window out (its storage cleared). */
  deleteSession: (accountId) => ipcRenderer.invoke("starnet:delete-session", accountId),
});
