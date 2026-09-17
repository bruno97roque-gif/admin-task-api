-- Comunicados de administración para todos (login y dentro del sistema).
-- Solo agrega: un valor al enum de notificaciones, un enum nuevo y dos
-- tablas nuevas. No modifica ni borra nada de lo que ya existe.

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'Comunicado';

-- CreateEnum
CREATE TYPE "NivelComunicado" AS ENUM ('Info', 'Importante', 'Urgente');

-- CreateTable
CREATE TABLE "comunicados" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "nivel" "NivelComunicado" NOT NULL DEFAULT 'Info',
    "en_login" BOOLEAN NOT NULL DEFAULT false,
    "en_sistema" BOOLEAN NOT NULL DEFAULT true,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "creador_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicados_cierres" (
    "comunicado_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cerrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicados_cierres_pkey" PRIMARY KEY ("comunicado_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "comunicados_desde_idx" ON "comunicados"("desde");

-- AddForeignKey
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_creador_id_fkey" FOREIGN KEY ("creador_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicados_cierres" ADD CONSTRAINT "comunicados_cierres_comunicado_id_fkey" FOREIGN KEY ("comunicado_id") REFERENCES "comunicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicados_cierres" ADD CONSTRAINT "comunicados_cierres_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
