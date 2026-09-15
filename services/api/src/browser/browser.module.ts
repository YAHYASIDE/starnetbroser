import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BrowserService } from "./browser.service";
import { BrowserController } from "./browser.controller";
import { WorkerClientService } from "./worker-client.service";
import { VncProxyService } from "./vnc-proxy.service";

@Module({
  imports: [AuthModule],
  providers: [BrowserService, WorkerClientService, VncProxyService],
  controllers: [BrowserController],
  exports: [BrowserService],
})
export class BrowserModule {}
