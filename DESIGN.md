# DESIGN.md — Sistema visual del producto

Este documento es la **fuente de verdad del frontend**. Toda pantalla, componente
o ajuste visual se construye a partir de lo que dice aquí.

- Si una decisión no está en este documento, **primero se agrega aquí** y después se escribe el código.
- Si el código y este documento no coinciden, el error está en el código.
- Las reglas apuntan al archivo que las implementa. Para cambiar un valor se cambia ese archivo, no se agrega una excepción en la pantalla.

Al final hay una [lista de revisión](#15-lista-de-revisión) para PRs y agentes.

---

## 1. Principios

1. **Claridad antes que decoración.** Cada elemento visual responde a una pregunta del usuario: ¿cuánto me deben?, ¿qué vence?, ¿qué hago ahora? Lo que no responde nada se quita.
2. **Una acción sólida por pantalla.** Solo la acción principal usa el botón `default` (relleno de marca). El resto va en `outline`, `ghost` o `link`.
3. **El dinero es el contenido.** Los montos son el dato más importante de la aplicación y se ven como tal: cifras grandes, alineadas y fáciles de comparar.
4. **El estado no es la marca.** Verde, ámbar, rojo y azul significan lo mismo en toda la app y no dependen del color que elija el arrendador.
5. **Calma con pulso.** La base es neutra; encima van un acento de marca dosificado y movimiento breve. Es casi minimalista, pero no frío: la interfaz responde y tiene personalidad sin hacer ruido.

---

## 2. Dos identidades

| Identidad | Qué es | Dónde vive | Dónde aparece |
|---|---|---|---|
| **Marca del arrendador** | Nombre, logo, color, radio y tipografía de quien renta | Tabla `Organization` → [`src/lib/brand.ts`](src/lib/brand.ts) | Toda la interfaz: panel, portal y acceso |
| **Producto** (`APP.name`, configurable) | El software | [`src/lib/app.ts`](src/lib/app.ts) (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_COLOR`, por defecto `#12263F`) | Solo en los márgenes: pie del menú, pie del portal, acceso, planes, favicon y metadatos |

- La marca del arrendador llega como variables CSS inyectadas en el render de servidor (`brandStyleSheet()`). Por eso **ningún componente conoce el color de marca**: usa `primary`, `brand-soft` y `brand-strong`.
- El producto usa su propio color para que no cambie con cada cliente. Su distintivo es [`AppMark`](src/components/shared/app-mark.tsx) (la inicial de `APP.name`). El producto se llama **HStay** (valor por defecto de `APP.name`, configurable con `NEXT_PUBLIC_APP_NAME`); en el código siempre se usa `APP.name`, nunca el nombre escrito a mano. El logo y el color definitivos del producto están pendientes: mientras tanto se conservan la inicial y `#12263F`. CARCAR es un cliente (una arrendadora), no el producto.

---

## 3. Color

Todos los colores son tokens definidos en [`src/app/globals.css`](src/app/globals.css). **Fuera de ese archivo no se usa la paleta cruda de Tailwind** (`rose-500`, `emerald-50`, `sky-600`…) ni colores hex. La única excepción es la identidad del producto (`app.ts`, `app-mark.tsx`, `icon.tsx`, `manifest.ts`) y los preajustes de color de `brand.ts`.

### 3.1 Neutros (la base)

| Token | Uso |
|---|---|
| `background` | Fondo de página |
| `card` | Superficie de tarjeta, diálogo y popover |
| `muted` | Fondos secundarios: filas agrupadoras, iconos neutros, skeleton |
| `muted-foreground` | Texto secundario: descripciones, etiquetas, encabezados de tabla |
| `border` / `input` | Bordes de tarjetas internas, separadores y controles |
| `foreground` | Texto principal |

El 90 % de la interfaz se resuelve solo con neutros.

### 3.2 Marca (el acento)

Estos tokens los sobreescribe `brandStyleSheet()` con el color del arrendador, en claro y oscuro.

| Token | Uso |
|---|---|
| `primary` / `primary-foreground` | La acción principal, el foco (`ring`), enlaces y el ítem activo |
| `primary/10` | Fondo de chip o ítem activo de navegación (`bg-primary/10 text-primary`) |
| `brand-soft` | **Superficie con tinte de marca** (ver la regla abajo) |
| `brand-strong` | Texto o icono sobre `brand-soft` |
| `chart-1…5` | Series de gráficas, derivadas del color de marca |

**Regla del tinte: como máximo una superficie con `bg-brand-soft` por vista.** Es lo que le da calidez a una pantalla neutra, y usarla de más le quita el efecto.

- **Sí** va en:
  - el bloque clave de la pantalla (p. ej. "Tu renta mensual" en `/portal`)
  - la columna destacada de una comparación (plan Premium)
  - el icono de un `StatCard` en tono `brand`
- **No** va en:
  - fondos de página
  - tablas completas
  - varias tarjetas a la vez
  - avisos (para eso está `Callout`)

### 3.3 Estados (el semáforo)

Cada estado tiene cuatro tokens. Los valores están en `globals.css` (claro y oscuro) y el mapeo de estado de negocio a tono vive en [`src/lib/labels.ts`](src/lib/labels.ts).

| Tono | Significa | `base` | `-soft` | `-foreground` | `-border` |
|---|---|---|---|---|---|
| `success` | Pagado, ocupado, vigente | punto, icono, barra | fondo | texto sobre soft o en línea | contorno |
| `warning` | Pendiente, por vencer, corta estancia | | | | |
| `danger` | Vencido, cancelado, error | | | | |
| `info` | Parcial, disponible, nota informativa | | | | |
| `neutral` | Borrador, terminado, mantenimiento | `muted-foreground` | `muted` | `muted-foreground` | `border` |

- **Las clases ya armadas** están en `labels.ts`: `TONE_CLASSES` (chip), `TONE_DOT` (punto) y `TONE_TEXT` (texto en línea). Se usan esas en lugar de componer clases nuevas.
- **Un solo rojo:** `--destructive` apunta a `--danger`, así los errores de shadcn (`aria-invalid`, botón `destructive`) y el estado "Vencido" usan el mismo tono.
- **El estado nunca se comunica solo con color.** Siempre lleva texto: `StatusBadge` tiene punto + etiqueta, y `Callout` tiene icono + mensaje.

### 3.4 Calendario

Las barras del calendario usan tokens propios (`event-lease`, `event-direct`, `event-airbnb`, `event-manual`) con texto `event-foreground`, que es blanco. Las clases están en `LEASE_BAR_CLASS` y `BOOKING_SOURCE_CLASSES` de `labels.ts`. El origen de una reserva es información, por eso tampoco depende de la marca.

---

## 4. Tipografía

**Familia:** la fuente de la marca (`--font-sans`: Inter, Poppins o Source Sans 3, según la elija el arrendador) se usa para todo. `--font-mono` es la pila del sistema y solo se usa para referencias y códigos.

**Escala cerrada.** No se usan tamaños arbitrarios (`text-[10px]`, `text-[13px]`…).

| Rol | Clases | Ejemplo |
|---|---|---|
| Display | `text-3xl font-semibold tracking-tight` | KPI, monto principal, titular de acceso |
| Título de página (h1) | `text-2xl font-semibold tracking-tight text-balance` | [`PageHeader`](src/components/shared/page-header.tsx) |
| Sección (h2) | `text-lg font-semibold` | Bloques dentro de una página |
| Título de tarjeta | `text-base font-medium` | `CardTitle` |
| Cuerpo | `text-sm` | Casi todo el texto de la interfaz |
| Auxiliar | `text-xs text-muted-foreground` | Fechas secundarias, pistas de formulario |
| Micro | `text-2xs` (11 px) | Distintivo "Pro", días del calendario. Es el único tamaño por debajo de `xs` |

- **Pesos:** `font-normal`, `font-medium` (etiquetas, nombres) y `font-semibold` (títulos y montos). No se usa `font-bold`.
- **Párrafos y títulos:** `text-pretty` en párrafos, `text-balance` en títulos y `max-w-2xl` en descripciones largas.
- **Mayúsculas:** `uppercase tracking-wide` solo en etiquetas de grupo de `text-xs` o menos. Nunca en frases.

---

## 5. Números y dinero

En una plataforma de rentas el dinero es el dato que el usuario vino a ver, por eso tiene su propio tratamiento visual.

- **Todo monto** se pinta con [`<Amount>`](src/components/shared/amount.tsx):
  - cifras tabulares (`tabular-nums`) para que las columnas se alineen;
  - peso `semibold`;
  - símbolo de moneda atenuado (60 % de opacidad) y un paso más chico, para que la cifra sea la protagonista.
- **Tamaño:** `<Amount>` hereda el tamaño de su contenedor. En tablas va a `text-sm`; en un bloque clave, a `text-2xl` o `text-3xl tracking-tight`.
- **KPIs:** `<StatCard value={<Amount value={x} compact />} />`. `compact` quita los centavos, que en un indicador son ruido.
- **Columnas de montos** en tablas: alineadas a la derecha (`text-right`).
- **Otros números** (días, porcentajes, conteos) también llevan `tabular-nums`.
- **Fuera de JSX** (atributos `title`, toasts, descripciones en texto plano) se usan `money()` y `moneyCompact()` de [`src/lib/format.ts`](src/lib/format.ts). Nunca se formatea dinero a mano.
- **Montos en riesgo:** `tone="danger"` solo junto a un texto que explique el estado ("vencido", "por recuperar").

---

## 6. Espacio y layout

Escala base de 4 px (la de Tailwind). Los espaciados son fijos por contexto:

| Contexto | Valor |
|---|---|
| Entre bloques de una página | `space-y-6` (lo pone el `<main>` del layout) |
| Rejillas de tarjetas / KPIs | `gap-4`, `sm:grid-cols-2`, `xl:grid-cols-4` |
| Interior de tarjeta | `Card` usa 16 px; `StatCard` usa 20 px (`p-5`) |
| Campos de formulario | `space-y-4` entre campos, `space-y-2` etiqueta → control |
| Caja interna con borde | `rounded-lg border p-3` o `p-4` |
| Margen de página | `p-4 sm:p-6` |

**Estructuras:**

- **Panel:** menú lateral colapsable + encabezado fijo de 56 px (`h-14`) + contenido a todo el ancho. Ver [`(dashboard)/layout.tsx`](src/app/(dashboard)/layout.tsx).
- **Portal:** sin menú lateral. Contenido centrado en `max-w-4xl` sobre `bg-muted/30`, y navegación en píldoras. Ver [`(portal)/portal/layout.tsx`](src/app/(portal)/portal/layout.tsx).
- **Formularios:** `max-w-2xl`, una columna en móvil y como máximo dos en escritorio.
- **Acceso:** dos columnas en `lg`. A la izquierda el panel de marca (`bg-primary`); a la derecha el formulario en `max-w-sm`.

---

## 7. Forma y elevación

**El radio sale de la marca** (`--radius`: Recto 0.25 rem, Suave 0.625 rem, Redondo 1 rem). Los componentes nunca fijan píxeles; eligen un escalón de la escala:

| Escalón | Para |
|---|---|
| `rounded-xl` | Tarjetas, diálogos, skeleton de tarjeta |
| `rounded-lg` | Controles (botón, input, select), `Callout`, cajas internas con borde, filas clicables, estado vacío |
| `rounded-md` | Elementos chicos de hasta 40 px: chip de icono, avatar, logo, ítem de navegación |
| `rounded-sm` | Micro: distintivo "Pro", barras y chips del calendario |
| `rounded-full` | `StatusBadge`, puntos de estado, icono del estado vacío |

No se usa `rounded` sin sufijo ni radios arbitrarios fuera de `src/components/ui/`.

**Elevación:**

- **Tarjetas:** se separan con `ring-1 ring-foreground/10` y **sin sombra**.
- **Capas flotantes:** solo popover, menú, diálogo, sheet, toast y el aviso de `PremiumGate` llevan sombra.
- **Profundidad dentro de una tarjeta:** se marca con `border` o `bg-muted/50`, nunca con sombra.

---

## 8. Densidad

Densidad **cómoda** de 36 px, pensada para el uso en teléfono.

| Control | Altura |
|---|---|
| `Button` default, `Input`, `NativeSelect`, `Select`, `TabsList` | 36 px (`h-9`) |
| `Button size="sm"`, edición en línea de tablas | 32 px (`h-8`) |
| `Button size="lg"` | 40 px (`h-10`) |
| `Button size="icon"` | 36 px (`size-9`) |
| Ítems del menú lateral | 32 px (propio de shadcn sidebar) |

- **Área táctil mínima:** 36 px. Si un icono suelto es clicable, va dentro de un `Button size="icon"`, nunca solo.
- **Selects:** en formularios se usa `NativeSelect` ([`form-field.tsx`](src/components/shared/form-field.tsx)), porque en celular abre el selector del sistema.

---

## 9. Movimiento

El movimiento confirma que la interfaz respondió; nunca adorna.

| Qué | Cómo |
|---|---|
| Hover y foco (fondo, borde, color) | `transition-colors` (150 ms, la duración por defecto) |
| Entrada y salida de diálogo, sheet, popover y menú | Animaciones de `tw-animate-css` ya incluidas en `src/components/ui/` |
| Botón al presionarlo | `active:translate-y-px` (ya en `Button`) |
| Carga de una ruta | `loading.tsx` con [`PageSkeleton`](src/components/shared/page-skeleton.tsx) (`animate-pulse`) |
| Transiciones más largas | Como máximo `duration-200` |

- **Duraciones:** de 150 a 200 ms, con salida suave (ease-out).
- **Qué no se anima:** cambios de layout, montos o contadores, tablas completas. Tampoco se usan rebotes, parallax ni animaciones en bucle (salvo el skeleton).
- **Movimiento reducido:** `globals.css` lo respeta con una guarda global (`prefers-reduced-motion`). No hace falta agregar `motion-reduce:` en cada componente.
- **Prefiere `transition-colors` a `transition`** (que anima todas las propiedades).

---

## 10. Iconos

- **Librería:** [Lucide](https://lucide.dev) únicamente.
- **Tamaños:** `size-4` en línea y en botones; `size-5` en estados vacíos y avisos destacados; `size-3`/`size-3.5` dentro de chips.
- **Accesibilidad:** el icono siempre acompaña a un texto. Si es decorativo lleva `aria-hidden`; si va solo (botón de icono) lleva `aria-label` o texto `sr-only`.
- **Chip de icono:** `rounded-md p-1.5`, con fondo `bg-muted text-muted-foreground` (neutro), `bg-primary/10 text-primary` (marca) o el `-soft` de un estado.

---

## 11. Componentes

Antes de crear algo, revisa esta tabla. Los primitivos de `src/components/ui/` son de shadcn (estilo *base-nova* sobre Base UI: la composición usa `render={...}`, no `asChild`).

| Necesito… | Uso | No uso |
|---|---|---|
| Encabezar una pantalla | [`PageHeader`](src/components/shared/page-header.tsx) (título, una línea de propósito, una acción) | `<h1>` suelto |
| Agrupar contenido | `Card` + `CardHeader/Title/Description/Content` | `div` con borde y sombra |
| Mostrar un indicador | [`StatCard`](src/components/shared/stat-card.tsx), con tono `default`, `brand` o `danger` | Tarjetas KPI hechas a mano |
| Mostrar dinero | [`Amount`](src/components/shared/amount.tsx) | `{money(x)}` en JSX |
| Mostrar un estado | [`StatusBadge`](src/components/shared/status-badge.tsx) + el tono de `labels.ts` | `Badge` de shadcn o colores sueltos |
| Avisar, advertir o mostrar un error | [`Callout`](src/components/shared/callout.tsx) (`info`, `warning`, `danger`, `success`; `variant="banner"` para todo el ancho) | Cajas con `bg-*-50` |
| Mostrar un error de servidor en un formulario | `FormError` (usa `Callout`) | Texto rojo suelto |
| Listar datos tabulares | `Table` de [`ui/table.tsx`](src/components/ui/table.tsx), con `min-w-*` para el scroll horizontal | `<table>` a mano |
| Listar elementos navegables | `ul.divide-y` con filas `rounded-lg hover:bg-accent/60 transition-colors` | Tablas para listas de tarjetas |
| Mostrar un pendiente que se resuelve ahí mismo | Fila de `ul.divide-y` como en [`/hoy`](src/app/(dashboard)/hoy/page.tsx): `StatusBadge` + título; propiedad · persona en `text-xs text-muted-foreground`; fecha relativa (`deadlineLabel` o `relativeDay`); botón `outline` de 36 px con su texto visible | Avisos sin acción o botones que solo muestran el icono en celular |
| Capturar la foto de un comprobante | [`ReceiptPicker`](src/components/payments/receipt-picker.tsx) (cámara o archivo, comprime en el navegador, vista previa) | `<input type="file">` suelto |
| Revisar un comprobante del inquilino | [`ReviewProofDialog`](src/components/payments/review-proof-dialog.tsx): foto, datos declarados, monto editable con aviso si cambia; "Aprobar y registrar pago" es la acción `default`; rechazar pide motivo y usa `destructive` | Aprobar sin ver la foto o rechazar sin explicar |
| Mostrar cuánto del plan se usa | [`PlanUsage`](src/components/shared/plan-usage.tsx) (lee `PLAN_LIMITS`) | Límites escritos a mano en la pantalla |
| Explicar una lista vacía | [`EmptyState`](src/components/shared/empty-state.tsx): por qué está vacía y qué hacer | Tabla en blanco o "Sin datos" |
| Capturar un dato | `Field` + `Input` / `NativeSelect` / `Textarea` | Etiquetas sin `htmlFor` |
| Confirmar algo que no se deshace | `AlertDialog` | `confirm()` |
| Confirmar que algo se guardó | `toast.success("…")` corto; `toast.error` con la causa | Avisos persistentes para éxitos |
| Navegar con aspecto de botón | [`ButtonLink`](src/components/shared/button-link.tsx) | `<Link>` con clases de botón copiadas |
| Mostrar una función Premium | `PremiumGate` / `PremiumBadge` | Botones deshabilitados sin explicación |
| Anunciar una función que aún no existe | [`ComingSoonBadge`](src/components/premium/coming-soon-badge.tsx) junto al nombre o dentro del botón deshabilitado; [`ComingSoon`](src/components/premium/coming-soon-badge.tsx) para una sección completa | Pantallas con datos inventados o estados simulados |
| Mostrar carga | `loading.tsx` con `PageSkeleton` o `Skeleton` con la forma del contenido | Spinners de pantalla completa |

**Botones, en orden de jerarquía:**

1. `default`: la acción principal, **una por pantalla**.
2. `outline`: secundarias.
3. `ghost`: acciones de fila y de barra.
4. `link`: navegación en texto.
5. `destructive`: eliminar o cancelar, siempre detrás de un `AlertDialog`.

---

## 12. Voz y contenido

- **Idioma:** español de México, tuteando ("Elige un perfil", "Tu sesión se cerró").
- **Mayúsculas:** solo al inicio de títulos y botones ("Registrar pago", no "Registrar Pago").
- **Botones:** verbo + objeto ("Generar cargos", "Agregar unidad"). No se usan "Aceptar" ni "OK" sueltos.
- **Descripciones:** cada pantalla dice para qué sirve en una línea (`PageHeader.description`).
- **Estados vacíos:** explican el porqué y ofrecen la acción que lo resuelve.
- **Errores:** dicen qué pasó y qué hacer. No se culpa al usuario ni se muestran códigos técnicos.
- **Fechas, plazos y moneda:** siempre se escriben con las funciones de [`src/lib/format.ts`](src/lib/format.ts) (`shortDate`, `longDate`, `deadlineLabel`, `money`), que ya evitan frases como "vence en 0 días" o "1 días".
- **Etiquetas de estados y roles:** viven en `labels.ts`; no se escriben en la pantalla.

---

## 13. Modo oscuro

- **Cómo se activa:** con la clase `.dark` (`next-themes`); el usuario lo cambia en su menú.
- **Tokens:** todos tienen su par oscuro en `globals.css`. Los de marca los calcula `brandStyleSheet()`, que aclara el primario un 18 %.
- **Lo que no se hace:** no se escriben variantes `dark:` en las pantallas. Si un token no se ve bien en oscuro, se corrige el token.

---

## 14. Accesibilidad

- **Contraste:** AA (4.5:1 en texto). `brand.ts` elige automáticamente blanco o casi negro como `primary-foreground` para cualquier color de marca.
- **Foco:** siempre visible (`focus-visible:ring-3 ring-ring/50`). No se quita el `outline` sin dar una alternativa.
- **Estado:** nunca solo con color (ver §3.3).
- **Formularios:** cada control tiene su `Label`; los errores van en un `Callout` con `role="alert"`.
- **Imágenes e iconos:** `alt` o `aria-label` en los que informan; `aria-hidden` en los decorativos.
- **Movimiento:** se respeta `prefers-reduced-motion` (§9).

---

## 15. Lista de revisión

Antes de dar por terminado un cambio de interfaz, revisa:

- [ ] No hay colores de la paleta cruda (`emerald-`, `rose-`, `sky-`, `amber-`…) ni hex fuera de `globals.css` (salvo la identidad del producto, §3).
- [ ] No hay variantes `dark:` en las pantallas.
- [ ] No hay tamaños de texto arbitrarios (`text-[..px]`) ni `rounded` sin sufijo.
- [ ] Todo monto en JSX usa `<Amount>`, y las columnas de números van a la derecha con `tabular-nums`.
- [ ] Hay como máximo una acción `default` y una superficie `bg-brand-soft` por vista.
- [ ] Los estados usan `StatusBadge` o `Callout` y los tonos de `labels.ts`.
- [ ] Las tablas usan `ui/table.tsx`; las listas vacías usan `EmptyState`.
- [ ] Los controles miden 36 px (`h-9`) y los iconos clicables van dentro de un `Button`.
- [ ] Las transiciones usan `transition-colors` y duran como máximo 200 ms.
- [ ] Se probó en claro y oscuro, a 375 px de ancho y con al menos dos colores de marca (uno rojo, para confirmar que no se confunde con "Vencido").

```sh
# Comprobaciones rápidas (no deberían devolver nada)
rg "(emerald|amber|rose|sky|slate|red|green|blue|orange|yellow)-\d{2,3}" src
rg "text-\[\d+px\]" src
rg "\brounded\b[^-]" src --glob '!src/components/ui/**'
rg "dark:" src/app
```
