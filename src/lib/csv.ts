/**
 * CSV para descargar reportes. Lo abre Excel sin librerías extra:
 *
 * - UTF-8 con BOM, para que Excel lea bien acentos y la ñ.
 * - Separador coma y fin de línea CRLF.
 * - Los montos van como número con punto decimal y sin símbolo, para poder
 *   sumarlos en la hoja.
 * - Defensa contra inyección de fórmulas: un texto que empieza con = + - @ o
 *   un tabulador se antepone con un apóstrofo. Un nombre de inquilino como
 *   "=HYPERLINK(…)" no debe ejecutarse al abrir el archivo.
 */

export type CsvCell = string | number | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return isoDate(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** "2026-10-05" en la zona local: Excel lo reconoce como fecha. */
function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Monto en pesos con dos decimales, como número. */
export function csvAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function toCsv(headers: string[], rows: CsvCell[][]) {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
