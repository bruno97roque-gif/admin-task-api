-- Historial de cada cambio de proyectos.estado_pago. Solo agrega una tabla.
CREATE TABLE "historial_pagos" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "estado_anterior" TEXT,
    "estado_nuevo" TEXT NOT NULL,
    "nota" TEXT,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_pagos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "historial_pagos_proyecto_id_idx" ON "historial_pagos"("proyecto_id");
CREATE INDEX "historial_pagos_usuario_id_idx" ON "historial_pagos"("usuario_id");

ALTER TABLE "historial_pagos" ADD CONSTRAINT "historial_pagos_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "historial_pagos" ADD CONSTRAINT "historial_pagos_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
