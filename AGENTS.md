<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Diseño

Todo cambio de interfaz sigue [`DESIGN.md`](DESIGN.md): tokens, tipografía, dinero, componentes y la lista de revisión final. Si falta una regla, se agrega primero en `DESIGN.md` y después se escribe el código.

# Versionado y Registro de Cambios (Changelog)

El proyecto utiliza **Versionado Semántico 2.0.0** ([SemVer](https://semver.org/lang/es/)) y mantiene el historial en [`CHANGELOG.md`](CHANGELOG.md) siguiendo la convención de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## Nomenclatura de Versiones (`MAJOR.MINOR.PATCH`)

- **`MAJOR` (X.0.0)**: Cambios incompatibles (breaking changes).
  - Modificaciones estructurales o destructivas en la base de datos o arquitectura multi-inquilino que requieran migraciones manuales sin retrocompatibilidad.
  - Modificaciones en contratos de APIs públicas o cambios que rompan la compatibilidad hacia atrás en flujos centrales.
- **`MINOR` (0.X.0 o X.Y.0)**: Nuevas funcionalidades y capacidades completadas que son retrocompatibles.
  - Culminación de hitos o fases del producto (e.g. Módulo de Superadministrador, Gestión global de usuarios, Control de cuotas por arrendadora, etc.).
  - Adición de nuevos endpoints, server actions, tablas o modelos sin alterar los existentes.
  - Cada incremento MINOR debe reflejarse en `"version"` de `package.json` y `package-lock.json`.
- **`PATCH` (X.Y.Z)**: Correcciones de errores y mantenimiento retrocompatible.
  - Solución de bugs o fallas lógicas.
  - Parches y endurecimiento de seguridad.
  - Ajustes de UI/UX siguiendo [`DESIGN.md`](DESIGN.md) o mejoras internas de rendimiento/refactorización sin alterar el comportamiento funcional.

## Convención de Etiquetas Git (Tags)

- Toda versión liberada se etiqueta en Git con el prefijo `v`: `vMAJOR.MINOR.PATCH` (por ejemplo: `v0.7.0`, `v1.0.0`).

## Estructura de `CHANGELOG.md`

Todo cambio significativo debe documentarse en [`CHANGELOG.md`](CHANGELOG.md) bajo el encabezado de versión correspondiente:
- **Formato del encabezado de versión**: `## [X.Y.Z] - AAAA-MM-DD` (o `## [Sin publicar]` para cambios en desarrollo).
- **Subsecciones admitidas**:
  - `### Añadido`: Nuevas características o módulos implementados.
  - `### Cambiado`: Modificaciones en funcionalidades existentes.
  - `### Obsoleto`: Funcionalidades que dejarán de tener soporte próximamente.
  - `### Eliminado`: Características o código removido deliberadamente.
  - `### Corregido`: Corrección de errores y comportamiento inesperado.
  - `### Seguridad`: Vulnerabilidades resueltas o mejoras en autenticación/autorización.

## Flujo para Futuros Cambios

1. **Diseño**: Si se introducen cambios de interfaz, verificar primero [`DESIGN.md`](DESIGN.md).
2. **Actualización del Changelog**: Añadir la descripción de los cambios en [`CHANGELOG.md`](CHANGELOG.md) bajo la versión calculada (o `[Sin publicar]`).
3. **Sincronización de Versión**: Si corresponde nueva versión, ejecutar `npm version [major|minor|patch] --no-git-tag-version`.
4. **Verificación**: Asegurar que las pruebas pasen (`npm run test:all`) y el linter esté limpio (`npm run lint`).
5. **Commit y Etiquetado**: Realizar el commit con un mensaje descriptivo y crear el tag `git tag vX.Y.Z`.
