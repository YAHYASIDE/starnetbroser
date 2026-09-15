import { ChildProcess, spawn } from "child_process";
import { config } from "../config";

const usedDisplays = new Set<number>();

function allocateDisplayNumber(): number {
  for (let n = config.vncDisplayBase; n < config.vncDisplayBase + 1000; n++) {
    if (!usedDisplays.has(n)) {
      usedDisplays.add(n);
      return n;
    }
  }
  throw new Error("No free X display numbers left");
}

export interface XvfbHandle {
  display: number;
  displayName: string;
  proc: ChildProcess;
  stop(): Promise<void>;
}

/** Starts a real virtual X display Chromium can render into (headed, so
 * x11vnc can actually stream real pixels - not Playwright's headless mode). */
export function startXvfb(): Promise<XvfbHandle> {
  const display = allocateDisplayNumber();
  const displayName = `:${display}`;
  const proc = spawn(
    "Xvfb",
    [displayName, "-screen", "0", `${config.viewportWidth}x${config.viewportHeight}x24`, "-nolisten", "tcp"],
    { stdio: "ignore" },
  );

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      usedDisplays.delete(display);
      reject(err);
    };
    proc.once("error", onError);
    // Xvfb has no "ready" signal on stdout by default; a short delay is
    // the standard approach and is generous relative to Xvfb's real
    // startup time (tens of milliseconds).
    setTimeout(() => {
      proc.removeListener("error", onError);
      resolve({
        display,
        displayName,
        proc,
        stop: async () => {
          usedDisplays.delete(display);
          proc.kill("SIGTERM");
        },
      });
    }, 300);
  });
}
