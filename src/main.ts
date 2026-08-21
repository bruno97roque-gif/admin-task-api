import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { RUTA_DOCS, configurarSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.use(cookieParser());

  // credentials:true es obligatorio para que el navegador mande la cookie de
  // refresh. Con credenciales no se permite origin "*": si CORS_ORIGIN no está
  // definido se refleja el origen de la petición.
  const origenes = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
  app.enableCors({ origin: origenes ?? true, credentials: true });

  // La documentación queda pública (Swagger se monta sobre Express, por fuera
  // de los guards globales). SWAGGER_ENABLED=false la apaga.
  if (process.env.SWAGGER_ENABLED !== 'false') {
    configurarSwagger(app);
  }

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);

  if (process.env.SWAGGER_ENABLED !== 'false') {
    console.log(`Documentación disponible en /${RUTA_DOCS}`);
  }
}
void bootstrap();
