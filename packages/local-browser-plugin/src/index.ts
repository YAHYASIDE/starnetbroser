import { registerPlugin } from "@capacitor/core";
import type { LocalBrowserPlugin } from "./definitions";

const LocalBrowser = registerPlugin<LocalBrowserPlugin>("LocalBrowser", {
  web: () => import("./web").then((m) => new m.LocalBrowserWeb()),
});

export * from "./definitions";
export { LocalBrowser };
