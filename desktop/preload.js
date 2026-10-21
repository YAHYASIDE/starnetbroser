// 🖥️ What the page may know about the Windows app - nothing else from Node reaches it.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("starnetDesktop", {
  platform: "windows",
  version: "1",
});
