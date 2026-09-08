-- Correo del usuario (para invitarlo al evento de Google Calendar) y enlace a
-- la carpeta de materiales del proyecto.
--
-- Puramente aditiva: dos columnas nuevas, ambas opcionales. No se modifica ni
-- se borra nada, y las filas existentes quedan con NULL.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "enlace_materiales" TEXT;
