# HStay

> El producto se llama **HStay**. En el código se usa `APP.name` (variable
> `NEXT_PUBLIC_APP_NAME`, por defecto `HStay`). **CARCAR es un cliente** (una
> arrendadora), no el producto; el repositorio conserva ese nombre por
> historia. Las instalaciones que ya fijan `NEXT_PUBLIC_APP_NAME=AppRentas`
> (`.env.production`, `render.yaml`) siguen mostrando ese nombre hasta que se
> cambie la variable y se vuelva a compilar.

Plataforma de gestión de rentas: edificios con múltiples
unidades, control de servicios, cobros de renta, calendario unificado con
reservas de corta estancia y portal para inquilinos.

## Dos identidades

No hay que confundirlas:

| | Qué es | Dónde vive | Quién la cambia |
|---|---|---|---|
| **Producto** (`APP.name`) | El software | `src/lib/app.ts` | Variables `NEXT_PUBLIC_APP_*` al compilar; nadie desde la app |
| **Marca del arrendador** | Nombre, logo, color y tipografía de quien renta | Tabla `Organization` | El dueño, en `/configuracion/marca` |

La marca del arrendador viste la interfaz completa (panel, portal y acceso);
el producto aparece solo en los márgenes: pie del menú lateral, pie del portal,
pantalla de acceso, página de planes, favicon y metadatos. El distintivo del
producto usa su propio color (`APP.color`) para que no cambie con el color de
marca que elija cada cliente.

## Cuentas de demostración

Contraseña para todas: **`demo1234`**. Con `DEMO_MODE=true` la pantalla de
acceso muestra botones que llenan el formulario con cada perfil. En producción
`DEMO_MODE` va apagado y esas cuentas no deben existir.

El seed crea dos arrendadoras para que se vea el aislamiento entre ellas, más
la cuenta de la plataforma:

| Correo | Arrendadora | Rol | Qué puede hacer |
|---|---|---|---|
| `super@demo.mx` | — | Superadministrador | Administra las arrendadoras (no ve sus datos) |
| `dueno@demo.mx` | Rentas del Valle (`demo`, Premium) | Arrendador | Todo, incluida la marca y el equipo |
| `admin@demo.mx` | Rentas del Valle | Administrativo | Propiedades, servicios, cobros e inquilinos |
| `consulta@demo.mx` | Rentas del Valle | Consulta | **Solo lectura**: resumen y calendario |
| `operacion@demo.mx` | Rentas del Valle | Operación | Solo **sus tareas** de limpieza y reparación (`/operacion`), pensado para celular |
| `inquilino@demo.mx` | Rentas del Valle | Inquilino | Portal con su contrato, pagos y servicios |
| `dueno2@demo.mx` | Casa Norte (`demo2`, gratuito) | Arrendador | Lo mismo, sobre sus propios datos |
| `inquilino2@demo.mx` | Casa Norte | Inquilino | Portal |

## Accesos y plataforma

| URL | Quién | Marca |
|---|---|---|
| `/a/{slug}/login` | Usuarios de esa arrendadora (dueño, equipo, inquilinos) | La de la arrendadora |
| `/login` | Cualquier usuario y el superadministrador | La del producto |
| `/superadmin` | Solo el superadministrador | La del producto |

- **Alta de arrendadoras:** el superadministrador las crea en
  `/superadmin/organizaciones/nueva` con su dueño; se genera una contraseña
  temporal que se muestra una sola vez. No hay registro público.
- **Plan y acceso:** desde el detalle de cada arrendadora se cambia su plan y
  se suspende o reactiva. Suspender saca de inmediato a todos sus usuarios y
  no borra nada. Cada cambio queda en la bitácora de la arrendadora.
- **El superadministrador no ve datos de operación** (propiedades, contratos,
  cobros): solo conteos y el equipo de cada arrendadora.
- El navegador recuerda la última arrendadora con la que se entró (cookie
  `app_org`) para mandar a su acceso con marca a quien vuelve sin sesión.
- **Primer superadministrador:** en desarrollo lo crea el seed
  (`SEED_SUPERADMIN_EMAIL`). En producción, donde el seed nunca se corre:

  ```bash
  npx tsx scripts/create-superadmin.ts correo@ejemplo.com "Nombre Apellido"
  ```

  Imprime una contraseña temporal una sola vez.

## Cuentas y contraseñas

- **Alta de cuentas** (dueño desde la plataforma, equipo desde *Equipo*,
  inquilinos desde *Inquilinos*): con correo configurado, la persona recibe un
  enlace para elegir su contraseña (vence en 7 días). Sin correo, quien hace el
  alta ve una contraseña temporal una sola vez para entregarla.
