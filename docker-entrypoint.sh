#!/bin/sh
# Punto de entrada de la imagen. Comandos:
#
#   start               (por defecto) aplica las migraciones pendientes y
#                       arranca la app. RUN_MIGRATIONS=false salta el paso.
#   migrate             solo aplica las migraciones pendientes.
#   baseline            marca una base creada antes de existir las migraciones
#                       (con `prisma db push`) como al día con 0_init. Una sola
#                       vez, y solo en esa base.
#   create-superadmin   crea un superadministrador: correo "Nombre".
#   import-occupancy    importa inquilinos, contratos y luz de una arrendadora:
#                       archivo.json --org <slug> [--apply]. Sin --apply solo simula.
#
# Ejemplo: docker compose run --rm app create-superadmin yo@ejemplo.com "Mi Nombre"

set -e

prisma() {
  (cd /migrator && node node_modules/prisma/build/index.js "$@")
}

command="${1:-start}"
[ $# -gt 0 ] && shift

case "$command" in
  start)
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      echo "Aplicando migraciones pendientes…"
      prisma migrate deploy
    fi
    exec node /app/server.js
    ;;
  migrate)
    prisma migrate deploy
    ;;
  baseline)
    prisma migrate resolve --applied 0_init
    ;;
  create-superadmin)
    cd /migrator && exec node create-superadmin.mjs "$@"
    ;;
  import-occupancy)
    cd /migrator && exec node import-occupancy.mjs "$@"
    ;;
  *)
    exec "$command" "$@"
    ;;
esac
