# Registro de Cambios (Changelog)

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/) (SemVer 2.0.0).

---

## [Sin publicar]

## [0.12.0] - 2026-10-30

### Añadido
- **Inquilinos sin correo**: se pueden dar de alta sin correo; quedan registrados sin acceso al portal y ocupan un usuario contratado igual que los demás. Al agregarles correo desde su ficha aparece "Acceso al portal" para invitarlos o darles contraseña temporal. El superadministrador los ve como "Sin correo" y su cupo se amplía como cualquier otro.
- **Editar contrato**: en un contrato vigente se corrigen inicio, renta, depósito y día de pago. Los cargos ya generados no cambian; el vencimiento se sigue moviendo con Renovar o Terminar.
- **Reservas** (`/reservas`, en el menú): lista de estancias cortas con búsqueda por huésped, correo, teléfono o unidad y filtros por propiedad, fechas y estado. Sin fechas muestra las actuales y próximas. Desde cada fila se ve en el calendario, se edita o se cancela.
- **Editar reserva**: en la lista y en la ficha de la unidad se corrigen huésped, fechas, unidad, total, origen y notas. Valida cruces igual que el alta (sin contar la propia reserva) bajo el candado de la unidad, y la limpieza pendiente se mueve a la nueva salida y unidad. Las de Airbnb se siguen corrigiendo en Airbnb.
- **Calendario más fácil de recorrer**: selector de mes y año para saltar directo (por ejemplo a 2027), buscador por persona o unidad (sin importar acentos ni mayúsculas) y botón "Lista de reservas". Quien puede editar abre la reserva o el inquilino con un clic en su barra o en las entradas y salidas de la vista de mes.
- Pruebas: `bookings.int.test.ts` (editar reservas) y `stay-range.test.ts` (barras del calendario).
- **Importador de ocupación** (`import-occupancy`, comando del contenedor): carga inquilinos, contratos y número de servicio de luz (CFE) de una arrendadora sobre unidades existentes. Simula por defecto, aplica con `--apply`, respeta las reglas de alta de contratos (candado por unidad, mantenimiento, contratos y reservas cruzadas) y el cupo de usuarios.

### Corregido
- **Los formularios ya no se borran al fallar**: el alta de inquilino, Asignar unidad, Nueva reserva y los diálogos de editar inquilino y de contrato conservan lo capturado cuando el servidor regresa un error (antes React vaciaba todos los campos). Envían con `useFormAction` (`src/hooks/use-form-action.ts`).
- **Una estancia que sale el día 1 ya no pinta el mes siguiente**: antes una reserva con salida el 1 de abril se dibujaba ocupando todo abril. El cálculo vive en `src/lib/stay-range.ts`, y el conteo "reservas en el mes" solo cuenta las que ocupan alguna noche.

### Cambiado
- **Día de pago del 1 al 31** (antes 1 a 28). En meses más cortos el cargo vence el último día del mes.

### Seguridad
- Migración `tenant_optional_email`: `User.email` admite nulo con un CHECK que solo lo permite en inquilinos; el resto de las cuentas sigue exigiéndolo. No toca datos existentes.
- Los archivos de clientes con datos personales (`docs/clientes/*/privado/`) quedan fuera de git.

## [0.11.0] - 2026-10-27

### Añadido
- **Propietarios** (B-05): dueños de inmuebles que administra la arrendadora. Rol nuevo `PROPERTY_OWNER` ("Propietario") con cuenta propia (ocupa un usuario contratado) que solo entra a `/propietario`: ve, por cada propiedad suya, lo **pendiente de entregarle**, el detalle por mes (rentas cobradas, reservas, reparaciones, servicios, neto y entregado) y las entregas con su comprobante. No ve nombres de inquilinos ni huéspedes. Cuenta demo `propietario@demo.mx` (Casa Juárez).
- **Propietarios en el panel** (`/propietarios`): alta, desactivación y restablecimiento de acceso; ficha con el estado de cuenta de cada propiedad, "Registrar entrega" (monto, fecha, forma de pago, referencia, nota y comprobante opcional) y "Deshacer". La ficha de cada propiedad tiene una sección Propietario para asignarlo y elegir desde qué mes se le rinden cuentas.
- **Regla del pendiente al propietario**: rentas por fecha de pago + reservas por su total en el mes de salida (sin canceladas) − reparaciones aprobadas − servicios incluidos en la renta − entregas, desde el mes de inicio de cuentas. Sin comisión de administración por ahora.
- **CSV "Cuentas de propietarios"** (Premium) en Reportes → Exportar, con el pendiente al cierre de cada mes.
- **Fondo de aurora en movimiento** (`AuroraBackground`): olas de luz en los colores del logo de HStay (violeta, azul, cian, magenta y durazno) que se desplazan despacio detrás de toda la app. Solo CSS, sin JavaScript; menos capas en celular y quieta con "reducir movimiento".
- **Intensidad de la aurora a elección del usuario**: en el menú de usuario (panel, portal, Operación y Propietario) se elige Apagada, Tenue, Normal o Viva. Se guarda en el navegador y se aplica antes del primer pintado.
- Tokens `--aurora-*` y `--glass-*`, y utilidades `glass` (tarjetas, encabezados, menú lateral) y `glass-strong` (diálogos, menús, popovers, toasts) en `globals.css`. Sección 16 "Aurora" en `DESIGN.md`.
- Pruebas: `owner-statement.test.ts`, `owners.int.test.ts` y los casos del rol Propietario en `permissions.test.ts`.

