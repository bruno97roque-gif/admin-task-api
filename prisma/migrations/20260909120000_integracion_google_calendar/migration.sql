-- Integración con Google Calendar y Meet.
--
-- Solo agrega: una tabla nueva y tres columnas en `reuniones`. No modifica ni
-- borra nada de lo que ya existe.
--
-- `grabar_reunion` entra con DEFAULT true, así que las reuniones que ya están
-- cargadas quedan en true sin necesidad de un UPDATE. Como todavía no tienen
-- `google_event_id`, ninguna se considera enviada: el valor recién pesa cuando
-- administración manda una al Calendar.

-- AlterTable
ALTER TABLE "reuniones" ADD COLUMN "google_event_id" TEXT;
ALTER TABLE "reuniones" ADD COLUMN "enviada_at" TIMESTAMP(3);
ALTER TABLE "reuniones" ADD COLUMN "grabar_reunion" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "integraciones_google" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "conectada_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integraciones_google_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integraciones_google_usuario_id_key" ON "integraciones_google"("usuario_id");

-- AddForeignKey
ALTER TABLE "integraciones_google" ADD CONSTRAINT "integraciones_google_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
