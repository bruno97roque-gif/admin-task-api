-- Notificaciones internas, reuniones y notas al administrador.
--
-- Puramente aditiva: tres tablas nuevas (más el join de participantes) y un
-- enum nuevo. No toca ninguna tabla ni fila existente.

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('ProyectoAsignado', 'EtapaFinalizada', 'ReunionProgramada', 'NotaRecibida');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "proyecto_id" INTEGER,
    "leida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reuniones" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "link_meet" TEXT NOT NULL,
    "proyecto_id" INTEGER,
    "creador_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reuniones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reuniones_usuarios" (
    "reunion_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "reuniones_usuarios_pkey" PRIMARY KEY ("reunion_id","usuario_id")
);

-- CreateTable
CREATE TABLE "notas_admin" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "contenido" TEXT NOT NULL,
    "leida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_leida_at_idx" ON "notificaciones"("usuario_id", "leida_at");
CREATE INDEX "notificaciones_proyecto_id_idx" ON "notificaciones"("proyecto_id");
CREATE INDEX "reuniones_fecha_idx" ON "reuniones"("fecha");
CREATE INDEX "reuniones_proyecto_id_idx" ON "reuniones"("proyecto_id");
CREATE INDEX "reuniones_usuarios_usuario_id_idx" ON "reuniones_usuarios"("usuario_id");
CREATE INDEX "notas_admin_proyecto_id_idx" ON "notas_admin"("proyecto_id");
CREATE INDEX "notas_admin_autor_id_idx" ON "notas_admin"("autor_id");
CREATE INDEX "notas_admin_leida_at_idx" ON "notas_admin"("leida_at");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reuniones" ADD CONSTRAINT "reuniones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reuniones" ADD CONSTRAINT "reuniones_creador_id_fkey" FOREIGN KEY ("creador_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reuniones_usuarios" ADD CONSTRAINT "reuniones_usuarios_reunion_id_fkey" FOREIGN KEY ("reunion_id") REFERENCES "reuniones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reuniones_usuarios" ADD CONSTRAINT "reuniones_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notas_admin" ADD CONSTRAINT "notas_admin_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notas_admin" ADD CONSTRAINT "notas_admin_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
