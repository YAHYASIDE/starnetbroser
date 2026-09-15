import express, { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { SessionManager, ConcurrencyLimitError } from "../browser/sessionManager";

const ACCOUNT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

/**
 * Internal-only control API - not authenticated with user credentials
 * because it's never reachable from outside the internal Docker network
 * in production (see infra/); the shared-secret header is defense in
 * depth on top of that network boundary, not the primary control.
 */
export function createServer(sessions: SessionManager) {
  const app = express();
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next();
    if (!config.internalToken) return next();
    if (req.header("x-internal-token") !== config.internalToken) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/sessions/:accountId/start", async (req, res) => {
    const { accountId } = req.params;
    if (!ACCOUNT_ID_RE.test(accountId)) {
      return res.status(400).json({ error: "invalid accountId" });
    }
    try {
      const info = await sessions.start(accountId);
      res.json(info);
    } catch (err) {
      if (err instanceof ConcurrencyLimitError) {
        return res.status(503).json({ error: err.message });
      }
      res.status(500).json({ error: "failed to start session" });
    }
  });

  app.post("/sessions/:accountId/stop", async (req, res) => {
    await sessions.stop(req.params.accountId);
    res.json({ ok: true });
  });

  app.get("/sessions/:accountId/status", (req, res) => {
    res.json(sessions.status(req.params.accountId));
  });

  return app;
}
