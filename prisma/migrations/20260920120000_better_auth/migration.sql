-- Login con better-auth.
-- Solo agrega: columnas nuevas con valor por defecto en users, las tablas
-- de sesiones, cuentas de acceso y verificaciones, y una fila de acceso por
-- usuario que copia su contraseña actual (el mismo hash argon2), para que
-- todos sigan entrando con la de siempre. No modifica ni borra nada.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "sesiones" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_acceso" (
    "id" SERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificaciones" (
    "id" SERIAL NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_key" ON "sesiones"("token");

-- CreateIndex
CREATE INDEX "sesiones_user_id_idx" ON "sesiones"("user_id");

-- CreateIndex
CREATE INDEX "cuentas_acceso_user_id_idx" ON "cuentas_acceso"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_acceso_provider_id_account_id_key" ON "cuentas_acceso"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verificaciones_identifier_idx" ON "verificaciones"("identifier");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_acceso" ADD CONSTRAINT "cuentas_acceso_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Una cuenta de acceso por usuario, con la contraseña que ya tiene.
-- `account_id` es el id del usuario como texto: así lo arma better-auth.
INSERT INTO "cuentas_acceso" ("account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT "id"::text, 'credential', "id", "password", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";