### Seguridad
- Una entrega no puede rebasar lo pendiente ni ser anterior al inicio de cuentas o futura; se valida bajo un candado por propiedad, así dos capturas simultáneas no lo rebasan. El propietario solo ve propiedades a su nombre y los comprobantes de entregas que se le hicieron; nadie más entra a `/propietario`.
- Migración `property_owners`: agrega el valor `PROPERTY_OWNER` al rol, `ownerId` y `ownerSince` (opcionales) en `Building` y la tabla `OwnerPayout` con un CHECK de monto positivo; no toca datos existentes.
### Cambiado
- El proyecto pasa a llamarse **HStay**: paquete `hstay` y `NEXT_PUBLIC_APP_NAME=HStay` en `render.yaml`, `docker-compose.yml` y `.env.production.example` (antes "AppRentas"). Los nombres internos de base de datos y servicios (`apprentas`) no cambian.
- Una propiedad con entregas al propietario no se puede eliminar (como las que tienen contratos, gastos o tareas).
- **Nuevo sistema visual: vidrio sobre aurora.** Tarjetas, encabezados, menú lateral y capas flotantes son superficies de vidrio translúcido; ningún layout pinta fondo propio. `DESIGN.md` se actualizó (principios, color, layout, elevación, movimiento, modo oscuro, accesibilidad y lista de revisión).
- **Tema oscuro por defecto**, con una aurora oscura y poco saturada para que domine el fondo. El claro sigue disponible desde el menú del usuario, con aurora pastel.
- **Logo del producto**: el distintivo provisional (la "H" sobre `#12263F`) se reemplaza por la "H" del logo de HStay en `AppMark`, el favicon y el manifiesto. `APP.color` pasa a `#6D28D9` (violeta del logo).
- El acceso muestra la marca en un panel de vidrio sobre la aurora en lugar de la columna de color sólido. `brand-soft` es ahora un tinte translúcido del color de la arrendadora.

## [0.10.0] - 2026-10-25

### Añadido
- **Rol Operación** (`OPERATIONS`): personal de limpieza y mantenimiento con cuenta propia (ocupa un usuario contratado). Solo entra a `/operacion` ("Mis tareas"): ve las tareas que tiene asignadas con unidad, dirección y para cuándo, y las marca como hechas desde el celular. No ve cobros ni datos de inquilinos. Se da de alta desde Equipo; cuenta demo `operacion@demo.mx`.
- **Tareas** (`/tareas` y "Hoy"): limpiezas ligadas a la salida de cada reserva (se programan y asignan desde "Hoy"; si la reserva se cancela, la limpieza también) y reparaciones que reporta el equipo o el inquilino. Cada una con responsable; "Hoy" muestra "Responsable: …" y un grupo nuevo de Mantenimiento con reparaciones, limpiezas atrasadas y gastos por aprobar.
- **Reportar un problema** desde el portal del inquilino (`/portal/reportes`), con foto y seguimiento: Recibido, En atención, Resuelto.
- **Gastos de reparación**: al cerrar una reparación con costo (foto y comprobante obligatorios) nace un gasto de la unidad por aprobar. El administrador lo aprueba (puede ajustar el monto) o lo rechaza con motivo. Aprobado, cuenta en "Dinero del mes" de Cobros, en Reportes (gasto y rentabilidad por propiedad) y en el CSV de gastos; "Antes de cerrar el mes" avisa los pendientes.
- **Tarifas de estancia por noche, semana y mes** por unidad. El total de una reserva se sugiere por bloques (cada 30 noches con la mensual, cada 7 con la semanal y el resto por noche; si falta una tarifa se usa la siguiente más chica) y se muestra el desglose ("1 semana + 3 noches = $12,600"). El total sigue siendo editable.
- Pruebas: `permissions.test.ts` (todos los roles), `rates.test.ts`, `tasks.int.test.ts`.

