-- AlterTable
ALTER TABLE "seguimientos" ADD COLUMN     "codigo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "seguimientos_codigo_key" ON "seguimientos"("codigo");
