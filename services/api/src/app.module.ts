import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { VaultModule } from "./vault/vault.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    PrismaModule,
    VaultModule,
    AuditModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
