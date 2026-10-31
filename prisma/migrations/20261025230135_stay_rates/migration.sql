-- Tarifas de estancia corta por unidad (noche, semana, mes) (B-04).
--
-- Hasta ahora `baseRent` era la renta mensual en unidades de arrendamiento y
-- la tarifa por noche en las de renta corta. Desde aquí `baseRent` es siempre
-- la renta mensual de contrato y las estancias tienen sus propias tarifas.
-- No se borra nada: en las unidades de renta corta se copia su renta actual
-- a la tarifa por noche, que es lo que significaba.

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "monthlyRate" DECIMAL(12,2),
ADD COLUMN     "nightlyRate" DECIMAL(12,2),
ADD COLUMN     "weeklyRate" DECIMAL(12,2);

-- La tarifa por noche de las unidades de renta corta era su renta base.
UPDATE "Unit" SET "nightlyRate" = "baseRent" WHERE "status" = 'SHORT_TERM';

-- Ninguna tarifa es negativa.
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_stay_rates_non_negative"
  CHECK (COALESCE("nightlyRate", 0) >= 0 AND COALESCE("weeklyRate", 0) >= 0 AND COALESCE("monthlyRate", 0) >= 0);
