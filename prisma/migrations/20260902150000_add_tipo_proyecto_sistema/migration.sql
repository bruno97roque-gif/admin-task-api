-- Agrega el valor 'Sistema' al enum `TipoProyecto`.
--
-- Es **puramente aditiva**: no se elimina ni renombra ningún valor existente,
-- no se toca ninguna fila. Hoy no hay ningún proyecto con este tipo — se
-- deja disponible para asignarlo a mano (como Informativa/Ecommerce) de acá
-- en adelante. Sin `BEFORE`/`AFTER`: el orden de este enum no tiene
-- significado de pipeline (a diferencia de `EstadoProyecto`), así que se
-- agrega al final.
ALTER TYPE "TipoProyecto" ADD VALUE IF NOT EXISTS 'Sistema';
