-- Inquilinos sin correo: se registran (y ocupan un usuario contratado) pero no
-- tienen acceso al portal hasta que se les agrega un correo.
--
-- Aditiva: solo relaja NOT NULL. El índice único "User_email_key" se conserva;
-- PostgreSQL admite varios NULL. Ninguna fila existente cambia.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Solo un inquilino puede no tener correo: dueño, equipo, propietario y
-- superadministrador entran con él. Prisma no modela CHECK constraints, así
-- que esta regla solo existe aquí.
ALTER TABLE "User" ADD CONSTRAINT "User_email_required_unless_tenant"
  CHECK ("email" IS NOT NULL OR "role" = 'TENANT');
