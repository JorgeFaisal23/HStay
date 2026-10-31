-- La base de producción se creó con `prisma db push`, y la columna de sesión
-- única (currentSessionId) se agregó después. Si esa versión nunca se
-- desplegó, al marcar la base con el baseline (0_init, que ya la incluye) la
-- columna faltaría. Esto la crea solo si no existe; en las demás bases no hace
-- nada.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentSessionId" TEXT;
