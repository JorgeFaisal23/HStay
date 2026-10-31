# Imagen de producción.
#
#   docker build -t apprentas .
#   docker compose up -d            (ver docker-compose.yml)
#
# Tres etapas:
#   builder  instala dependencias y compila Next en modo standalone.
#   migrator herramientas mínimas para migrar y crear el superadministrador
#            (CLI de Prisma, pg, bcryptjs) en su propia carpeta, sin el resto
#            de node_modules.
#   runner   la imagen final: server.js de Next + /migrator. Al arrancar
#            aplica las migraciones pendientes (docker-entrypoint.sh).

ARG NODE_VERSION=24
ARG PRISMA_VERSION=7.10.0

# ------------------------------------------------------------------ builder
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

# openssl: lo pide Prisma al generar el cliente.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci

COPY . .

# Identidad del producto: las variables NEXT_PUBLIC_ se incrustan al compilar.
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_TAGLINE
ARG NEXT_PUBLIC_APP_COLOR
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_TAGLINE=$NEXT_PUBLIC_APP_TAGLINE \
    NEXT_PUBLIC_APP_COLOR=$NEXT_PUBLIC_APP_COLOR \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1

# El build no necesita base de datos (las páginas se renderizan por petición).
RUN npx prisma generate && npm run build

# ------------------------------------------------------------------ migrator
FROM node:${NODE_VERSION}-bookworm-slim AS migrator
ARG PRISMA_VERSION
WORKDIR /migrator
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund \
     prisma@${PRISMA_VERSION} dotenv@17 pg@8 bcryptjs@3
COPY prisma/schema.prisma prisma/env.ts ./prisma/
COPY prisma/migrations ./prisma/migrations
COPY prisma7.config.ts scripts/create-superadmin.mjs scripts/import-occupancy.mjs ./

# ------------------------------------------------------------------ runner
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=migrator --chown=node:node /migrator /migrator
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Por si el archivo llegó con fin de línea CRLF (checkout en Windows).
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
