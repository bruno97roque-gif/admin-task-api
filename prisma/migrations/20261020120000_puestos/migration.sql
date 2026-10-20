-- Puestos de trabajo por persona, aparte del rol (que sigue decidiendo permisos).
-- Solo agrega: un enum y una tabla nuevos, sin tocar nada existente.
CREATE TYPE "Puesto" AS ENUM ('Diseno', 'Desarrollo');

CREATE TABLE "usuarios_puestos" (
    "usuario_id" INTEGER NOT NULL,
    "puesto" "Puesto" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_puestos_pkey" PRIMARY KEY ("usuario_id","puesto")
);

ALTER TABLE "usuarios_puestos" ADD CONSTRAINT "usuarios_puestos_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
