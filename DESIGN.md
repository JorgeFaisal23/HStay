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
5. **Vidrio sobre aurora.** La personalidad la pone el ambiente: un fondo de aurora en olas, en los colores del logo de HStay, que se mueve despacio. El contenido vive encima, en superficies de vidrio legibles y tranquilas. El único movimiento continuo es el fondo; lo demás solo se mueve para responder al usuario.

---

## 2. Dos identidades

| Identidad | Qué es | Dónde vive | Dónde aparece |
|---|---|---|---|
| **Marca del arrendador** | Nombre, logo, color, radio y tipografía de quien renta | Tabla `Organization` → [`src/lib/brand.ts`](src/lib/brand.ts) | Toda la interfaz: panel, portal y acceso |
| **Producto** (`APP.name`, configurable) | El software | [`src/lib/app.ts`](src/lib/app.ts) (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_COLOR`, por defecto `#6D28D9`) | En los márgenes (pie del menú, pie del portal, acceso, planes, favicon y metadatos) **y en el ambiente**: la aurora del fondo |

- La marca del arrendador llega como variables CSS inyectadas en el render de servidor (`brandStyleSheet()`). Por eso **ningún componente conoce el color de marca**: usa `primary`, `brand-soft` y `brand-strong`.
- El producto usa su propio color para que no cambie con cada cliente. Su distintivo es [`AppMark`](src/components/shared/app-mark.tsx): la "H" del logo (dos píldoras verticales, violeta→azul y cian→azul, unidas por una cinta magenta→durazno). Los colores del logo viven en `APP_LOGO` de `app.ts`; `APP.color` es el violeta del logo y es el primario en las pantallas sin arrendadora (acceso genérico, superadmin). El producto se llama **HStay** (valor por defecto de `APP.name`, configurable con `NEXT_PUBLIC_APP_NAME`); en el código siempre se usa `APP.name`, nunca el nombre escrito a mano. El archivo original del logo es `LOGO HStay.jpeg`, en la raíz. CARCAR es un cliente (una arrendadora), no el producto.
- **La aurora es del producto, las acciones son del arrendador.** El fondo siempre usa la paleta del logo de HStay; botones, enlaces, foco, ítem activo y gráficas siguen usando el color de la arrendadora. Así la app se reconoce como HStay en cualquier cliente sin quitarle a la arrendadora su color.

---

## 3. Color

Todos los colores son tokens definidos en [`src/app/globals.css`](src/app/globals.css). **Fuera de ese archivo no se usa la paleta cruda de Tailwind** (`rose-500`, `emerald-50`, `sky-600`…) ni colores hex. La única excepción es la identidad del producto (`app.ts`, `app-mark.tsx`, `icon.tsx`, `manifest.ts`) y los preajustes de color de `brand.ts`.

### 3.0 Aurora y vidrio (el ambiente)

| Token | Uso |
|---|---|
| `--aurora-base` | Color de fondo detrás de la aurora (azul noche en oscuro, lavanda en claro). `--background` apunta a él |
| `--aurora-1` … `--aurora-5` | Colores del logo: violeta, azul eléctrico, cian, magenta y durazno. En oscuro van con menos saturación y brillo que el logo, para que domine lo oscuro y la aurora se sienta como luz de fondo |
| `--aurora-opacity` | Intensidad general de las olas (más baja en claro) |
| `--aurora-veil` | Velo que cubre la aurora para contener el brillo detrás del contenido |
| `--glass` | Superficie de vidrio de nivel 1: tarjetas, encabezados y menú lateral. `--card` y `--sidebar` apuntan a él |
| `--glass-strong` | Vidrio de nivel 2, más opaco: diálogos, popovers, menús, selects, sheets y toasts. `--popover` apunta a él |
| `--glass-border` | Borde claro del vidrio |
| `--glass-highlight` | Brillo de 1 px en el borde superior |
| `--glass-shadow` / `--glass-shadow-strong` | Sombra suave de nivel 1 y de nivel 2 |
| `--glass-blur` | Desenfoque del vidrio |

- **Los `--aurora-*` solo se usan en [`AuroraBackground`](src/components/shared/aurora-background.tsx)** (y sus equivalentes en hex, en la identidad del producto). Nunca en texto, botones, gráficas ni estados.
- **El vidrio se aplica con las utilidades `glass` y `glass-strong`** de `globals.css`, que ya traen fondo, desenfoque, borde, brillo y sombra. No se arma vidrio con `backdrop-blur` y `bg-white/…` sueltos.

### 3.1 Neutros (la base)

| Token | Uso |
|---|---|
| `background` | Color base de la página (solo lo pinta el `body`; encima va la aurora) |
| `card` | Superficie de tarjeta (vidrio de nivel 1) |
| `popover` | Superficie flotante (vidrio de nivel 2). También es el fondo casi opaco de columnas fijas que se desplazan sobre otro contenido |
| `muted` | Fondos secundarios translúcidos: filas agrupadoras, iconos neutros, skeleton |
| `muted-foreground` | Texto secundario: descripciones, etiquetas, encabezados de tabla |
| `border` / `input` | Bordes de tarjetas internas, separadores y controles (translúcidos) |
| `foreground` | Texto principal |

El 90 % de la interfaz se resuelve solo con neutros. `muted`, `accent`, `border` e `input` son translúcidos para que se lean igual sobre cualquier vidrio.

### 3.2 Marca (el acento)

Estos tokens los sobreescribe `brandStyleSheet()` con el color del arrendador, en claro y oscuro.

| Token | Uso |
|---|---|
| `primary` / `primary-foreground` | La acción principal, el foco (`ring`), enlaces y el ítem activo |
| `primary/10` | Fondo de chip o ítem activo de navegación (`bg-primary/10 text-primary`) |
| `brand-soft` | **Superficie con tinte de marca**: el color del arrendador al 12–18 % de opacidad, para que el vidrio se siga viendo (ver la regla abajo) |
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
- **Moneda:** cada propiedad cobra en una moneda (`Building.currency`: `MXN` o `USD`) y todo monto de esa propiedad, de sus unidades, contratos, reservas, cargos y gastos se pinta en ella: `<Amount value={x} currency={c} />`, `money(x, c)`. Los pesos se ven `$12,345.50` y los dólares `USD 12,345.50` (formato de `es-MX`), así nunca se confunden.
- **Totales con varias monedas:** nunca se suman pesos con dólares ni se convierten. Un total que junta propiedades se lleva por moneda (`MoneyByCurrency` de [`src/lib/currency.ts`](src/lib/currency.ts)) y se pinta con [`<Amounts>`](src/components/shared/amount.tsx): una cifra por moneda, pesos primero. Si solo hay una moneda se ve igual que un `<Amount>`.

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

- **Fondo:** ningún layout ni pantalla pinta fondo de página (`bg-background`, `bg-muted/30`…). El fondo es la aurora, que se monta una sola vez en el [layout raíz](src/app/layout.tsx). Los encabezados fijos y el menú lateral son vidrio (`glass`).
- **Panel:** menú lateral colapsable + encabezado fijo de 56 px (`h-14`) + contenido a todo el ancho. Ver [`(dashboard)/layout.tsx`](src/app/(dashboard)/layout.tsx).
- **Portal:** sin menú lateral. Contenido centrado en `max-w-4xl` y navegación en píldoras. Ver [`(portal)/portal/layout.tsx`](src/app/(portal)/portal/layout.tsx).
- **Operación:** como el portal, pero en `max-w-2xl` y con tarjetas de una tarea cada una (unidad, dirección, para cuándo y "Marcar como hecha"). Usa la misma [`PortalNav`](src/components/layout/portal-nav.tsx) con sus propios enlaces. Ver [`(operacion)/operacion/layout.tsx`](src/app/(operacion)/operacion/layout.tsx).
- **Propietario:** como el portal (`max-w-4xl`, sin menú lateral, [`PortalNav`](src/components/layout/portal-nav.tsx)) y de solo lectura: una [`OwnerStatementCard`](src/components/owners/owner-statement-card.tsx) por propiedad. Nunca muestra nombres de inquilinos ni huéspedes, solo unidades y montos. Ver [`(propietario)/propietario/layout.tsx`](src/app/(propietario)/propietario/layout.tsx).
- **Formularios:** `max-w-2xl`, una columna en móvil y como máximo dos en escritorio.
- **Acceso:** dos columnas en `lg`. A la izquierda el panel de marca, un panel de vidrio (`glass`) sobre la aurora; a la derecha el formulario en `max-w-sm`, dentro de una tarjeta.

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

**Elevación: capas de vidrio.**

| Nivel | Qué | Cómo |
|---|---|---|
| 0 | Aurora | [`AuroraBackground`](src/components/shared/aurora-background.tsx), una sola, en el layout raíz |
| 1 | Tarjetas, encabezados fijos, menú lateral, panel de marca del acceso | Utilidad `glass`: vidrio translúcido, borde claro, brillo superior y sombra suave |
| 2 | Diálogo, alert dialog, popover, menú, select, sheet, toast, tooltip de gráfica | Utilidad `glass-strong`: más opaco y con sombra más marcada |

- Los primitivos de `src/components/ui/` ya traen su nivel. Las pantallas no agregan `glass` a mano salvo para un panel que no sea `Card` (p. ej. el de acceso).
- **No se anida vidrio en vidrio.** Un desenfoque dentro de otro se ve sucio y cuesta rendimiento. Dentro de una tarjeta, la profundidad se marca con `border` o `bg-muted/50`, nunca con otra capa de vidrio ni con sombra.
- **No se agregan sombras sueltas** (`shadow-*`) en las pantallas: la sombra la pone el nivel.

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
- **Qué no se anima:** cambios de layout, montos o contadores, tablas completas. Tampoco se usan rebotes ni parallax.
- **Animaciones en bucle:** solo dos, la aurora del fondo (§16) y el skeleton. Ninguna pantalla agrega otra.
- **Movimiento reducido:** `globals.css` lo respeta con una guarda global (`prefers-reduced-motion`), que además deja la aurora quieta. No hace falta agregar `motion-reduce:` en cada componente.
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
| Mostrar dinero | [`Amount`](src/components/shared/amount.tsx) con la `currency` de la propiedad | `{money(x)}` en JSX; montos sin moneda |
| Mostrar un total de varias propiedades | [`Amounts`](src/components/shared/amount.tsx) con un `MoneyByCurrency` | Sumar pesos con dólares |
| Mostrar un estado | [`StatusBadge`](src/components/shared/status-badge.tsx) + el tono de `labels.ts` | `Badge` de shadcn o colores sueltos |
| Avisar, advertir o mostrar un error | [`Callout`](src/components/shared/callout.tsx) (`info`, `warning`, `danger`, `success`; `variant="banner"` para todo el ancho) | Cajas con `bg-*-50` |
| Mostrar un error de servidor en un formulario | `FormError` (usa `Callout`) | Texto rojo suelto |
| Listar datos tabulares | `Table` de [`ui/table.tsx`](src/components/ui/table.tsx), con `min-w-*` para el scroll horizontal | `<table>` a mano |
| Listar elementos navegables | `ul.divide-y` con filas `rounded-lg hover:bg-accent/60 transition-colors` | Tablas para listas de tarjetas |
| Mostrar un pendiente que se resuelve ahí mismo | Fila de `ul.divide-y` como en [`/hoy`](src/app/(dashboard)/hoy/page.tsx): `StatusBadge` + título; propiedad · persona en `text-xs text-muted-foreground`; fecha relativa (`deadlineLabel` o `relativeDay`); botón `outline` de 36 px con su texto visible | Avisos sin acción o botones que solo muestran el icono en celular |
| Capturar la foto de un comprobante | [`ReceiptPicker`](src/components/payments/receipt-picker.tsx) (cámara o archivo, comprime en el navegador, vista previa) | `<input type="file">` suelto |
| Revisar un comprobante del inquilino | [`ReviewProofDialog`](src/components/payments/review-proof-dialog.tsx): foto, datos declarados, monto editable con aviso si cambia; "Aprobar y registrar pago" es la acción `default`; rechazar pide motivo y usa `destructive` | Aprobar sin ver la foto o rechazar sin explicar |
| Asignar quién hace una tarea | [`AssignTaskDialog`](src/components/tasks/assign-task-dialog.tsx) (Operación primero en la lista) | Escribir el nombre a mano |
| Cerrar una tarea | [`CompleteTaskDialog`](src/components/tasks/complete-task-dialog.tsx): limpieza con foto opcional; reparación con foto, costo y, si costó, comprobante | Marcar hecha sin evidencia |
| Aprobar un gasto de reparación | [`ReviewExpenseDialog`](src/components/tasks/review-expense-dialog.tsx), con el mismo patrón que `ReviewProofDialog` | Sumar gastos sin revisión |
| Mostrar el estado de cuenta de un propietario | [`OwnerStatementCard`](src/components/owners/owner-statement-card.tsx): "Pendiente de entregar" como cifra clave (`text-3xl`, `tone="danger"` solo si es negativo y con texto que lo explique); tabla por mes (cobrado, gastos, entregado) con montos a la derecha; entregas en `ul.divide-y`. La misma tarjeta sirve al equipo (con acciones) y al propietario (sin acciones) | Calcular el pendiente en la pantalla |
| Registrar una entrega al propietario | [`RecordPayoutDialog`](src/components/owners/record-payout-dialog.tsx): monto (propone lo pendiente), fecha, forma de pago, referencia, nota y comprobante opcional con `ReceiptPicker` | Restar a mano del pendiente |
| Asignar el propietario de una propiedad | [`AssignOwnerDialog`](src/components/owners/assign-owner-dialog.tsx): propietario (`NativeSelect`, con "Sin propietario") y mes de inicio de cuentas | Escribir el nombre a mano |
| Decir para cuándo es una tarea | `dueLabel` de `format.ts` ("para hoy", "en 3 días") | "Para en 3 días" |
| Mostrar cuánto del plan se usa | [`PlanUsage`](src/components/shared/plan-usage.tsx) (lee `PLAN_LIMITS`) | Límites escritos a mano en la pantalla |
| Explicar una lista vacía | [`EmptyState`](src/components/shared/empty-state.tsx): por qué está vacía y qué hacer | Tabla en blanco o "Sin datos" |
| Capturar un dato | `Field` + `Input` / `NativeSelect` / `Textarea` | Etiquetas sin `htmlFor` |
| Confirmar algo que no se deshace | `AlertDialog` | `confirm()` |
| Confirmar que algo se guardó | `toast.success("…")` corto; `toast.error` con la causa | Avisos persistentes para éxitos |
| Navegar con aspecto de botón | [`ButtonLink`](src/components/shared/button-link.tsx) | `<Link>` con clases de botón copiadas |
| Mostrar una función Premium | `PremiumGate` / `PremiumBadge` | Botones deshabilitados sin explicación |
| Anunciar una función que aún no existe | [`ComingSoonBadge`](src/components/premium/coming-soon-badge.tsx) junto al nombre o dentro del botón deshabilitado; [`ComingSoon`](src/components/premium/coming-soon-badge.tsx) para una sección completa | Pantallas con datos inventados o estados simulados |
| Mostrar carga | `loading.tsx` con `PageSkeleton` o `Skeleton` con la forma del contenido | Spinners de pantalla completa |
| Mostrar una hora ("14:15", "31 oct, 14:15") | [`LocalTime`](src/components/shared/local-time.tsx): se pinta en la zona del navegador | Formatear horas en el servidor (corre en UTC) |
| Avisar que el staff de la plataforma está o estuvo dentro | [`SupportBanner`](src/components/layout/support-banner.tsx) (`warning`, con "Terminar soporte") mientras dura; [`SupportNotice`](src/components/layout/support-notice.tsx) (`info`) para la arrendadora. Ambos son `Callout` `banner` bajo el encabezado | Avisos a mano o esconder que alguien de la plataforma entró |

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

- **Oscuro es el tema predeterminado** ([`theme-provider.tsx`](src/components/theme-provider.tsx)): es donde la aurora y el vidrio lucen más. El claro sigue disponible: aurora pastel sobre lavanda y vidrio blanco.
- **Cómo se activa:** con la clase `.dark` (`next-themes`); el usuario lo cambia en su menú.
- **Tokens:** todos tienen su par oscuro en `globals.css`. Los de marca los calcula `brandStyleSheet()`, que aclara el primario un 18 %.
- **Lo que no se hace:** no se escriben variantes `dark:` en las pantallas. Si un token no se ve bien en oscuro, se corrige el token.

---

## 14. Accesibilidad

- **Contraste:** AA (4.5:1 en texto). `brand.ts` elige automáticamente blanco o casi negro como `primary-foreground` para cualquier color de marca.
- **Contraste sobre vidrio:** se mide sobre la zona **más brillante** de la aurora (cian o durazno), no sobre el promedio. Por eso la opacidad de `--glass` tiene un mínimo y `--aurora-veil` baja el brillo; si un texto no llega a 4.5:1, se sube la opacidad del token, no se agrega un fondo en la pantalla.
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
- [ ] Ningún layout ni pantalla pinta fondo de página; el vidrio sale de `Card`, de los primitivos o de las utilidades `glass` / `glass-strong`, sin `backdrop-blur` sueltos.
- [ ] No hay vidrio dentro de vidrio ni sombras sueltas.
- [ ] Los tokens `aurora-*` no aparecen fuera de `globals.css` y `aurora-background.tsx`.
- [ ] Se probó en oscuro y claro (sobre la zona más brillante de la aurora), a 375 px de ancho, con "reducir movimiento" y con al menos dos colores de marca (uno rojo, para confirmar que no se confunde con "Vencido").

```sh
# Comprobaciones rápidas (no deberían devolver nada)
rg "(emerald|amber|rose|sky|slate|red|green|blue|orange|yellow)-\d{2,3}" src
rg "text-\[\d+px\]" src
rg "\brounded\b[^-]" src --glob '!src/components/ui/**'
rg "dark:" src/app
rg "bg-muted/30|backdrop-blur|shadow-(sm|md|lg|xl)" src --glob '!src/components/ui/**'
rg -F "var(--aurora" src --glob '!src/app/globals.css' --glob '!**/aurora-background.tsx'
```

---

## 16. Aurora

El fondo de toda la app es [`AuroraBackground`](src/components/shared/aurora-background.tsx): olas de luz en los colores del logo que se desplazan despacio detrás del vidrio.

**Capas** (de atrás hacia adelante):

1. Base: `--aurora-base`.
2. Cuatro olas SVG, cada una con un degradado de dos o tres colores `--aurora-*`, desenfocadas y con forma de onda. El SVG mide el doble del ancho de la pantalla y la onda se repite, así que al desplazarlo `-50 %` el ciclo no tiene costura.
3. Velo (`--aurora-veil`): baja el brillo para que el vidrio y el texto se lean.

**Movimiento:**

- Cada ola combina `aurora-wave` (desplazamiento horizontal, 28–46 s) con `aurora-drift` (vaivén vertical y de escala, 14–22 s). Duraciones y sentidos distintos para que el conjunto nunca se vea repetido.
- Solo se animan `transform` (lo resuelve la GPU, sin repintar). Sin JavaScript.
- En celular (`max-sm`) se oculta la cuarta ola y se reduce el desenfoque.
- Con `prefers-reduced-motion` la aurora queda quieta.

**Intensidad elegida por el usuario:**

- Cada persona elige en su menú (panel, portal, Operación y Propietario) entre **Apagada**, **Tenue**, **Normal** y **Viva**. Lo hace [`AuroraMenuGroup`](src/components/layout/aurora-menu.tsx); los niveles y la clave de guardado están en [`src/lib/aurora.ts`](src/lib/aurora.ts).
- Se guarda en el navegador (como el tema), no en la cuenta. Un script en el layout raíz pone `data-aurora` en `<html>` antes del primer pintado, así no parpadea.
- En `globals.css`, el nivel multiplica la intensidad (`--aurora-level`: Tenue 0.5, Normal 1, Viva 1.5) y "Apagada" oculta las olas: queda solo el fondo base y el vidrio.
- Los tokens describen el nivel **Normal**. Para cambiar cuánto separa un nivel de otro se toca `--aurora-level`, no los colores.

**Para ajustar:**

| Quiero… | Toco |
|---|---|
| Cambiar colores | `--aurora-1…5` en `globals.css` (claro y oscuro) |
| Más o menos intensidad (para todos) | `--aurora-opacity` y `--aurora-veil` |
| Cuánto cambian Tenue y Viva | `--aurora-level` en `[data-aurora=…]` |
| Más o menos velocidad | Las duraciones de `.aurora-wave-n` en `globals.css` |
| Más o menos transparencia del vidrio | `--glass` y `--glass-strong` (revisando el contraste, §14) |