- **Contraseña temporal:** al entrar con ella se pide elegir una propia
  (`/cambiar-contrasena`) y no se puede usar la app hasta hacerlo.
- **Olvidé mi contraseña** (`/recuperar`, `/a/{slug}/recuperar`): con correo,
  manda un enlace que vence en 1 hora y sirve una vez. La respuesta es la misma
  exista o no la cuenta. Sin correo, remite al administrador, que puede
  restablecer el acceso desde *Equipo* o desde la ficha del inquilino.
- **Mi cuenta** (`/cuenta`, `/portal/cuenta`, `/superadmin/cuenta`): cambio
  voluntario, pidiendo la contraseña actual. Cambiarla cierra las demás sesiones.
- **Límite de intentos:** 5 contraseñas incorrectas por correo (o 30 por IP) en
  15 minutos bloquean esa cuenta 15 minutos.
- **Equipo:** solo el dueño lo administra. El plan gratuito incluye un usuario
  de equipo además del dueño.
- Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` y
  `APP_URL` (base de los enlaces; obligatoria en producción para mandarlos).
  Ver `.env.example`. Dos opciones probadas con cualquier servidor SMTP:
  - **Gmail:** `smtp.gmail.com`, puerto `465`, tu correo como usuario y una
    [contraseña de aplicación](https://myaccount.google.com/apppasswords)
    (requiere verificación en dos pasos). Límite aproximado de 500 correos al día.
  - **Brevo** (plan gratuito, 300 al día): `smtp-relay.brevo.com`, puerto
    `587`, usuario y clave SMTP de su panel; verifica el remitente de
    `MAIL_FROM` antes de enviar.

## Contratos y cobros

- **Contrato nuevo:** al dar de alta a un inquilino o, para uno ya registrado,
  desde su ficha (*Asignar unidad*) o desde una unidad libre
  (`/inquilinos/asignar`). Se rechaza si la unidad está en mantenimiento, ya
  tiene contrato vigente o tiene reservas de corta estancia en esas fechas.
- **Renovar:** nuevo vencimiento y, si cambia, renta nueva para los cargos que
  aún no se generan.
- **Terminar:** con fecha de hoy o anterior termina ya y la unidad queda libre;
  con fecha futura, termina solo ese día. Se borran los cargos posteriores sin
  pagos; los adeudos se conservan y siguen visibles en la ficha y el portal.
- **Cancelar:** solo sin pagos registrados (capturas por error).
- **Vencimientos automáticos:** al abrir el panel o el portal (máximo una vez
  por hora por arrendadora) los contratos vencidos se terminan y los cobros
  pendientes con fecha pasada se marcan vencidos (`src/lib/db/sweep.ts`). No
  hace falta cron.
- **Pagos parciales:** cada pago es una fila de `RentPayment`; el cargo guarda
  el resumen (abonado, estado y datos del último pago). No se puede pagar más
  de lo que falta. *Deshacer* borra los pagos del cargo, con confirmación.
- **Límites del plan gratuito:** 2 propiedades, 20 unidades y 1 usuario de
  equipo además del dueño (`src/lib/plans.ts`). Bajar de plan no borra nada.
  El uso se ve en `/premium`.

## Propiedades, servicios y reservas

- **Editar y eliminar** propiedades y unidades desde su ficha. Eliminar borra
  en cascada contratos, cobros y servicios, así que solo se permite si nunca
  tuvieron contratos, reservas ni servicios capturados; con historial se
  edita en su lugar. Archivar queda pendiente.
- **Recibos de la propiedad** (agua del edificio, mantenimiento…): se dan de
  alta en la ficha de la propiedad con su modo de reparto (partes iguales, por
  metros cuadrados o sin reparto). El monto se captura en Servicios, que
  muestra el reparto por unidad (`src/lib/services/allocation.ts`).
- **Reservas manuales:** desde el calendario o desde una unidad de corta
  estancia. Se rechazan si se cruzan con otra reserva confirmada o con un
  contrato vigente o en borrador; la salida de una puede ser la llegada de la
  siguiente. Las capturadas aquí se pueden cancelar; las de Airbnb, no.

## Varias arrendadoras en la misma app

Cada tabla con datos de una arrendadora lleva `organizationId`. Las páginas y
las acciones nunca usan el cliente de Prisma directamente: piden la sesión con
`requireOrgUser` / `requireOrgUserAction`, que devuelven `db`, un cliente
limitado a la arrendadora de la sesión ([`src/lib/db/scoped.ts`](src/lib/db/scoped.ts)).
Ese cliente impone el filtro en cada lectura, actualización y borrado, y
estampa la arrendadora en cada alta; un id de otra arrendadora simplemente "no
existe".

Lo que el cliente no puede cubrir son las llaves foráneas que llegan del
navegador en un alta (por ejemplo, el `unitId` de un contrato nuevo): las
acciones las verifican antes con [`src/lib/db/guards.ts`](src/lib/db/guards.ts).

Tres candados evitan que alguien se salte esto sin darse cuenta:

- **ESLint** prohíbe importar `@/lib/prisma` fuera de los módulos de plataforma
  (lista en `eslint.config.mjs`).
- **Prueba de arquitectura** ([`src/test/architecture.test.ts`](src/test/architecture.test.ts)):
  cada modelo nuevo debe clasificarse y cada server action debe exigir sesión.
- **Prueba de aislamiento** ([`src/test/actions-isolation.int.test.ts`](src/test/actions-isolation.int.test.ts)):
  llama a cada server action como usuario de una arrendadora con ids de otra y
  comprueba que la otra queda intacta.

## Puesta en marcha

```bash
npm install
npm run db:deploy   # aplica las migraciones de prisma/migrations
npm run db:seed     # carga los datos de demostración
npm run dev         # http://localhost:3000
```

`.env.local` gana sobre `.env` (en Next, en Prisma y en el seed). Úsalo para
apuntar a tu base local de desarrollo y nunca a producción.

### Base local de desarrollo

Basta un PostgreSQL local. Con los binarios de PostgreSQL instalados se puede
levantar un clúster propio, sin tocar el servicio del sistema:

```bash
initdb -D ~/pgdata/apprentas-dev -U postgres -A trust -E UTF8 --locale=C
pg_ctl -D ~/pgdata/apprentas-dev -o "-p 5433 -c listen_addresses=localhost" -l ~/pgdata/apprentas-dev.log start
createdb -h localhost -p 5433 -U postgres apprentas_dev
createdb -h localhost -p 5433 -U postgres apprentas_test
createdb -h localhost -p 5433 -U postgres apprentas_shadow
```

y en `.env.local` las URLs de `.env.example` (sección "Solo desarrollo").
`-A trust` deja entrar sin contraseña: solo para un clúster que escucha en
`localhost`.

Variables de entorno (ver `.env.example`):

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión que usa la app en ejecución |
| `DIRECT_URL` | Conexión que Prisma usa para migrar (igual a `DATABASE_URL` salvo que haya un pooler) |
| `AUTH_SECRET` | Clave con la que se firman las sesiones |
| `NEXT_PUBLIC_APP_NAME` | Nombre del producto (por defecto `HStay`). También `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_COLOR` y `NEXT_PUBLIC_APP_URL`. Se incrustan al compilar |
| `COOKIE_SECURE` | Cookie de sesión `secure`. Vacío: la decide `X-Forwarded-Proto` del proxy; `true` la fuerza; `false` la apaga |
| `DEMO_MODE` | `true` muestra las cuentas de prueba en el acceso. Nunca en producción |
| `SHADOW_DATABASE_URL` | Solo desarrollo: base auxiliar de `migrate dev` |
| `TEST_DATABASE_URL` | Solo desarrollo: base de las pruebas de integración |

Otros comandos:

```bash
npm run db:migrate  # crea una migración nueva tras editar schema.prisma
npm run db:reset    # borra todo, reaplica migraciones y vuelve a sembrar
npm test            # pruebas unitarias (sin base de datos)
npm run test:int    # pruebas de integración (TEST_DATABASE_URL)
npm run db:studio   # explorador de la base de datos
npm run build       # build de producción
```

Las pruebas de integración no borran la base: aplican las migraciones con
`migrate deploy`, crean arrendadoras con identificadores únicos y eliminan solo
lo que crearon.

## Cómo está organizado

```
prisma/
  schema.prisma          modelo de datos
  seed.ts                datos de demostración