### Cambiado
- `baseRent` es siempre la renta mensual de contrato. La migración `stay_rates` copia la renta de las unidades de renta corta (que era por noche) a la nueva tarifa por noche; su "Renta mensual" conviene revisarla a mano.
- No se puede eliminar una unidad o propiedad con tareas o gastos registrados.
- Equipo permite elegir y cambiar entre Administrativo, Consulta y Operación.

### Seguridad
- Operación solo cierra y ve fotos de las tareas que tiene asignadas; una tarea ajena responde como inexistente. Las fotos y comprobantes se sirven desde `/operacion/archivos/{tipo}/{id}` con esa misma regla (los comprobantes de gastos, solo al equipo).
- El inquilino reporta solo sobre la unidad de su contrato o estancia: la unidad no la elige él.
- Migración `operations_tasks_expenses`: agrega el valor `OPERATIONS` al rol, las tablas `Task` y `Expense` y un CHECK de monto positivo; no toca datos existentes.

## [0.9.0] - 2026-10-25

### Añadido
- **Comprobantes por revisar**: el inquilino envía desde su portal (en "Mis pagos" o en la tarjeta del próximo cargo) el comprobante de un cargo, con monto, forma de pago, fecha, referencia y foto obligatoria. Enviarlo **no** paga el cargo: queda "Por revisar" en "Hoy" (primero en Cobros) y en la fila del cargo en Cobros. El equipo ve la foto, puede ajustar el monto y aprueba (se registra el pago) o rechaza con un motivo que el inquilino lee en su portal y puede reenviar. Modelo `PaymentProof` y migración `20261025220758_payment_proofs` (solo agrega una tabla).
- "Antes de cerrar el mes" cuenta los comprobantes por revisar.
- `ReceiptPicker`: captura de foto compartida por el registro de pago y el envío de comprobantes.

### Cambiado
- `registerPayment` valida lo que falta por pagar bajo un candado por cargo (el mismo que usa la aprobación de comprobantes), para que dos pagos simultáneos no rebasen el cargo.

### Seguridad
- Permiso nuevo para el inquilino, acotado: solo envía comprobantes de **sus** cargos (el filtro por inquilino va en la consulta, con el cliente con alcance de la arrendadora); no puede aprobar ni ver los de otros.
- Como máximo un comprobante por revisar por cargo, garantizado también por un índice único parcial en la base; una aprobación se toma con una actualización condicionada, así no se registran dos pagos por el mismo comprobante.
- La foto se sirve al equipo desde `/comprobantes/{id}/imagen` (solo OWNER/ADMIN de la arrendadora) en vez de incrustarla en las páginas.

## [0.8.0] - 2026-10-25

### Añadido
- **Hoy (`/hoy`)**: nueva pantalla de inicio para dueño y administrativo con lo que necesita atención: rentas vencidas (con "Registrar pago" en la misma fila), cargos del mes por generar (con "Generar cargos"), llegadas, salidas con limpieza por preparar (urgente si entra otro huésped el mismo día), entregas de unidad, contratos por vencer y servicios sin monto. Cada asunto muestra propiedad y unidad, la persona, la fecha y su acción. Los pendientes se derivan de los datos en cada carga (`src/lib/today.ts`): no hay tareas que capturar y, al resolver el dato de origen, el asunto desaparece solo. El rol de consulta no la ve y sigue entrando al resumen.
- **Primeros pasos** en "Hoy" para una cuenta nueva: propiedad → unidades → inquilino o reserva → cargos del mes, con el siguiente paso a un clic. Desaparece al completarse.
- **Dinero del mes** en Cobros: avance de cobranza, gastos de servicios y depósitos en garantía de contratos vigentes, cada uno por separado (los depósitos no cuentan como ingreso).
- **Antes de cerrar el mes** en Cobros: cargos por generar, cargos sin liquidar y servicios sin monto del periodo elegido.
- **Exportar a CSV** (Premium) desde Reportes: pendientes de hoy y cobros y gastos del mes actual o el anterior (`/reportes/exportar/{pendientes|cobros|gastos}`). UTF-8 con BOM para Excel, con defensa contra inyección de fórmulas; cada descarga queda en la bitácora.
- **Uso del plan** visible en Propiedades (`PlanUsage`) y en `/premium` también para Premium.
- **Demo en Render**: `render.yaml` despliega la rama `develop` con el `Dockerfile` del VPS y un PostgreSQL gratuito de Render, con `DEMO_MODE=true`. Pasos y limitaciones (base que caduca a los 30 días, sin SMTP) en el README, sección "Demo en Render".

