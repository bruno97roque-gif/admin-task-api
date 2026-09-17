-- Fotos de perfil. Solo agrega una tabla nueva.
CREATE TABLE "fotos_perfil" (
    "usuario_id" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "tipo" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fotos_perfil_pkey" PRIMARY KEY ("usuario_id")
);

ALTER TABLE "fotos_perfil" ADD CONSTRAINT "fotos_perfil_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
