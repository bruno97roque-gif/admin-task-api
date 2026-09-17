import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AUTH, type Auth } from './feature/auth/better-auth';
import { origenesDelFront, RUTA_AUTH } from './feature/auth/sesion.reglas';
import { RUTA_DOCS, configurarSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Railway pone un proxy adelante: sin esto `req.ip` sería siempre el del
  // proxy.
  app.set('trust proxy', 1);

  // credentials:true es obligatorio para que el navegador mande la cookie de
  // sesión. Con credenciales no se permite origin "*": si CORS_ORIGIN no está
  // definido se refleja el origen de la petición.
  const origenes = origenesDelFront(process.env.CORS_ORIGIN);
  app.enableCors({
    origin: origenes.length > 0 ? origenes : true,
    credentials: true,
  });

  // El login (better-auth) atiende sus rutas por su cuenta, por fuera del
  // router de Nest. **El orden importa**: va después de CORS y antes del
  // lector de JSON, porque better-auth lee el cuerpo él mismo.
  const auth = app.get<Auth>(AUTH);
  app
    .getHttpAdapter()
    .getInstance()
    .all(`${RUTA_AUTH}/*splat`, toNodeHandler(auth));

  // Las fotos de perfil llegan en base64 (hasta ~400 KB); el tope por defecto
  // de Express es 100 KB.
  app.useBodyParser('json', { limit: '600kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

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
