import { extractStarlinkFields } from "./extractStarlinkFields";

/**
 * The one script AccountBrowserActivity ever injects into the isolated WebView. Bundled by
 * esbuild (see scripts/bundleWebExtractor.mjs) into android/src/main/assets/starlinkExtractor.js.
 * Deliberately a plain global assignment, not an ES module export - esbuild's IIFE format would
 * otherwise wrap a default export in a CommonJS-interop object ({ default: ... }), an internal
 * bundler detail Java would have to know about. A `var` (not let/const) assignment on globalThis
 * is what's actually injected, so evaluateJavascript's own completion-value mechanism reads it
 * back directly - and re-running this same script on a second "تحديث من Starlink" tap without
 * navigating away just reassigns the global, no "already declared" error. The ONLY thing this
 * ever sends back is this JSON string of extracted fields - never the page's HTML or raw text.
 */
(globalThis as unknown as Record<string, string>).__starnetSyncResult = JSON.stringify(
  extractStarlinkFields(document),
);
