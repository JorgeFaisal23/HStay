-- Comprobantes que el inquilino envía desde el portal (B-03).
--
-- Enviar un comprobante no paga nada: queda "por revisar" hasta que alguien
-- del equipo lo aprueba (y entonces se crea el RentPayment) o lo rechaza con
-- un motivo. Solo agrega una tabla; no toca datos existentes.

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rentChargeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_paymentId_key" ON "PaymentProof"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentProof_organizationId_status_idx" ON "PaymentProof"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PaymentProof_rentChargeId_idx" ON "PaymentProof"("rentChargeId");

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_rentChargeId_fkey" FOREIGN KEY ("rentChargeId") REFERENCES "RentCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un monto declarado siempre es positivo.
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_amount_positive" CHECK ("amount" > 0);

-- Como máximo un comprobante por revisar a la vez por cargo, aunque lleguen
-- dos envíos simultáneos (la acción lo valida antes; esto es la red final).
CREATE UNIQUE INDEX "PaymentProof_one_submitted_per_charge" ON "PaymentProof"("rentChargeId") WHERE "status" = 'SUBMITTED';