### Seguridad
- La carpeta `Llaves/` queda en `.gitignore` para que las llaves SSH nunca se suban al repositorio.

### Cambiado
- El producto se llama **HStay**: es el valor por defecto de `APP.name` y de `.env.example`. Las instalaciones que fijan `NEXT_PUBLIC_APP_NAME` (`.env.production`, `render.yaml`) no cambian hasta que se edite la variable.
- El menú del panel empieza con "Hoy"; "Inicio" pasa a llamarse "Resumen".
- Los textos de límites en `/premium` salen de `PLAN_LIMITS` en lugar de escribirse a mano.
- El aviso Premium del resumen ya no promete recordatorios automáticos, firma digital ni usuarios por plan.
- "Generar cargos" y el aviso de cargos faltantes usan la misma regla (`chargeableLeasesWhere`); antes el botón contaba contratos vigentes menos cargos, que podía no coincidir con lo que se generaba.

### Corregido
- **Contratos empalmados por altas simultáneas**: el alta de contrato, el alta de inquilino con contrato y la renovación ahora validan la disponibilidad dentro de la transacción y bajo el mismo candado por unidad que las reservas (`lockUnit`). Antes, un contrato y una reserva (o dos contratos) capturados al mismo tiempo podían ocupar las mismas fechas.
- `ButtonLink` declara `nativeButton={false}`: pinta un enlace, y Base UI le ponía semántica de botón y lo avisaba en la consola de cada pantalla.
- **Inicio de sesión por HTTP**: la cookie de sesión ya no es `secure` siempre que la app corre en producción. Ahora sigue el encabezado `X-Forwarded-Proto` del proxy, y la variable `COOKIE_SECURE` (`true`/`false`) la fuerza o la apaga. Antes, al entrar sin HTTPS (por ejemplo, una prueba por `http://IP:3000`), el navegador descartaba la cookie y no se podía iniciar sesión. Se trajo de `main` (`aeb7ab8`).

## [0.7.0] - 2026-10-04

### Añadido
- **Control de cuota de usuarios contratados (`maxUsers`)**:
  - Restricción y campo `maxUsers` en `Organization` para delimitar la cantidad máxima de usuarios activos (dueños, equipo e inquilinos) permitidos por arrendadora.
  - Migración `20261004180000_user_quota` que inicializa el cupo de organizaciones existentes con su cantidad actual de cuentas activas y agrega restricción a nivel base de datos (`CHECK ("maxUsers" >= 1)`).
  - Módulo de validación de cuotas (`src/server/user-quota.ts`) con función `userQuotaErrorFor`.
  - Componente de interfaz `UserQuotaNote` y alertas preventivas en `/equipo` e `/inquilinos/nuevo` que deshabilitan altas y reactivaciones al alcanzar el cupo contratado.
  - Indicador de usuarios contratados en la vista de plan en `/premium`.
- **Panel de Superadministrador - Directorio de Usuarios (`/superadmin/usuarios`)**:
  - Búsqueda global de cuentas por nombre o correo electrónico.
  - Filtros dinámicos por arrendadora, rol (`OWNER`, `MEMBER`, `TENANT`) y estado de cuenta (activo / inactivo).
  - Indicadores de estado de cuenta: sesión abierta, contraseña temporal pendiente de cambio, cuenta inactiva, arrendadora suspendida o cuenta bloqueada por intentos fallidos.
- **Acciones de Soporte de Cuentas (`SupportActions`)**:
  - Restablecimiento administrativo de credenciales temporales con diálogo de confirmación seguro.
  - Cierre forzado de sesiones activas (`forceLogout`) desde la vista de superadministrador.
  - Desbloqueo inmediato de intentos de acceso fallidos.
  - Desactivación y reactivación de cuentas (con validación de cuota disponible al reactivar).
  - Auditoría automática: cada intervención de soporte queda registrada en la bitácora (`AuditLog`) de la arrendadora respectiva.
