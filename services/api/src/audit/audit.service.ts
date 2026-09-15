import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The single writer for the audit_log table. `detail` must only ever be
 * built from non-secret fields (no passwords, tokens, cookies, TOTP codes).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    userId?: string;
    deviceId?: string;
    accountId?: string;
    action: string;
    detail?: string;
    ipAddress?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        deviceId: entry.deviceId,
        accountId: entry.accountId,
        action: entry.action,
        detail: entry.detail ?? "",
        ipAddress: entry.ipAddress ?? "",
      },
    });
  }
}
