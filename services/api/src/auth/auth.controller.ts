import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { TotpCodeDto } from "./dto/totp.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.deviceName);
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, {
      deviceName: dto.deviceName,
      deviceId: dto.deviceId,
      totpCode: dto.totpCode,
      ipAddress: clientIp(req),
    });
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("devices")
  listDevices(@CurrentUser() user: { sub: string }) {
    return this.auth.listDevices(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("devices/:id")
  async revokeDevice(@CurrentUser() user: { sub: string }, @Param("id") deviceId: string) {
    await this.auth.revokeDevice(user.sub, deviceId);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("totp/setup")
  setupTotp(@CurrentUser() user: { sub: string }) {
    return this.auth.setupTotp(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("totp/enable")
  async enableTotp(@CurrentUser() user: { sub: string }, @Body() dto: TotpCodeDto) {
    await this.auth.enableTotp(user.sub, dto.code);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("totp/disable")
  async disableTotp(@CurrentUser() user: { sub: string }, @Body() dto: TotpCodeDto) {
    await this.auth.disableTotp(user.sub, dto.code);
    return { ok: true };
  }
}
