-- Aviso automático unos minutos antes de que arranque la reunión.
-- Solo agrega: un valor nuevo al enum y una columna nullable. No modifica
-- ni borra nada de lo que ya existe.

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'ReunionProxima';

-- AlterTable
ALTER TABLE "reuniones" ADD COLUMN "aviso_previo_at" TIMESTAMP(3);
