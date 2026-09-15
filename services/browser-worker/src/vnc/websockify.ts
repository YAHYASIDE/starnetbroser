import { ChildProcess, spawn } from "child_process";
import { getFreePort } from "./freePort";
import { waitForPortOpen } from "./waitForPort";

export interface WebsockifyHandle {
  port: number;
  proc: ChildProcess;
  stop(): Promise<void>;
}

/**
 * Bridges the loopback-only VNC port to a loopback-only WebSocket port so
 * a browser-based noVNC client can connect - still never exposed
 * externally; services/api is the only thing allowed to reach this, over
 * an authenticated, ticket-gated proxy route.
 */
export async function startWebsockify(vncPort: number): Promise<WebsockifyHandle> {
  const wsPort = await getFreePort();
  const proc = spawn("websockify", ["--web=/usr/share/novnc", `127.0.0.1:${wsPort}`, `127.0.0.1:${vncPort}`], {
    stdio: "ignore",
  });

  const started = new Promise<void>((_resolve, reject) => {
    proc.once("error", reject);
    proc.once("exit", (code) => reject(new Error(`websockify exited early with code ${code}`)));
  });
  started.catch(() => undefined);

  // Real readiness, not a fixed guess: websockify is a Python process
  // that can take meaningfully longer than a few hundred ms to start
  // listening under concurrent load (several sessions' Chromium/Xvfb/
  // x11vnc/websockify competing for CPU at once).
  await Promise.race([waitForPortOpen(wsPort), started]);

  return {
    port: wsPort,
    proc,
    stop: async () => {
      proc.kill("SIGTERM");
    },
  };
}
