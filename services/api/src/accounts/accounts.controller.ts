import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";

@UseGuards(JwtAuthGuard)
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user.sub, dto);
  }

  /** Home-page search across all of this user's accounts, and/or a single customer's accounts. */
  @Get()
  search(
    @CurrentUser() user: { sub: string },
    @Query("customerId") customerId?: string,
    @Query("q") q?: string,
  ) {
    if (customerId) {
      return this.accounts.listByCustomer(user.sub, customerId);
    }
    return this.accounts.search(user.sub, q);
  }

  @Get(":id")
  get(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    return this.accounts.getDetail(user.sub, id);
  }

  /** Explicit, audited decrypt of password/wifi code/notes - the UI "reveal" button. */
  @Post(":id/reveal")
  reveal(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    return this.accounts.reveal(user.sub, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: { sub: string }, @Param("id") id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(user.sub, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    await this.accounts.remove(user.sub, id);
    return { ok: true };
  }
}
