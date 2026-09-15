import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto/customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerUserId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { ownerUserId, name: dto.name, notes: dto.notes ?? "" },
    });
  }

  list(ownerUserId: string) {
    return this.prisma.customer.findMany({
      where: { ownerUserId },
      orderBy: { name: "asc" },
    });
  }

  async get(ownerUserId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, ownerUserId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  async update(ownerUserId: string, id: string, dto: UpdateCustomerDto) {
    await this.get(ownerUserId, id);
    return this.prisma.customer.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}) },
    });
  }

  async remove(ownerUserId: string, id: string) {
    await this.get(ownerUserId, id);
    await this.prisma.customer.delete({ where: { id } });
  }
}
