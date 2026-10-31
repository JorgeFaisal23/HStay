-- Usuarios contratados por arrendadora: el software se cobra por usuario.
-- Cuentan las cuentas activas (dueño, equipo e inquilinos).
ALTER TABLE "Organization" ADD COLUMN "maxUsers" INTEGER;

-- Cada arrendadora existente arranca con lo que ya tiene activo, así nadie
-- pierde acceso; la plataforma ajusta el número después.
UPDATE "Organization" o
SET "maxUsers" = GREATEST(
  1,
  (SELECT COUNT(*) FROM "User" u WHERE u."organizationId" = o."id" AND u."active")
);

ALTER TABLE "Organization" ALTER COLUMN "maxUsers" SET NOT NULL;

-- Prisma no modela CHECK constraints, así que esta regla solo existe aquí.
-- Al menos 1: el dueño ocupa un lugar.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_maxUsers_check"
  CHECK ("maxUsers" >= 1);