src/
  app/
    login/               acceso
    (dashboard)/         panel administrativo (menú lateral)
    (portal)/portal/     portal del inquilino (sin menú lateral)
  components/
    ui/                  componentes de shadcn/ui (Base UI)
    shared/              piezas propias reutilizables
    layout/              menú lateral, menú de usuario, avisos
    premium/             muro de pago
  lib/
    auth/                sesión con JWT firmado (jose)
    queries/             lecturas de base de datos, una por módulo
    services/            reparto de recibos de edificio
    brand.ts             identidad de marca → variables CSS
    labels.ts            textos en español y semáforo de estados
  server/actions/        Server Actions (escrituras)
  proxy.ts               control de acceso por rol
```

### Decisiones que conviene conocer

- **Comprobante de pago con la cámara.** Al registrar un pago se puede adjuntar
  una foto del recibo o de la transferencia. El botón "Tomar foto" usa
  `capture="environment"`, así que en celular abre la cámara directamente. El
  comprobante es **opcional**: obligarlo bloquearía los pagos en efectivo que se
  registran sin papel. Se ve desde Cobros, desde la ficha del inquilino y desde
  el portal del propio inquilino; si se deshace el pago, el comprobante se borra
  con él porque era la evidencia de ese pago.

- **Sesión propia en vez de NextAuth.** Un JWT firmado con `jose` (~60 líneas en
  `src/lib/auth/`) cubre login por credenciales y funciona igual en el runtime
  Edge del proxy y en las Server Actions, sin depender de una beta.
- **Sistema visual en [`DESIGN.md`](DESIGN.md).** Es la fuente de verdad del
  frontend: tokens, tipografía, tratamiento del dinero, catálogo de componentes
  y lista de revisión. Cualquier cambio de interfaz empieza ahí.
- **Marca como variables CSS.** `src/lib/brand.ts` convierte el color, el radio y
  la tipografía guardados en `Organization` en tokens que se inyectan en el
  layout raíz durante el render en servidor. Por eso el cambio de marca se
  aplica en el primer pintado, sin parpadeo, y alcanza al panel, al portal y a
  la pantalla de acceso. Ningún componente escribe un color a mano.
- **`<select>` nativo en los formularios.** En celular abre el selector del
  sistema; la demo se muestra en teléfono.
- **Prisma 7 con driver adapter y migraciones.** Las URLs viven en
  `prisma7.config.ts`, no en el esquema. Los cambios de esquema van en
  `prisma/migrations`; `0_init` es el baseline del esquema que antes se
  mantenía con `db push`.
- **El color de los estados no es el color de marca.** Verde/ámbar/rojo y los
  colores del calendario están fuera de los tokens de marca a propósito:
  distinguir "vencido" de "pagado" es información, no estilo, y debe seguir
  siendo legible con cualquier color que elija el arrendador.

## Alcance de la demo

- **La pantalla de Integraciones está oculta del menú.** La sincronización con
  Airbnb es simulada, así que por ahora no se muestra en la demostración. El
  código y los datos siguen intactos: para volver a mostrarla, pon
  `SHOW_AIRBNB_INTEGRATION = true` en
  [`src/lib/features.ts`](src/lib/features.ts). Las reservas de corta estancia
  siguen visibles en el calendario y en la ficha de cada unidad.
- **Airbnb está simulado.** El botón "Sincronizar ahora" no consulta Airbnb: solo
  actualiza la marca de tiempo y refresca las reservas ya sembradas. El camino
  real (importar el enlace iCal del anuncio) y sus limitaciones están
  documentados en [`src/lib/airbnb/README.md`](src/lib/airbnb/README.md).
- **El plan lo cambia la plataforma**, no el arrendador: el seed deja a Rentas
  del Valle en Premium y a Casa Norte en gratuito para enseñar ambos casos, y
  el superadministrador lo cambia desde su panel. En `/premium` el dueño ve a
  quién escribir (`SUPPORT_EMAIL`).
- **Las imágenes se guardan como data URL** en la base de datos: el logo de la
  marca y los comprobantes de pago. Antes de subirse, los comprobantes se
  reescalan y recomprimen a JPEG en el navegador
  ([`src/lib/images.ts`](src/lib/images.ts)), así una foto de celular de 5 MB
  acaba pesando unos 200 KB. Para producción esto debe moverse a un
  almacenamiento de archivos (Vercel Blob o S3) y dejar en la base solo la ruta.
- **Lo que todavía no existe se rotula "Próximamente"** (`ComingSoonBadge`):
  plantillas y firma digital de contratos, y exportar reportes. Ninguna
  pantalla muestra datos inventados. Las automatizaciones (recordatorios
  automáticos) no forman parte del producto.
- **Todos los datos son ficticios.**

## Despliegue con Docker (VPS)

El repositorio trae [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml)
(app + PostgreSQL) y [`.env.production.example`](.env.production.example).

```bash
cp .env.production.example .env.production   # llénalo: contraseña de la base, AUTH_SECRET…
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production run --rm app create-superadmin tu@correo.com "Tu Nombre"
```

- `--env-file` alimenta las variables `${...}` del compose (base de datos y
  argumentos de build); `env_file` las pasa al contenedor en ejecución.
- **Migraciones:** el contenedor de la app aplica las pendientes al arrancar
  (`prisma migrate deploy`). `RUN_MIGRATIONS=false` desactiva ese paso.
- **Identidad del producto:** `NEXT_PUBLIC_APP_*` se incrustan al compilar la
  imagen; cambiarlas requiere `--build`.
- La imagen usa el modo `standalone` de Next: lleva `server.js` y solo los
  módulos que la app usa, más una carpeta `/migrator` con lo mínimo para
  migrar (CLI de Prisma) y crear superadministradores.
- Si ya tienes un PostgreSQL propio, quita el servicio `db` del compose y
  define `DATABASE_URL` y `DIRECT_URL` en `.env.production`.
- Pon un proxy inverso con HTTPS delante (Caddy, Nginx…) que mande
  `X-Forwarded-Proto`: con `https` la cookie de sesión sale `secure`
  (`COOKIE_SECURE=true` lo fuerza). Una prueba sin proxy, por
  `http://IP:3000`, funciona porque la cookie no se marca `secure`. La app ya manda sus encabezados de seguridad
  (CSP, `X-Frame-Options`, `nosniff`…, en [`next.config.ts`](next.config.ts));
  HSTS conviene ponerlo en el proxy, una vez que HTTPS funcione.

