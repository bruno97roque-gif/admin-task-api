-- Correos de clientes que se suman a la invitación de Google Calendar.
-- Solo agrega: las reuniones existentes quedan con la lista vacía.
ALTER TABLE "reuniones" ADD COLUMN "invitados_externos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
