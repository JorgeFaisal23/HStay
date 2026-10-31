-- Multi-arrendador.
--
-- Antes de esta migración había una sola organización y ninguna tabla sabía a
-- quién pertenecía. Aquí:
--   1. Se asegura que exista una organización si ya hay datos.
--   2. Cada organización recibe un `slug` (para /a/{slug}/login) derivado de su
--      nombre de marca; el superadministrador puede cambiarlo después.
--   3. Todas las filas existentes se asignan a la organización más antigua.
--   4. Las columnas se vuelven obligatorias y se agregan llaves e índices.
-- Editada a mano: `prisma migrate diff` no sabe rellenar datos.

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- Organización: columnas nuevas (slug nullable hasta rellenarlo)
ALTER TABLE "Organization"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastSweepAt" TIMESTAMP(3);

-- 1. Si hay datos pero ninguna organización (la app caía a una marca por
--    defecto sin fila), se crea una para no dejar datos huérfanos.
INSERT INTO "Organization" ("id", "slug", "name", "updatedAt")
SELECT 'org' || substr(md5(random()::text || clock_timestamp()::text), 1, 22),
       'principal',
       'Mi arrendadora',
       CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Organization")
  AND (EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Building"));

-- 2. Slug: minúsculas, letras y números separados por un guion, 3 a 40
--    caracteres. Los repetidos o inválidos reciben un sufijo derivado del id.
WITH base AS (
  SELECT "id",
         "createdAt",
         left(
           trim(both '-' from regexp_replace(
             lower(coalesce(nullif(trim("brandName"), ''), "name")),
             '[^a-z0-9]+', '-', 'g'
           )),
           40
         ) AS candidate
  FROM "Organization"
  WHERE "slug" IS NULL
),
ranked AS (
  SELECT "id",
         trim(both '-' from candidate) AS candidate,
         row_number() OVER (PARTITION BY candidate ORDER BY "createdAt", "id") AS rn
  FROM base
)
UPDATE "Organization" o
SET "slug" = CASE
  WHEN r.rn = 1 AND length(r.candidate) >= 3 THEN r.candidate
  WHEN length(r.candidate) >= 3 THEN left(r.candidate, 33) || '-' || substr(md5(o."id"), 1, 6)
  ELSE 'org-' || substr(md5(o."id"), 1, 8)
END
FROM ranked r
WHERE o."id" = r."id";

ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;

-- 3. organizationId en todas las tablas (nullable mientras se rellena)
ALTER TABLE "User"             ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Building"         ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Unit"             ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ServiceAccount"   ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ServiceCharge"    ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Lease"            ADD COLUMN "organizationId" TEXT;
ALTER TABLE "RentCharge"       ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Booking"          ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AirbnbConnection" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog"         ADD COLUMN "organizationId" TEXT;

-- Antes solo existía una organización: todo le pertenece a la más antigua.
WITH org AS (
  SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1
)
UPDATE "User" SET "organizationId" = (SELECT "id" FROM org) WHERE "role" <> 'SUPERADMIN';
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "Building" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "Unit" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "ServiceAccount" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "ServiceCharge" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "Lease" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "RentCharge" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "Booking" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "AirbnbConnection" SET "organizationId" = (SELECT "id" FROM org);
WITH org AS (SELECT "id" FROM "Organization" ORDER BY "createdAt", "id" LIMIT 1)
UPDATE "AuditLog" SET "organizationId" = (SELECT "id" FROM org);

-- 4. Obligatorias (User y AuditLog quedan opcionales a propósito)
ALTER TABLE "Building"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Unit"             ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ServiceAccount"   ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ServiceCharge"    ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Lease"            ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "RentCharge"       ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Booking"          ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AirbnbConnection" ALTER COLUMN "organizationId" SET NOT NULL;

-- Solo el superadministrador vive fuera de una organización. Prisma no modela
-- CHECK constraints, así que esta regla solo existe aquí.
ALTER TABLE "User" ADD CONSTRAINT "User_superadmin_has_no_org_check"
  CHECK (("role" = 'SUPERADMIN') = ("organizationId" IS NULL));

-- Índices: los anteriores por columna suelta se sustituyen por compuestos que
-- empiezan por organizationId.
DROP INDEX "Booking_checkIn_idx";
DROP INDEX "RentCharge_status_idx";
DROP INDEX "ServiceCharge_period_idx";
DROP INDEX "Unit_status_idx";
DROP INDEX "User_role_idx";

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");
CREATE INDEX "Building_organizationId_idx" ON "Building"("organizationId");
CREATE INDEX "Unit_organizationId_status_idx" ON "Unit"("organizationId", "status");
CREATE INDEX "ServiceAccount_organizationId_idx" ON "ServiceAccount"("organizationId");
CREATE INDEX "ServiceCharge_organizationId_period_idx" ON "ServiceCharge"("organizationId", "period");
CREATE INDEX "Lease_organizationId_status_idx" ON "Lease"("organizationId", "status");
CREATE INDEX "Lease_organizationId_endDate_idx" ON "Lease"("organizationId", "endDate");
CREATE INDEX "RentCharge_organizationId_period_idx" ON "RentCharge"("organizationId", "period");
CREATE INDEX "RentCharge_organizationId_status_dueDate_idx" ON "RentCharge"("organizationId", "status", "dueDate");
CREATE INDEX "Booking_organizationId_checkIn_idx" ON "Booking"("organizationId", "checkIn");
CREATE INDEX "AirbnbConnection_organizationId_idx" ON "AirbnbConnection"("organizationId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- Llaves foráneas: una organización con datos no se puede borrar (se suspende).
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Building" ADD CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceAccount" ADD CONSTRAINT "ServiceAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceCharge" ADD CONSTRAINT "ServiceCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentCharge" ADD CONSTRAINT "RentCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AirbnbConnection" ADD CONSTRAINT "AirbnbConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