Comandos del contenedor ([`docker-entrypoint.sh`](docker-entrypoint.sh)):

| Comando | Qué hace |
|---|---|
| `start` (por defecto) | Aplica migraciones y arranca la app |
| `migrate` | Solo aplica migraciones |
| `baseline` | Marca una base creada antes de las migraciones como al día con `0_init` (una sola vez) |
| `create-superadmin correo "Nombre"` | Crea un superadministrador con contraseña temporal |

## Demo en Render

La demostración pública vive en Render y se despliega desde la rama `develop`
con [`render.yaml`](render.yaml): la misma imagen de Docker más un PostgreSQL
gratuito de Render. Producción sigue en el VPS.

1. En Render: **New > Blueprint**, el repositorio y la rama `develop`. Crea la
   base `apprentas-demo-db` y el servicio `apprentas-demo`.
2. Cuando lo pida, llena `NEXT_PUBLIC_APP_URL` y `APP_URL` con la URL del
   servicio (`https://apprentas-demo.onrender.com` o la que asigne Render). Si
   no se conoce aún, despliega y vuelve a desplegar después de definirlas.
3. El primer arranque aplica las migraciones. Para cargar los datos de
   demostración, copia la **External Database URL** de la base y corre el seed
   desde tu equipo. **El seed borra todo lo que haya en esa base**: revisa que
   la URL sea la de la demo.

   ```powershell
   $env:DIRECT_URL = "<External Database URL>?sslmode=require"; npm run db:seed; Remove-Item Env:DIRECT_URL
   ```

   Tiene que ser la **External** Database URL: su host termina en
   `.ohio-postgres.render.com`. La Internal (`@dpg-…-a/apprentas`, sin dominio)
   solo funciona dentro de Render. Desde fuera, Render exige SSL, de ahí el
   `?sslmode=require`. Al terminar, el seed imprime la lista de cuentas; si no
   la ves, no cargó nada.

Limitaciones del plan gratuito:

- **La base caduca a los 30 días.** Hay que borrarla, crear otra desde el
  blueprint (**Manual Sync**) y repetir el seed.
- **El servicio se duerme** tras unos 15 minutos sin visitas; la primera
  petición después tarda cerca de un minuto.
- **Sin correo.** Render no permite SMTP desde servicios gratuitos, así que no
  se define `SMTP_HOST`: las altas y los restablecimientos dan una contraseña
  temporal.

### Base existente creada con `db push`

La base que ya está en producción se creó con `prisma db push`, antes de que
existiera `prisma/migrations`. **Una sola vez**, antes del primer arranque de
esta versión, respáldala y márcala como al día con el baseline; si no, la app
intentará crear tablas que ya existen y no arrancará:

```bash
pg_dump "$DATABASE_URL" > respaldo-antes-de-migrar.sql
docker compose --env-file .env.production run --rm app baseline
docker compose --env-file .env.production up -d
```

Las migraciones siguientes convierten esa base al modelo multi-arrendador:
los datos existentes quedan en una arrendadora cuyo slug sale de su nombre de
marca (el superadministrador puede cambiarlo).

Los datos de demostración (`npm run db:seed`) nunca se cargan en producción.
