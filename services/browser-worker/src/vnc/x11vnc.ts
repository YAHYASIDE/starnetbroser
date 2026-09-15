import { ChildProcess, spawn } from "child_process";
import { getFreePort } from "./freePort";
import { waitForPortOpen } from "./waitForPort";

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
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const started = new Promise<void>((_resolve, reject) => {
    proc.once("error", reject);
    proc.once("exit", (code) =>
      reject(new Error(`x11vnc exited early with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`)),
    );
  });
  // A later, normal exit (e.g. stop() killing the process) would
  // otherwise reject this same promise with nothing left listening.
  started.catch(() => undefined);

  // Wait for whichever happens first: x11vnc actually accepting
  // connections, or it dying before that - never a fixed guess at how
  // long that takes.
  await Promise.race([waitForPortOpen(port), started]);

  return {
    port,
    proc,
    stop: async () => {
      proc.kill("SIGTERM");
    },
  };
}
