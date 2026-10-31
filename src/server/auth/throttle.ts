import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Límite de intentos contra fuerza bruta. Se cuentan los fallos por correo
 * (protege cada cuenta) y por IP (frena a quien prueba muchas cuentas).
 * Superado el límite dentro de la ventana, la clave queda bloqueada un rato.
 */

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

export const LIMITS = {
  email: 5,
  ip: 30,
  /** Solicitudes de "olvidé mi contraseña" por correo. */
  reset: 3,
} as const;

export type ThrottleKind = keyof typeof LIMITS;

export function throttleKey(kind: ThrottleKind, value: string) {
  return `${kind}:${value.trim().toLowerCase()}`;
}

/**
 * IP del cliente. Detrás del proxy inverso del VPS llega en X-Forwarded-For
 * (la primera es la del cliente). Sin proxy ese encabezado lo puede inventar
 * el cliente, por eso el límite por correo es el que de verdad protege cada
 * cuenta.
 */
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "desconocida";
}

/** Fecha hasta la que la clave está bloqueada, o null si puede intentar. */
export async function lockedUntil(keys: string[]): Promise<Date | null> {
  const rows = await prisma.loginThrottle.findMany({
    where: { key: { in: keys }, lockedUntil: { gt: new Date() } },
    select: { lockedUntil: true },
  });
  const dates = rows.map((row) => row.lockedUntil!.getTime());
  return dates.length ? new Date(Math.max(...dates)) : null;
}

export async function registerFailure(key: string, limit: number) {
  const now = new Date();
  const row = await prisma.loginThrottle.findUnique({ where: { key } });

  if (!row || row.windowStart.getTime() < now.getTime() - WINDOW_MS) {
    // Ventana nueva: el contador empieza otra vez.
    await prisma.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 1, windowStart: now },
      update: { failures: 1, windowStart: now, lockedUntil: null },
    });
    return;
  }

  const failures = row.failures + 1;
  await prisma.loginThrottle.update({
    where: { key },
    data: {
      failures,
      lockedUntil: failures >= limit ? new Date(now.getTime() + LOCK_MS) : row.lockedUntil,
    },
  });
}

export async function clearFailures(key: string) {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}

/** "en 12 minutos" para los mensajes de bloqueo. */
export function minutesUntil(date: Date) {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60_000));
}
