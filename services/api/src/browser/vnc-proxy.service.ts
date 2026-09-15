import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import httpProxy from "http-proxy";
import type { IncomingMessage, Server } from "http";
import type { Socket } from "net";
import { BrowserService } from "./browser.service";
import { WorkerClientService } from "./worker-client.service";

const TICKET_PATH = /^\/ws\/vnc\/([^/]+)$/;

/**
 * The only bridge between a phone and the worker's real VNC stream - a
 * phone never talks to x11vnc/websockify directly (those are bound to
 * 127.0.0.1 on the worker), and never gets the worker's internal
 * host/port. It presents a short-lived ticket (from BrowserService.open)
 * on a WebSocket upgrade request; this resolves that ticket to a live
 * session and proxies the raw WebSocket bytes to the worker.
 */
@Injectable()
export class VncProxyService implements OnModuleInit {
  private readonly logger = new Logger(VncProxyService.name);
  private readonly proxy = httpProxy.createProxyServer({ ws: true });

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly browser: BrowserService,
    private readonly worker: WorkerClientService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handleUpgrade(req, socket, head).catch((err) => {
        this.logger.error(`VNC proxy upgrade failed: ${err instanceof Error ? err.message : err}`);
        socket.destroy();
      });
    });

    this.proxy.on("error", (err) => {
      this.logger.warn(`VNC proxy stream error: ${err.message}`);
    });
  }

  private async handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const match = (req.url ?? "").match(TICKET_PATH);
    if (!match) {
      socket.destroy();
      return;
    }

    const resolved = await this.browser.resolveTicket(match[1]);
    if (!resolved) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const info = await this.worker.status(resolved.accountId);
    if (info.status !== "RUNNING" || !info.vncWebSocketPort) {
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      socket.destroy();
      return;
    }

    const workerBase = this.config.get<string>("WORKER_INTERNAL_URL") ?? "http://localhost:7500";
    const workerHost = new URL(workerBase).hostname;
    this.proxy.ws(req, socket, head, { target: `ws://${workerHost}:${info.vncWebSocketPort}` });
  }
}
