import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { TokenPurpose } from "@/generated/prisma/enums";

/**
 * Enlaces de un solo uso. El token viaja en la URL; en la base solo queda su
 * SHA-256, así que un respaldo filtrado no sirve para entrar a nadie.
 */

const TTL_MS: Record<TokenPurpose, number> = {
  RESET: 60 * 60 * 1000, // 1 hora
  INVITE: 7 * 24 * 60 * 60 * 1000, // 7 días
};

export const TOKEN_TTL_LABEL: Record<TokenPurpose, string> = {
  RESET: "1 hora",
  INVITE: "7 días",
};

/** 32 bytes en base64url: 43 caracteres. Cualquier otra forma ni se consulta. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Crea un token nuevo e invalida los anteriores sin usar del mismo tipo. */
export async function createAuthToken(userId: string, purpose: TokenPurpose) {
  const raw = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      },
    }),
  ]);
  return raw;
}

/** Datos de un token vigente, sin gastarlo (para pintar la página del enlace). */
export async function peekAuthToken(raw: string, purpose: TokenPurpose) {
  if (!TOKEN_FORMAT.test(raw)) return null;
  const token = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: {
      purpose: true,
      usedAt: true,
      expiresAt: true,
      user: {
        select: {
          name: true,
          email: true,
          active: true,
          organization: {
            select: {
              slug: true,
              status: true,
              brandName: true,
              logoUrl: true,
              primaryColor: true,
              radius: true,
              fontFamily: true,
            },
          },
        },
      },
    },
  });
  if (
    !token ||
    token.purpose !== purpose ||
    token.usedAt ||
    token.expiresAt <= new Date() ||
    !token.user.active
  ) {
    return null;
  }
  return token.user;
}

/**
 * Gasta el token: devuelve el usuario si era válido y nadie lo usó antes. La
 * marca de uso se pone con una sola actualización condicionada, así dos
 * peticiones simultáneas con el mismo enlace no pueden ganar ambas.
 */
export async function consumeAuthToken(raw: string, purpose: TokenPurpose) {
  if (!TOKEN_FORMAT.test(raw)) return null;
  const tokenHash = hashToken(raw);
  const claimed = await prisma.authToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;
  const token = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  return token?.userId ?? null;
}
