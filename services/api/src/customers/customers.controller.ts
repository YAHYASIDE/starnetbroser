import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto/customer.dto";

@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.customers.list(user.sub);
  }

  @Get(":id")
  get(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    return this.customers.get(user.sub, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: { sub: string }, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(user.sub, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    await this.customers.remove(user.sub, id);
    return { ok: true };
  }
}
