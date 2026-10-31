-- Inquilinos sin correo: se registran pero no entran al portal.
-- El índice único "User_email_key" se conserva; PostgreSQL admite varios NULL.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
