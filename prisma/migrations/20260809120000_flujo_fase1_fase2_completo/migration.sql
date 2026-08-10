-- Completa el flujo del diagrama «Flujo de trabajo (mejorado).drawio»:
-- bifurcación por tipo de proyecto, compuertas de material/catálogo/hosting,
-- tramo final (presentación → producción → capacitación), los cinco
-- recordatorios y las cotizaciones adicionales.
--
-- ESCRITA A MANO, NO GENERADA. `prisma migrate diff` resolvía el cambio de
-- `tipo_proyecto` de TEXT a enum con un DROP COLUMN + ADD COLUMN, que habría
-- borrado los 39 valores que ya hay cargados. Acá se hace con un cast in situ.
--
-- Todo es aditivo: no borra columnas ni filas. Las columnas nuevas llevan
-- DEFAULT o son NULL-ables, así que las 52 filas existentes quedan válidas.

-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('Informativa', 'E-commerce');

-- CreateEnum
CREATE TYPE "TipoRecordatorio" AS ENUM ('MaterialMarca', 'Catalogo', 'CobroAprobacionDiseno', 'CobroEntrega', 'Hosting');

-- Red de seguridad: si algún proyecto tuviera un tipo distinto de los dos
-- valores esperados, la migración corta acá con un mensaje claro en vez de
-- fallar con un error de cast ilegible. Al momento de escribirla había
-- 23 'E-commerce', 16 'Informativa' y 13 NULL.
DO $$
DECLARE
  invalidos TEXT;
BEGIN
  SELECT string_agg(DISTINCT "tipo_proyecto", ', ')
    INTO invalidos
    FROM "proyectos"
   WHERE "tipo_proyecto" IS NOT NULL
     AND "tipo_proyecto" NOT IN ('Informativa', 'E-commerce');

  IF invalidos IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede convertir "proyectos"."tipo_proyecto" a enum: hay valores fuera de (Informativa, E-commerce): %. Normalizalos antes de aplicar esta migración.',
      invalidos;
  END IF;
END $$;

-- AlterTable: TEXT -> enum conservando los datos. NULL sigue siendo NULL.
ALTER TABLE "proyectos"
  ALTER COLUMN "tipo_proyecto" TYPE "TipoProyecto"
  USING "tipo_proyecto"::"TipoProyecto";

-- AlterTable: compuertas y tramo final del flujo
ALTER TABLE "proyectos"
  ADD COLUMN "hosting_contratado"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "factibilidad_revisada_at" TIMESTAMP(3),
  ADD COLUMN "diseno_aprobado_at"       TIMESTAMP(3),
  ADD COLUMN "productos_cargados"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "presentado_at"            TIMESTAMP(3),
  ADD COLUMN "subido_produccion_at"     TIMESTAMP(3),
  ADD COLUMN "capacitacion_at"          TIMESTAMP(3);

-- CreateTable
CREATE TABLE "recordatorios_proyecto" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "tipo" "TipoRecordatorio" NOT NULL,
    "resuelto_at" TIMESTAMP(3),
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordatorios_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones_adicionales" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "aprobada" BOOLEAN NOT NULL DEFAULT false,
    "cobrada" BOOLEAN NOT NULL DEFAULT false,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recordatorios_proyecto_proyecto_id_idx" ON "recordatorios_proyecto"("proyecto_id");

-- CreateIndex
CREATE INDEX "recordatorios_proyecto_usuario_id_idx" ON "recordatorios_proyecto"("usuario_id");

-- CreateIndex
CREATE INDEX "recordatorios_proyecto_resuelto_at_idx" ON "recordatorios_proyecto"("resuelto_at");

-- CreateIndex
CREATE INDEX "cotizaciones_adicionales_proyecto_id_idx" ON "cotizaciones_adicionales"("proyecto_id");

-- CreateIndex
CREATE INDEX "cotizaciones_adicionales_usuario_id_idx" ON "cotizaciones_adicionales"("usuario_id");

-- AddForeignKey
ALTER TABLE "recordatorios_proyecto" ADD CONSTRAINT "recordatorios_proyecto_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios_proyecto" ADD CONSTRAINT "recordatorios_proyecto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones_adicionales" ADD CONSTRAINT "cotizaciones_adicionales_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones_adicionales" ADD CONSTRAINT "cotizaciones_adicionales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
