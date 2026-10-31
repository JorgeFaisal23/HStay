-- Pagos parciales y fin de contrato.
--
-- Cada pago pasa a ser una fila de RentPayment; RentCharge conserva el
-- resumen (suma, estado, datos del último pago). Los cargos que ya tenían
-- algo pagado se convierten en un pago con esos mismos datos.

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RentPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rentChargeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentPayment_rentChargeId_idx" ON "RentPayment"("rentChargeId");

-- CreateIndex
CREATE INDEX "RentPayment_organizationId_paidAt_idx" ON "RentPayment"("organizationId", "paidAt");

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_rentChargeId_fkey" FOREIGN KEY ("rentChargeId") REFERENCES "RentCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Relleno: un pago por cada cargo con monto pagado.
INSERT INTO "RentPayment" ("id", "organizationId", "rentChargeId", "amount", "paidAt", "method", "reference", "receiptUrl", "createdAt")
SELECT 'pay' || substr(md5(c."id"), 1, 22),
       c."organizationId",
       c."id",
       c."paidAmount",
       COALESCE(c."paidAt", c."updatedAt"),
       COALESCE(NULLIF(c."method", ''), 'Sin especificar'),
       c."reference",
       c."receiptUrl",
       COALESCE(c."paidAt", c."updatedAt")
FROM "RentCharge" c
WHERE c."paidAmount" > 0;

-- Los contratos que ya estaban terminados o cancelados no tenían fecha de fin.
UPDATE "Lease" SET "endedAt" = "updatedAt" WHERE "status" IN ('ENDED', 'CANCELLED') AND "endedAt" IS NULL;
