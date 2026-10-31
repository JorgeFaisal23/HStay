import { z } from "zod";

/**
 * Reglas para contraseñas que elige el usuario. Pocas y claras: largo mínimo
 * razonable y el límite de bcrypt (72 bytes; más allá se ignora en silencio).
 */
export const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Usa al menos ${PASSWORD_MIN} caracteres.`)
  .refine(
    (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
    "La contraseña es demasiado larga.",
  );

/** Nueva contraseña + confirmación, que deben coincidir. */
export const passwordPairSchema = z
  .object({
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm"],
  });
