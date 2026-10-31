import { describe, expect, it } from "vitest";
import { isIsoDay, nightsBetween, staysOverlap } from "./booking-dates";

describe("nightsBetween", () => {
  it("cuenta las noches sin incluir el día de salida", () => {
    expect(nightsBetween("2027-02-01", "2027-02-04")).toBe(3);
  });

  it("cruza meses y años", () => {
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(nightsBetween("2027-02-01", "2027-03-31")).toBe(58);
  });

  it("es 0 o negativo cuando la salida no es posterior", () => {
    expect(nightsBetween("2027-02-01", "2027-02-01")).toBe(0);
    expect(nightsBetween("2027-02-05", "2027-02-01")).toBeLessThan(0);
  });
});

describe("staysOverlap", () => {
  const feb = { start: "2027-02-01", end: "2027-03-01" };

  it("detecta estancias que comparten noches", () => {
    expect(staysOverlap(feb, { start: "2027-02-20", end: "2027-03-10" })).toBe(true);
    expect(staysOverlap(feb, { start: "2027-01-20", end: "2027-02-02" })).toBe(true);
  });

  it("detecta una estancia contenida en otra", () => {
    expect(staysOverlap(feb, { start: "2027-02-10", end: "2027-02-12" })).toBe(true);
    expect(staysOverlap({ start: "2027-02-10", end: "2027-02-12" }, feb)).toBe(true);
  });

  it("permite llegar el mismo día que sale el huésped anterior", () => {
    expect(staysOverlap(feb, { start: "2027-03-01", end: "2027-03-05" })).toBe(false);
    expect(staysOverlap(feb, { start: "2027-01-25", end: "2027-02-01" })).toBe(false);
  });

  it("no choca con estancias separadas", () => {
    expect(staysOverlap(feb, { start: "2027-04-01", end: "2027-04-05" })).toBe(false);
  });
});

describe("isIsoDay", () => {
  it("acepta AAAA-MM-DD y rechaza lo demás", () => {
    expect(isIsoDay("2027-02-01")).toBe(true);
    expect(isIsoDay("01/02/2027")).toBe(false);
    expect(isIsoDay("")).toBe(false);
  });
});
