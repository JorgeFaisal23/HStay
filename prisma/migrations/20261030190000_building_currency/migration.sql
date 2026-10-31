-- Moneda por propiedad (pesos o dólares). Cada monto se guarda y se muestra en
-- la moneda de su propiedad; no hay conversión.
--
-- Aditiva: las propiedades existentes quedan en pesos (MXN), que es como se
-- venían mostrando. Ninguna cifra cambia.
CREATE TYPE "Currency" AS ENUM ('MXN', 'USD');

ALTER TABLE "Building" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'MXN';
