-- Migración aditiva: no borra ni reescribe ninguna fila existente.
-- Todas las columnas nuevas llevan default o son nullables, así que los
-- proyectos que ya están cargados quedan válidos sin tocarlos.

-- AlterEnum
-- Postgres 12+ permite ADD VALUE dentro de la transacción de la migración
-- siempre que el valor nuevo no se use en esa misma transacción.
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'Registro' BEFORE 'Brief';
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'Archivado' AFTER 'Proyecto Finalizado';

-- CreateEnum
CREATE TYPE "HitoCobro" AS ENUM ('AbonoInicial', 'AprobacionDiseno', 'Entrega');

-- AlterTable
ALTER TABLE "proyectos"
  ADD COLUMN "material_marca_recibido"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "catalogo_recibido"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rondas_cambios_usadas"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fecha_ultimo_cambio_estado" TIMESTAMP(3),
  ADD COLUMN "archivado_at"               TIMESTAMP(3),
  ADD COLUMN "disenador_id"               INTEGER,
  ADD COLUMN "desarrollador_id"           INTEGER;

-- CreateTable
CREATE TABLE "cobros" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "hito" "HitoCobro" NOT NULL,
    "porcentaje" INTEGER NOT NULL,
    "cobrado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_cobro" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_etapas" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "estado_anterior" "EstadoProyecto",
    "estado_nuevo" "EstadoProyecto" NOT NULL,
    "grupo_anterior" "Grupo",
    "grupo_nuevo" "Grupo" NOT NULL,
    "motivo" TEXT,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_etapas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proyectos_disenador_id_idx" ON "proyectos"("disenador_id");

-- CreateIndex
CREATE INDEX "proyectos_desarrollador_id_idx" ON "proyectos"("desarrollador_id");

-- CreateIndex
CREATE INDEX "cobros_proyecto_id_idx" ON "cobros"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "cobros_proyecto_id_hito_key" ON "cobros"("proyecto_id", "hito");

-- CreateIndex
CREATE INDEX "historial_etapas_proyecto_id_idx" ON "historial_etapas"("proyecto_id");

-- CreateIndex
CREATE INDEX "historial_etapas_usuario_id_idx" ON "historial_etapas"("usuario_id");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_disenador_id_fkey" FOREIGN KEY ("disenador_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_desarrollador_id_fkey" FOREIGN KEY ("desarrollador_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_etapas" ADD CONSTRAINT "historial_etapas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_etapas" ADD CONSTRAINT "historial_etapas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
