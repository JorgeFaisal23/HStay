-- Rol Captura: registra y corrige reservas solo de las propiedades que se le
-- asignan. BuildingAccess guarda esas propiedades por usuario.
--
-- Aditiva: agrega un valor al rol y una tabla nueva; no toca datos existentes.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CAPTURE';

-- CreateTable
CREATE TABLE "BuildingAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildingAccess_organizationId_idx" ON "BuildingAccess"("organizationId");

-- CreateIndex
CREATE INDEX "BuildingAccess_buildingId_idx" ON "BuildingAccess"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingAccess_userId_buildingId_key" ON "BuildingAccess"("userId", "buildingId");

-- AddForeignKey
ALTER TABLE "BuildingAccess" ADD CONSTRAINT "BuildingAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingAccess" ADD CONSTRAINT "BuildingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingAccess" ADD CONSTRAINT "BuildingAccess_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

