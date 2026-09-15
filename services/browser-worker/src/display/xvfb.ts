import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
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

function waitForX11Socket(display: number, timeoutMs = 5000): Promise<void> {
  const socketPath = `/tmp/.X11-unix/X${display}`;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (existsSync(socketPath)) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${socketPath}`));
      setTimeout(check, 25);
    };
    check();
  });
}

/** Starts a real virtual X display Chromium can render into (headed, so
 * x11vnc can actually stream real pixels - not Playwright's headless mode). */
export async function startXvfb(): Promise<XvfbHandle> {
  const display = allocateDisplayNumber();
  const displayName = `:${display}`;
  const proc = spawn(
    "Xvfb",
    [displayName, "-screen", "0", `${config.viewportWidth}x${config.viewportHeight}x24`, "-nolisten", "tcp"],
    { stdio: "ignore" },
  );

  const started = new Promise<void>((_resolve, reject) => {
    proc.once("error", reject);
    proc.once("exit", (code) => reject(new Error(`Xvfb exited early with code ${code}`)));
  });
  started.catch(() => undefined);

  try {
    // Real readiness (the X11 unix socket actually existing), not a
    // fixed guess - under concurrent load several Xvfb instances can
    // start noticeably slower than in an idle environment.
    await Promise.race([waitForX11Socket(display), started]);
  } catch (err) {
    usedDisplays.delete(display);
    throw err;
  }

  return {
    display,
    displayName,
    proc,
    stop: async () => {
      usedDisplays.delete(display);
      proc.kill("SIGTERM");
    },
  };
}
