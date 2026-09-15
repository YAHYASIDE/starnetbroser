/**
 * All configuration comes from the environment - nothing here is a
 * hardcoded server address, credential, or path that would need to
 * change per-deployment by editing code.
 */
export const config = {
  port: Number(process.env.PORT ?? 7500),
  // Shared secret between services/api and this worker - the worker is
  // never reachable from outside the internal Docker network in
  // production, this header is defense in depth on top of that.
  internalToken: process.env.WORKER_INTERNAL_TOKEN ?? "",
  chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH || "/opt/pw-browsers/chromium",
  profileVolumePrefix: process.env.PROFILE_VOLUME_PREFIX || "starnet_profile_",
  maxConcurrentSessions: Number(process.env.MAX_CONCURRENT_WORKERS ?? 4),
  idleTimeoutSeconds: Number(process.env.WORKER_IDLE_TIMEOUT_SECONDS ?? 300),
  vncDisplayBase: Number(process.env.VNC_DISPLAY_BASE ?? 100),
  viewportWidth: Number(process.env.SESSION_VIEWPORT_WIDTH ?? 1280),
  viewportHeight: Number(process.env.SESSION_VIEWPORT_HEIGHT ?? 800),
};
