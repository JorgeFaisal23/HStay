-- Modo soporte: acceso temporal del staff de HStay (SUPERADMIN) al panel de
-- una arrendadora, con motivo obligatorio y vencimiento.
--
-- Aditiva: un enum y una tabla nueva; no toca datos existentes.

-- CreateEnum
CREATE TYPE "SupportEndReason" AS ENUM ('MANUAL', 'EXPIRED', 'LOGOUT');

-- CreateTable
CREATE TABLE "SupportSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "superadminId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" "SupportEndReason",

    CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportSession_organizationId_startedAt_idx" ON "SupportSession"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "SupportSession_superadminId_endedAt_idx" ON "SupportSession"("superadminId", "endedAt");

-- AddForeignKey
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_superadminId_fkey" FOREIGN KEY ("superadminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
