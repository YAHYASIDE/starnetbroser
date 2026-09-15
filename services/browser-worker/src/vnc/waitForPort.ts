import { connect } from "net";

/**
 * Polls a real TCP connect until the port actually accepts connections,
 * instead of a fixed sleep - under concurrent load (several
 * Chromium/Xvfb/x11vnc/websockify process groups competing for CPU),
 * x11vnc/websockify can take meaningfully longer than a few hundred ms
 * to start listening, and a fixed sleep either wastes time when it's
 * fast or - worse - returns "ready" before it actually is.
 */
export function waitForPortOpen(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = connect({ port, host: "127.0.0.1" }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for 127.0.0.1:${port} to accept connections`));
        } else {
          setTimeout(attempt, 50);
        }
      });
    };
    attempt();
  });
}
