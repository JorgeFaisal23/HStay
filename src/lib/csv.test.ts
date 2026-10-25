import { describe, expect, it } from "vitest";
import { csvAmount, toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("lleva BOM, CRLF y escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv(["Nombre", "Nota"], [["Peña, Ana", 'dijo "hola"\nadiós']]);
    expect(csv).toBe('\uFEFFNombre,Nota\r\n"Peña, Ana","dijo ""hola""\nadiós"\r\n');
  });

  it("neutraliza textos que Excel ejecutaría como fórmula", () => {
    const csv = toCsv(["A"], [["=HYPERLINK(\"x\")"], ["+1"], ["-2"], ["@SUM(A1)"]]);
    expect(csv.split("\r\n").slice(1, 5)).toEqual(['"\'=HYPERLINK(""x"")"', "'+1", "'-2", "'@SUM(A1)"]);
  });

  it("los números y las fechas no se alteran", () => {
    expect(toCsv(["Monto", "Fecha", "Vacío"], [[-150.5, new Date(2026, 9, 5, 12), null]])).toBe(
      "\uFEFFMonto,Fecha,Vacío\r\n-150.5,2026-10-05,\r\n",
    );
    expect(csvAmount(0.1 + 0.2)).toBe(0.3);
  });
});
