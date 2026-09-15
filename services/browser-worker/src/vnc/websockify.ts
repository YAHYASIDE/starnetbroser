import { ChildProcess, spawn } from "child_process";
import { getFreePort } from "./freePort";

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

  return new Promise((resolve, reject) => {
    const onError = reject;
    proc.once("error", onError);
    setTimeout(() => {
      proc.removeListener("error", onError);
      resolve({
        port: wsPort,
        proc,
        stop: async () => {
          proc.kill("SIGTERM");
        },
      });
    }, 300);
  });
}
