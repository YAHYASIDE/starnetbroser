import { extractStarlinkFields } from "./extractStarlinkFields";
import { clickFirstSubscriptionRow, clickIconRailItem, expandDevicesSection } from "./navigation";

/**
 * The one script AccountBrowserActivity/AutoSyncWorker ever inject into an isolated WebView.
 * Bundled by esbuild (see scripts/bundleWebExtractor.mjs) into
 * android/src/main/assets/starlinkExtractor.js. Deliberately a plain global assignment, not an ES
 * module export - esbuild's IIFE format would otherwise wrap a default export in a CommonJS-
 * interop object ({ default: ... }), an internal bundler detail Java would have to know about.
 *
 * Unlike the original Stage-1 version (which ran extraction immediately on injection), this
 * bundle now only ever DEFINES a small set of named functions on globalThis and runs nothing on
 * its own - Java re-injects this same bundle before every single step of a multi-page sync (see
 * StarlinkExtractorSupport.java), then evaluates one specific `__starnet*(...)` call as a
 * trailing statement to actually run that step. Re-injecting is always safe (plain `var`
 * reassignment, never an "already declared" error) whether or not the page navigated since the
 * last injection - callers never need to know whether a given tap caused a full page load or an
 * in-page SPA route change, which this account portal was never confirmed to distinguish reliably
 * either way.
 */
type StarnetGlobal = typeof globalThis & {
  __starnetExtract?: () => string;
  __starnetClickIconRailItem?: (index: number) => boolean;
  __starnetClickFirstSubscriptionRow?: () => boolean;
  __starnetExpandDevicesSection?: () => boolean;
};

const starnetGlobal = globalThis as StarnetGlobal;

/** Stage 1: reads whatever section of the page is currently open. Never raw HTML or page text -
 * only the small, already-structured set of fields extractStarlinkFields.ts actually found. */
starnetGlobal.__starnetExtract = () => JSON.stringify(extractStarlinkFields(document));

/** Stage 2 navigation - see navigation.ts's own doc for why these exist and what each one does. */
starnetGlobal.__starnetClickIconRailItem = clickIconRailItem;
starnetGlobal.__starnetClickFirstSubscriptionRow = clickFirstSubscriptionRow;
starnetGlobal.__starnetExpandDevicesSection = expandDevicesSection;
