import { chromium, BrowserContext, Page } from "playwright-core";
import { BrowserSessionStatus } from "@starnet/shared";
import { config } from "../config";
import { ensureProfileVolume } from "../docker/volumes";
import { startXvfb, XvfbHandle } from "../display/xvfb";
import { startX11vnc, X11vncHandle } from "../vnc/x11vnc";
import { startWebsockify, WebsockifyHandle } from "../vnc/websockify";

interface RunningSession {
  accountId: string;
  context: BrowserContext;
  page: Page;
  xvfb: XvfbHandle;
  vnc: X11vncHandle;
  ws: WebsockifyHandle;
  startedAt: Date;
  lastActivityAt: Date;
}

export interface SessionInfo {
  accountId: string;
  status: BrowserSessionStatus;
  vncWebSocketPort: number | null;
  startedAt: string | null;
}

export class ConcurrencyLimitError extends Error {
  constructor() {
    super("Maximum concurrent browser sessions reached");
    this.name = "ConcurrencyLimitError";
  }
}

/**
 * Owns every live Chromium session this worker process is running, one
 * per Starlink account, each backed by its own Docker-volume profile
 * directory (see docker/volumes.ts). This is the thing that gets
 * destroyed and recreated in the restart-survival test - the volumes
 * themselves live independently in Docker, which is exactly what proves
 * persistence isn't just an artifact of one long-lived process.
 */
export class SessionManager {
  private sessions = new Map<string, RunningSession>();
  private starting = new Map<string, Promise<SessionInfo>>();
  private reapTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.reapTimer = setInterval(() => this.reapIdleSessions().catch(() => undefined), 30_000);
    this.reapTimer.unref?.();
  }

  /** Idempotent: if the account's session is already running, returns
   * the existing one instead of starting a second, conflicting browser -
   * this is what lets a second device "open the same session." */
  async start(accountId: string): Promise<SessionInfo> {
    const existing = this.sessions.get(accountId);
    if (existing) {
      existing.lastActivityAt = new Date();
      return this.toInfo(existing);
    }

    const inFlight = this.starting.get(accountId);
    if (inFlight) {
      return inFlight;
    }

    if (this.sessions.size >= config.maxConcurrentSessions) {
      throw new ConcurrencyLimitError();
    }

    const startPromise = this.doStart(accountId).finally(() => {
      this.starting.delete(accountId);
    });
    this.starting.set(accountId, startPromise);
    return startPromise;
  }

  private async doStart(accountId: string): Promise<SessionInfo> {
    const profileDir = await ensureProfileVolume(accountId);
    const xvfb = await startXvfb();

    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        executablePath: config.chromiumExecutablePath,
        viewport: { width: config.viewportWidth, height: config.viewportHeight },
        env: { ...process.env, DISPLAY: xvfb.displayName },
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
    } catch (err) {
      await xvfb.stop();
      throw err;
    }

    const page = context.pages()[0] ?? (await context.newPage());

    let vnc: X11vncHandle;
    let ws: WebsockifyHandle;
    try {
      vnc = await startX11vnc(xvfb.displayName);
      ws = await startWebsockify(vnc.port);
    } catch (err) {
      await context.close();
      await xvfb.stop();
      throw err;
    }

    const session: RunningSession = {
      accountId,
      context,
      page,
      xvfb,
      vnc,
      ws,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.sessions.set(accountId, session);
    return this.toInfo(session);
  }

  async stop(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;
    this.sessions.delete(accountId);
    // Closing the persistent context flushes cookies/localStorage/
    // IndexedDB to the profile directory (the Docker volume) - this is
    // the write that makes the data survive after everything below is
    // torn down.
    await session.context.close().catch(() => undefined);
    await session.ws.stop().catch(() => undefined);
    await session.vnc.stop().catch(() => undefined);
    await session.xvfb.stop().catch(() => undefined);
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.stop(id)));
    if (this.reapTimer) clearInterval(this.reapTimer);
  }

  status(accountId: string): SessionInfo {
    const session = this.sessions.get(accountId);
    if (!session) {
      return { accountId, status: BrowserSessionStatus.STOPPED, vncWebSocketPort: null, startedAt: null };
    }
    return this.toInfo(session);
  }

  /** Test/internal use: the live page for an account's running session. */
  getPage(accountId: string): Page | null {
    const session = this.sessions.get(accountId);
    if (session) session.lastActivityAt = new Date();
    return session?.page ?? null;
  }

  isRunning(accountId: string): boolean {
    return this.sessions.has(accountId);
  }

  private toInfo(session: RunningSession): SessionInfo {
    return {
      accountId: session.accountId,
      status: BrowserSessionStatus.RUNNING,
      vncWebSocketPort: session.ws.port,
      startedAt: session.startedAt.toISOString(),
    };
  }

  private async reapIdleSessions(): Promise<void> {
    const cutoff = Date.now() - config.idleTimeoutSeconds * 1000;
    for (const [accountId, session] of this.sessions) {
      if (session.lastActivityAt.getTime() < cutoff) {
        await this.stop(accountId);
      }
    }
  }
}
