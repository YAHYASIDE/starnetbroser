import express from "express";
import { randomBytes } from "crypto";
import type { Server } from "http";

/**
 * A local, fake "requires login" page for testing the browser-worker
 * against - NOT Starlink, no real credentials, no network dependency.
 * Sessions are in-memory tokens issued on login and read back from a
 * cookie, exactly like a real site would - good enough to prove a real
 * Chromium-driven login persists across a worker restart and stays
 * isolated between two different browser profiles.
 */
export const TEST_USERS: Record<string, { password: string; identity: string }> = {
  "test-account-a": { password: "pass-a-not-real", identity: "Account A" },
  "test-account-b": { password: "pass-b-not-real", identity: "Account B" },
};

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function createTestTargetServer() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const tokens = new Map<string, string>(); // token -> username

  app.get("/", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const username = cookies.session ? tokens.get(cookies.session) : undefined;
    if (username) {
      res.send(`<html><body><h1 id="status">logged-in-as-${username}</h1></body></html>`);
    } else {
      res.send(
        `<html><body><form method="post" action="/login">` +
          `<input name="username" id="username"/>` +
          `<input name="password" id="password" type="password"/>` +
          `<button type="submit" id="submit">login</button>` +
          `</form></body></html>`,
      );
    }
  });

  app.post("/login", (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const user = username ? TEST_USERS[username] : undefined;
    if (!user || user.password !== password) {
      res.status(401).send(`<html><body><h1 id="status">login-failed</h1></body></html>`);
      return;
    }
    const token = randomBytes(16).toString("hex");
    tokens.set(token, username!);
    // A real login system sets a persistent auth cookie (explicit
    // Max-Age), not a pure session cookie - Chromium does not guarantee
    // session-only cookies survive a full browser process restart, which
    // would make this fixture a false negative for the exact thing being
    // tested.
    res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; Max-Age=2592000`);
    res.redirect("/");
  });

  app.get("/whoami", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const username = cookies.session ? tokens.get(cookies.session) : undefined;
    res.json({ loggedIn: Boolean(username), username: username ?? null });
  });

  return app;
}

export function listenOnFreePort(app: express.Express): Promise<{ server: Server; port: number; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
