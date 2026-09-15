import { ChildProcess, spawn } from "child_process";
import { getFreePort } from "./freePort";

export interface X11vncHandle {
  port: number;
  proc: ChildProcess;
  stop(): Promise<void>;
}

/**
 * Starts x11vnc against a real Xvfb display, bound to loopback only
 * (-localhost) - never reachable except through this host, satisfying
 * "never expose noVNC/Chromium directly on the internet." A caller
 * outside this process reaches it only via the authenticated ticketed
 * proxy in services/api, never directly.
 */
export async function startX11vnc(displayName: string): Promise<X11vncHandle> {
  const port = await getFreePort();
  const proc = spawn(
    "x11vnc",
    [
      "-display", displayName,
      "-rfbport", String(port),
      "-localhost",
      "-forever",
      "-shared",
      "-noxdamage",
      "-quiet",
    ],
    { stdio: "ignore" },
  );

  return new Promise((resolve, reject) => {
    const onError = reject;
    proc.once("error", onError);
    setTimeout(() => {
      proc.removeListener("error", onError);
      resolve({
        port,
        proc,
        stop: async () => {
          proc.kill("SIGTERM");
        },
      });
    }, 400);
  });
}