- **Gestión de Cupos en Organizaciones**:
  - Configuración del cupo inicial de usuarios (`maxUsers`, por defecto 2) al crear una nueva arrendadora en `/superadmin/organizaciones/nueva`.
  - Formulario para ajustar la cuota de usuarios en `/superadmin/organizaciones/[id]`, validando que el nuevo límite no sea inferior a los usuarios activos actuales.
- **Pruebas Automatizadas**:
  - Pruebas unitarias de cálculo de cuota de usuarios (`src/lib/plans.test.ts`).
  - Pruebas de integración de soporte de usuarios y límites contratados (`src/test/accounts.int.test.ts` y `src/test/superadmin.int.test.ts`).

### Cambiado
- Las acciones de invitación y alta de equipo (`src/server/actions/team.ts`) y de inquilinos (`src/server/actions/tenants.ts`) ahora validan la cuota total de usuarios contratados antes de procesar el registro.
- Navegación del panel de superadministrador actualizada con acceso directo a la sección "Usuarios".

---

## [0.6.0] - 2026-10-04

### Añadido
- Vista real de contratos vigentes en el menú principal del panel de administración.
- Componente `ComingSoonBadge` e insignias "Próximamente" para plantillas contractuales, firma digital y exportación de reportes.
- Encabezados de seguridad HTTP en `next.config.ts` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) y remoción de cabecera `X-Powered-By`.

### Cambiado
- Actualización de `/premium` para transparentar exactamente las características activas en el producto.

### Eliminado
- Módulo no funcional de Automatizaciones (página, consultas y accesos de menú).

---

## [0.5.0] - 2026-10-04

### Añadido
- Edición y eliminación segura de propiedades y unidades con validación de historial (contratos vigentes, reservas o servicios capturados).
- Recibos de edificio con modo de reparto (`splitMode`) y cuentas de servicios compartidas entre unidades y propiedades.
- Creación y cancelación de reservas manuales con validación de traslape temporal contra contratos vigentes o en borrador bajo candado de concurrencia.
- Pruebas de integración para aislamiento y validación de reglas de propiedades y reservas.

---

## [0.4.0] - 2026-10-04

### Añadido
- Ciclo de vida completo del contrato de arrendamiento: asignación a inquilinos existentes, renovación, terminación (inmediata o programada) y cancelación.
- Barrido perezoso (`lazy sweep`) sin dependencia de servicios cron externos para terminación de contratos vencidos y actualización de cobros atrasados.
- Pagos parciales con desglose en tabla `RentPayment`, registro de abonos y cálculos monetarios precisos en centavos.
- Límites de propiedades y unidades para el plan gratuito con indicador de uso en `/premium`.

---

## [0.3.0] - 2026-10-04

### Añadido
- Bloqueo de sesión con cambio obligatorio de contraseña tras el primer acceso con credencial temporal.
- Recuperación de contraseñas por correo electrónico con enlace de un solo uso y tokens protegidos con SHA-256.
- Integración de correo mediante Nodemailer con plantillas dinámicas según la marca de la arrendadora.
- Protección contra ataques de fuerza bruta con límite de intentos de acceso por IP y correo en base de datos.
- Gestión de equipo (altas, roles y desactivación) respetando límites del plan gratuito.

---

## [0.2.0] - 2026-10-03

### Añadido
- Panel de superadministrador en `/superadmin` para alta y administración de arrendadoras, asignación de planes y suspensión de cuentas.
- Acceso multi-marca en `/a/{slug}/login` con personalización de identidad visual (logotipo, colores, tipografía).
- Soporte para despliegue en VPS mediante Dockerfile multi-etapa y docker-compose con PostgreSQL 18.
- Scripts de inicialización del primer superadministrador (`create-superadmin`).

---

## [0.1.0] - 2026-10-03

### Añadido
- Arquitectura multi-inquilino con aislamiento a nivel de base de datos (`scoped.ts`) mediante `organizationId`.
- Identidad de producto configurable mediante variables de entorno (`NEXT_PUBLIC_APP_*`).
- Sistema de sesión única por usuario (`currentSessionId`) que invalida sesiones concurrentes.
- Migraciones iniciales y suite de pruebas automáticas con Vitest.
