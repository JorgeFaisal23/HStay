-- Propietarios (B-05): el dueño de un inmueble que administra la arrendadora,
-- su acceso de solo lectura y las entregas de dinero que se le hacen.
--
-- Aditiva: un valor nuevo en Role, dos columnas opcionales en Building y una
-- tabla nueva. No toca datos existentes. Una cuenta PROPERTY_OWNER ocupa un
-- usuario contratado como cualquier cuenta activa.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PROPERTY_OWNER';

-- AlterTable
ALTER TABLE "Building" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "ownerSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OwnerPayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerPayout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OwnerPayout_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "Building_ownerId_idx" ON "Building"("ownerId");

-- CreateIndex
CREATE INDEX "OwnerPayout_organizationId_paidOn_idx" ON "OwnerPayout"("organizationId", "paidOn");

-- CreateIndex
CREATE INDEX "OwnerPayout_buildingId_idx" ON "OwnerPayout"("buildingId");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
