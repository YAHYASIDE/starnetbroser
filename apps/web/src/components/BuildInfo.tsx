const COMMIT = (process.env.NEXT_PUBLIC_COMMIT_SHA || "dev").slice(0, 7);
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";

/** Always-visible build fingerprint, per product requirement: the running
 * version and its build time must be checkable from inside the app itself. */
export function BuildInfo() {
  return (
    <footer className="build-info">
      الإصدار {COMMIT}
      {BUILD_TIME ? ` · ${BUILD_TIME}` : ""}
    </footer>
  );
}
