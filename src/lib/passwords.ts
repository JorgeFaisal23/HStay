import { randomInt } from "node:crypto";

/**
 * Contraseñas temporales para cuentas nuevas o restablecidas.
 *
 * Sin caracteres que se confundan al dictarlas o copiarlas a mano (0/O, 1/l/I),
 * en grupos de cuatro para leerlas en voz alta: "k7mP-2xQe-9wRt". Doce
 * caracteres de un alfabeto de 56 dan ~70 bits: de sobra para una contraseña
 * que se cambia al primer ingreso.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join("")).join("-");
}
