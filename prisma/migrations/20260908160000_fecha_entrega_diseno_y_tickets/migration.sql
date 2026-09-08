-- Fecha de entrega del diseño (aparte de la de entrega final) y sistema de
-- tickets para las notas del equipo: estado, categoría e hilo de respuestas.
--
-- Puramente aditiva: columnas nuevas con default, dos enums nuevos, un valor
-- nuevo en un enum existente y una tabla nueva. No se modifica ni se borra
-- ninguna columna, y ninguna fila se reescribe.
--
-- `fecha_entrega` no se toca: sigue siendo la entrega final, así que lo
-- cargado hasta hoy conserva su significado.

-- CreateEnum
CREATE TYPE "EstadoNota" AS ENUM ('Pendiente', 'EnCurso', 'Resuelta');
CREATE TYPE "CategoriaNota" AS ENUM ('Consulta', 'Bloqueo', 'Material', 'Cambio', 'Otro');

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'NotaRespondida';

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "fecha_entrega_diseno" TIMESTAMP(3);

-- AlterTable
-- Las notas que ya existen quedan en Pendiente y Otro, que es lo que eran.
ALTER TABLE "notas_admin" ADD COLUMN IF NOT EXISTS "estado" "EstadoNota" NOT NULL DEFAULT 'Pendiente';
ALTER TABLE "notas_admin" ADD COLUMN IF NOT EXISTS "categoria" "CategoriaNota" NOT NULL DEFAULT 'Otro';
ALTER TABLE "notas_admin" ADD COLUMN IF NOT EXISTS "ultima_respuesta_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "respuestas_nota" (
    "id" SERIAL NOT NULL,
    "nota_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "contenido" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuestas_nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_admin_estado_idx" ON "notas_admin"("estado");
CREATE INDEX "respuestas_nota_nota_id_idx" ON "respuestas_nota"("nota_id");
CREATE INDEX "respuestas_nota_autor_id_idx" ON "respuestas_nota"("autor_id");

-- AddForeignKey
ALTER TABLE "respuestas_nota" ADD CONSTRAINT "respuestas_nota_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respuestas_nota" ADD CONSTRAINT "respuestas_nota_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
