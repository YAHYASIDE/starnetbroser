import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrowserSessionStatus } from "@starnet/shared";

export interface WorkerSessionInfo {
  accountId: string;
  status: BrowserSessionStatus;
  vncWebSocketPort: number | null;
  startedAt: string | null;
}

/**
 * HTTP client for services/browser-worker's internal-only control API.
 * This is the ONLY thing that ever talks to the worker directly - never
 * the phone, never a browser. See docs/ARCHITECTURE.md for the network
 * isolation this depends on.
 */
@Injectable()
export class WorkerClientService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("WORKER_INTERNAL_URL") ?? "http://localhost:7500";
    this.token = this.config.get<string>("WORKER_INTERNAL_TOKEN") ?? "";
  }

  private async call(path: string, method: "GET" | "POST"): Promise<WorkerSessionInfo> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.token ? { "x-internal-token": this.token } : {},
      });
    } catch {
      throw new ServiceUnavailableException("Browser worker is unreachable");
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`Browser worker returned ${res.status}`);
    }
    return res.json() as Promise<WorkerSessionInfo>;
  }

  start(accountId: string): Promise<WorkerSessionInfo> {
    return this.call(`/sessions/${accountId}/start`, "POST");
  }

  stop(accountId: string): Promise<WorkerSessionInfo> {
    return this.call(`/sessions/${accountId}/stop`, "POST");
  }

  status(accountId: string): Promise<WorkerSessionInfo> {
    return this.call(`/sessions/${accountId}/status`, "GET");
  }
}
