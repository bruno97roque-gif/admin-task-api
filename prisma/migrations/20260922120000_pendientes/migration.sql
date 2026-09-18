-- Pendientes personales por proyecto (to do list de cada persona).
-- Solo agrega una tabla nueva. No modifica ni borra nada.

-- CreateTable
CREATE TABLE "pendientes" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "hecho" BOOLEAN NOT NULL DEFAULT false,
    "hecho_at" TIMESTAMP(3),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendientes_proyecto_id_usuario_id_idx" ON "pendientes"("proyecto_id", "usuario_id");

-- CreateIndex
CREATE INDEX "pendientes_usuario_id_idx" ON "pendientes"("usuario_id");

-- AddForeignKey
ALTER TABLE "pendientes" ADD CONSTRAINT "pendientes_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendientes" ADD CONSTRAINT "pendientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

