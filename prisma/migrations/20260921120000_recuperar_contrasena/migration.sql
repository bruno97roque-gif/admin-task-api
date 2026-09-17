-- Recuperación de contraseña con ayuda de administración.
-- Solo agrega: un valor al enum de notificaciones y una columna con valor
-- por defecto. No modifica ni borra nada.

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'RecuperarContrasena';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false;
