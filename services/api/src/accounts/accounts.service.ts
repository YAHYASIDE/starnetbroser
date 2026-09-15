import { Injectable, NotFoundException } from "@nestjs/common";
import type { StarlinkAccount } from "@prisma/client";
import { DeviceStatus, StarlinkAccountDetail, StarlinkAccountSummary } from "@starnet/shared";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "../vault/vault.service";
import { AuditService } from "../audit/audit.service";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";

function toStatus(value: string): DeviceStatus {
  return (Object.values(DeviceStatus) as string[]).includes(value) ? (value as DeviceStatus) : DeviceStatus.UNKNOWN;
}

function toSummary(a: StarlinkAccount): StarlinkAccountSummary {
  return {
    id: a.id,
    customerId: a.customerId,
    name: a.name,
    deviceName: a.deviceName,
    kitNumber: a.kitNumber,
    serialNumber: a.serialNumber,
    standbyDate: a.standbyDate,
    rechargeDate: a.rechargeDate,
    balanceDue: a.balanceDue,
    currency: a.currency,
    dishStatus: toStatus(a.dishStatus),
    wifiStatus: toStatus(a.wifiStatus),
    alertReason: a.alertReason,
    lastUpdated: a.lastUpdated,
    lastSuccessfulScanAt: a.lastSuccessfulScanAt ? a.lastSuccessfulScanAt.toISOString() : null,
    planName: a.planName,
  };
}

/**
 * Detail view with secrets REDACTED - used for normal "open account" views.
 * Use AccountsService.reveal() for the explicit, audited decrypt path.
 */
function toRedactedDetail(a: StarlinkAccount): StarlinkAccountDetail {
  return {
    ...toSummary(a),
    email: a.email,
    emailSecret: a.emailSecretEnc ? "••••••••" : "",
    wifiCode: a.wifiCodeEnc ? "••••••••" : "",
    notes: a.notesEnc ? "••••••••" : "",
    accountNumber: a.accountNumber,
    subscriptionId: a.subscriptionId,
    starlinkId: a.starlinkId,
    serviceStatus: a.serviceStatus,
    serviceLocation: a.serviceLocation,
    billingPeriod: a.billingPeriod,
    paymentDueDate: a.paymentDueDate,
    softwareVersion: a.softwareVersion,
    uptime: a.uptime,
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly audit: AuditService,
  ) {}

  private async assertCustomerOwned(ownerUserId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, ownerUserId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private async findOwned(ownerUserId: string, id: string): Promise<StarlinkAccount> {
    const account = await this.prisma.starlinkAccount.findFirst({
      where: { id, customer: { ownerUserId } },
    });
    if (!account) {
      throw new NotFoundException("Account not found");
    }
    return account;
  }

  async create(ownerUserId: string, dto: CreateAccountDto): Promise<StarlinkAccountDetail> {
    await this.assertCustomerOwned(ownerUserId, dto.customerId);
    const account = await this.prisma.starlinkAccount.create({
      data: {
        customerId: dto.customerId,
        name: dto.name,
        email: dto.email ?? "",
        emailSecretEnc: dto.password ? this.vault.encrypt(dto.password) : "",
        wifiCodeEnc: dto.wifiCode ? this.vault.encrypt(dto.wifiCode) : "",
        notesEnc: dto.notes ? this.vault.encrypt(dto.notes) : "",
        kitNumber: dto.kitNumber ?? "",
        serialNumber: dto.serialNumber ?? "",
        accountNumber: dto.accountNumber ?? "",
        subscriptionId: dto.subscriptionId ?? "",
        starlinkId: dto.starlinkId ?? "",
        deviceName: dto.deviceName ?? "",
      },
    });
    return toRedactedDetail(account);
  }

  async listByCustomer(ownerUserId: string, customerId: string): Promise<StarlinkAccountSummary[]> {
    await this.assertCustomerOwned(ownerUserId, customerId);
    const accounts = await this.prisma.starlinkAccount.findMany({
      where: { customerId },
      orderBy: { name: "asc" },
    });
    return accounts.map(toSummary);
  }

  /** Home-page search across name/email/KIT/serial/subscription ID, scoped to this user's own customers. */
  async search(ownerUserId: string, q?: string): Promise<StarlinkAccountSummary[]> {
    const accounts = await this.prisma.starlinkAccount.findMany({
      where: {
        customer: { ownerUserId },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { kitNumber: { contains: q, mode: "insensitive" } },
                { serialNumber: { contains: q, mode: "insensitive" } },
                { subscriptionId: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    return accounts.map(toSummary);
  }

  async getDetail(ownerUserId: string, id: string): Promise<StarlinkAccountDetail> {
    const account = await this.findOwned(ownerUserId, id);
    return toRedactedDetail(account);
  }

  async reveal(ownerUserId: string, id: string): Promise<StarlinkAccountDetail> {
    const account = await this.findOwned(ownerUserId, id);
    await this.audit.log({ userId: ownerUserId, accountId: id, action: "account_secrets_revealed" });
    return {
      ...toRedactedDetail(account),
      emailSecret: account.emailSecretEnc ? this.vault.decrypt(account.emailSecretEnc) : "",
      wifiCode: account.wifiCodeEnc ? this.vault.decrypt(account.wifiCodeEnc) : "",
      notes: account.notesEnc ? this.vault.decrypt(account.notesEnc) : "",
    };
  }

  async update(ownerUserId: string, id: string, dto: UpdateAccountDto): Promise<StarlinkAccountDetail> {
    await this.findOwned(ownerUserId, id);
    const account = await this.prisma.starlinkAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.password !== undefined ? { emailSecretEnc: dto.password ? this.vault.encrypt(dto.password) : "" } : {}),
        ...(dto.wifiCode !== undefined ? { wifiCodeEnc: dto.wifiCode ? this.vault.encrypt(dto.wifiCode) : "" } : {}),
        ...(dto.notes !== undefined ? { notesEnc: dto.notes ? this.vault.encrypt(dto.notes) : "" } : {}),
        ...(dto.kitNumber !== undefined ? { kitNumber: dto.kitNumber } : {}),
        ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
        ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber } : {}),
        ...(dto.subscriptionId !== undefined ? { subscriptionId: dto.subscriptionId } : {}),
        ...(dto.starlinkId !== undefined ? { starlinkId: dto.starlinkId } : {}),
        ...(dto.deviceName !== undefined ? { deviceName: dto.deviceName } : {}),
      },
    });
    return toRedactedDetail(account);
  }

  async remove(ownerUserId: string, id: string): Promise<void> {
    await this.findOwned(ownerUserId, id);
    await this.prisma.starlinkAccount.delete({ where: { id } });
  }
}
