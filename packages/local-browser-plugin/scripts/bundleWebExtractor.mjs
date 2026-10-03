// Bundles src/webExtraction/injectedScript.ts into a single, dependency-free JS file that
// AccountBrowserActivity.java injects into the isolated WebView via evaluateJavascript. Runs as
// part of this package's own `npm run build`, so it's already covered by every place CI already
// runs that (no separate step needed).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "webExtraction", "injectedScript.ts");
const outfile = join(here, "..", "android", "src", "main", "assets", "starlinkExtractor.js");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "iife",
  target: "es2017", // matches Chromium versions realistically shipped as Android's WebView
  legalComments: "none",
  logLevel: "info",
});
