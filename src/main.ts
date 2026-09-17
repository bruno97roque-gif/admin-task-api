import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { RUTA_DOCS, configurarSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Railway pone un proxy adelante: sin esto `req.ip` sería siempre el del
  // proxy y el límite de intentos del login bloquearía a todos juntos.
  app.set('trust proxy', 1);
  // Las fotos de perfil llegan en base64 (hasta ~400 KB); el tope por defecto
  // de Express es 100 KB.
  app.useBodyParser('json', { limit: '600kb' });
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
