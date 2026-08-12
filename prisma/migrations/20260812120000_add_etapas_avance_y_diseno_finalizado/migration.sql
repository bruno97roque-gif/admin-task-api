-- Agrega las dos etapas nuevas de diseño al enum `EstadoProyecto`.
--
-- Es **puramente aditiva**: no se elimina el valor 'Diseño' ni se toca ninguna
-- fila. Los 7 proyectos y las 5 filas de `historial_etapas` que hoy están en
-- 'Diseño' siguen exactamente igual; las etapas nuevas quedan disponibles para
-- que el flujo las use de acá en adelante.
--
-- Se posicionan con `BEFORE 'Desarrollo'` para que el orden físico del enum en
-- la base coincida con el del pipeline (`ORDEN_ETAPAS` en `flujo.reglas.ts`) y
-- no queden colgadas al final: cualquier `ORDER BY estado_proyecto` ordena por
-- ese orden, no alfabéticamente. Las dos se anclan a un valor que **ya existía**
-- ('Desarrollo') a propósito: encadenarlas (`AFTER 'Avance de Diseño'`) haría
-- que la segunda sentencia referencie un valor creado en la misma transacción.
--
-- `IF NOT EXISTS` hace la migración reejecutable sin error si alguien ya había
-- agregado el valor a mano.
--
-- Nota de PostgreSQL: `ALTER TYPE ... ADD VALUE` dentro de una transacción está
-- permitido desde PG 12 mientras el valor nuevo no se *use* en la misma
-- transacción. Acá solo se declara, así que es seguro. La base corre PG 18.

-- Las dos se insertan justo antes de 'Desarrollo'; como la segunda se agrega
-- después, queda entre la primera y 'Desarrollo'. Resultado:
--   … Taxonomia, Diseño, Avance de Diseño, Diseño Finalizado, Desarrollo …
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'Avance de Diseño' BEFORE 'Desarrollo';
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'Diseño Finalizado' BEFORE 'Desarrollo';
