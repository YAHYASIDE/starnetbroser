import { Controller, Post, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BrowserService } from "./browser.service";

@UseGuards(JwtAuthGuard)
@Controller("accounts/:id/session")
export class BrowserController {
  constructor(private readonly browser: BrowserService) {}

  @Post("open")
  open(@CurrentUser() user: { sub: string }, @Param("id") accountId: string) {
    return this.browser.open(user.sub, accountId);
  }

  @Post("stop")
  async stop(@CurrentUser() user: { sub: string }, @Param("id") accountId: string) {
    await this.browser.stop(user.sub, accountId);
    return { ok: true };
  }

  @Get("status")
  status(@CurrentUser() user: { sub: string }, @Param("id") accountId: string) {
    return this.browser.status(user.sub, accountId);
  }
}
