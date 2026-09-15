import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { resolveCorsOrigin } from "./config/cors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveCorsOrigin(process.env.CORS_ALLOW_ORIGINS) });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 8000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`STAR NET API listening on :${port}`);
}

bootstrap();
