import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * A real HTTP + WebSocket server standing in for services/browser-worker
 * in tests of the NestJS layer (auth, ownership, the Postgres lock, the
 * WS proxy). The worker's OWN Chromium/Docker-volume reality is proven
 * separately in services/browser-worker's own test suite - this fake
 * exists so the API layer's real HTTP/WS wiring gets exercised for real,
 * without needing a real browser for every API-level test.
 */
export function startFakeWorker(): Promise<{ server: Server; port: number; stop: () => Promise<void> }> {
  const runningAccounts = new Set<string>();

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const match = (req.url ?? "").match(/^\/sessions\/([^/]+)\/(start|stop|status)$/);
      if (!match) {
        res.writeHead(404).end();
        return;
      }
      const [, accountId, action] = match;
      if (action === "start") runningAccounts.add(accountId);
      if (action === "stop") runningAccounts.delete(accountId);
      const running = runningAccounts.has(accountId);

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          accountId,
          status: running ? "RUNNING" : "STOPPED",
          vncWebSocketPort: running ? wss.options.port : null,
          startedAt: running ? new Date().toISOString() : null,
        }),
      );
    });

    const wss = new WebSocketServer({ noServer: true, port: undefined });
    server.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
    wss.on("connection", (ws: WebSocket) => {
      ws.on("message", (data) => ws.send(`echo:${data.toString()}`));
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      (wss.options as { port: number }).port = port;
      resolve({
        server,
        port,
        stop: () =>
          new Promise<void>((res) => {
            wss.close();
            server.close(() => res());
          }),
      });
    });
  });
}
