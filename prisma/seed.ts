import "./env";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ServiceType,
  UnitStatus,
  UnitType,
} from "../src/generated/prisma/enums";

/**
 * Datos de demostración. Todo es ficticio.
 *
 * El objetivo no es solo llenar tablas: la demo tiene que contar una historia
 * creíble, así que hay contratos por vencer, un pago vencido, un mes a medio
 * capturar y unidades en cada estado posible.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const PASSWORD = "demo1234";

// ------------------------------------------------------------------ utilidades

const TODAY = new Date();
const YEAR = TODAY.getFullYear();
const MONTH = TODAY.getMonth();

function period(offset: number) {
  const d = new Date(YEAR, MONTH + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayIn(offsetMonths: number, day: number) {
  return new Date(YEAR, MONTH + offsetMonths, day, 12);
}

function daysFromToday(days: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Aleatoriedad reproducible: la demo se ve igual cada vez que se siembra. */
function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function amountAround(base: number, spread: number, salt: number) {
  return Math.round((base + (seeded(salt) - 0.5) * spread) / 5) * 5;
}

const CURRENT = period(0);

/** Seis meses de historial: es lo que hace legibles las gráficas de reportes. */
const HISTORY: [number, string][] = [-5, -4, -3, -2, -1, 0].map((offset) => [
  offset,
  period(offset),
]);

// ------------------------------------------------------------------ catálogos

type UnitSeed = {
  code: string;
  type: UnitType;
  status: UnitStatus;
  floor: number;
  bedrooms: number;
  bathrooms: number;
  sizeM2: number;
  baseRent: number;
  description: string;
};

const REFORMA_UNITS: UnitSeed[] = [
  { code: "101", type: "ROOM", status: "OCCUPIED", floor: 1, bedrooms: 1, bathrooms: 1, sizeM2: 18, baseRent: 6500, description: "Cuarto amueblado con baño propio y ventana a la calle." },
  { code: "102", type: "ROOM", status: "OCCUPIED", floor: 1, bedrooms: 1, bathrooms: 1, sizeM2: 16, baseRent: 6200, description: "Cuarto amueblado con baño propio." },
  { code: "103", type: "ROOM", status: "OCCUPIED", floor: 1, bedrooms: 1, bathrooms: 1, sizeM2: 20, baseRent: 6800, description: "Cuarto esquinero, doble ventana." },
  { code: "104", type: "ROOM", status: "OCCUPIED", floor: 2, bedrooms: 1, bathrooms: 1, sizeM2: 17, baseRent: 6400, description: "Cuarto amueblado, closet amplio." },
  { code: "105", type: "ROOM", status: "OCCUPIED", floor: 2, bedrooms: 1, bathrooms: 1, sizeM2: 22, baseRent: 7200, description: "Cuarto grande con escritorio y balcón." },
  { code: "106", type: "ROOM", status: "OCCUPIED", floor: 2, bedrooms: 1, bathrooms: 1, sizeM2: 16, baseRent: 6100, description: "Cuarto interior, muy silencioso." },
  { code: "107", type: "ROOM", status: "OCCUPIED", floor: 3, bedrooms: 1, bathrooms: 1, sizeM2: 19, baseRent: 6700, description: "Cuarto con vista al patio central." },
  { code: "108", type: "STUDIO", status: "SHORT_TERM", floor: 3, bedrooms: 1, bathrooms: 1, sizeM2: 28, baseRent: 1400, description: "Estudio equipado para estancias cortas. Publicado en Airbnb." },
  { code: "109", type: "ROOM", status: "AVAILABLE", floor: 3, bedrooms: 1, bathrooms: 1, sizeM2: 18, baseRent: 6500, description: "Cuarto amueblado, disponible de inmediato." },
  { code: "110", type: "ROOM", status: "MAINTENANCE", floor: 3, bedrooms: 1, bathrooms: 1, sizeM2: 17, baseRent: 6300, description: "En reparación de instalación hidráulica." },
];

const JUAREZ_UNITS: UnitSeed[] = [
  { code: "A-1", type: "APARTMENT", status: "OCCUPIED", floor: 1, bedrooms: 2, bathrooms: 1, sizeM2: 62, baseRent: 13500, description: "Departamento de dos recámaras con cocina integral." },
  { code: "A-2", type: "APARTMENT", status: "OCCUPIED", floor: 1, bedrooms: 2, bathrooms: 2, sizeM2: 70, baseRent: 15000, description: "Departamento de dos recámaras y dos baños." },
  { code: "A-3", type: "APARTMENT", status: "SHORT_TERM", floor: 2, bedrooms: 1, bathrooms: 1, sizeM2: 48, baseRent: 2100, description: "Departamento de una recámara para estancias cortas." },
  { code: "A-4", type: "STUDIO", status: "SHORT_TERM", floor: 2, bedrooms: 1, bathrooms: 1, sizeM2: 36, baseRent: 1750, description: "Estudio luminoso, ideal para viaje de trabajo." },
];

type TenantSeed = {
  email: string;
  name: string;
  phone: string;
  documentId: string;
  unitCode: string;
  building: "reforma" | "juarez";
  /** Meses de antigüedad del contrato. */
  startedMonthsAgo: number;
  /** Duración total del contrato en meses. */
  months: number;
  paymentDay: number;
  /**
   * Fija el vencimiento a N días de hoy en vez de calcularlo por meses.
   * Se usa en los dos contratos que la demo quiere mostrar "por vencer", para
   * que el aviso salga igual sin importar el día en que se siembre.
   */
  endsInDays?: number;
  notes?: string;
};

const TENANTS: TenantSeed[] = [
  { email: "inquilino@demo.mx", name: "María Fernanda López", phone: "55 1234 5678", documentId: "LOMF910312MDF", unitCode: "101", building: "reforma", startedMonthsAgo: 8, months: 12, paymentDay: 5 },
  { email: "jorge.medina@demo.mx", name: "Jorge Medina", phone: "55 2345 6789", documentId: "MEJO880920HDF", unitCode: "102", building: "reforma", startedMonthsAgo: 10, months: 12, paymentDay: 1, endsInDays: 43, notes: "Contrato por renovar." },
  { email: "ana.torres@demo.mx", name: "Ana Torres", phone: "55 3456 7890", documentId: "TOAN950714MDF", unitCode: "103", building: "reforma", startedMonthsAgo: 5, months: 12, paymentDay: 10 },
  { email: "luis.ramirez@demo.mx", name: "Luis Ramírez", phone: "55 4567 8901", documentId: "RALU870225HDF", unitCode: "104", building: "reforma", startedMonthsAgo: 3, months: 12, paymentDay: 5 },
  { email: "sofia.castro@demo.mx", name: "Sofía Castro", phone: "55 5678 9012", documentId: "CASO930408MDF", unitCode: "105", building: "reforma", startedMonthsAgo: 11, months: 12, paymentDay: 1, endsInDays: 4, notes: "Pago atrasado este mes." },
  { email: "diego.herrera@demo.mx", name: "Diego Herrera", phone: "55 6789 0123", documentId: "HEDI900117HDF", unitCode: "106", building: "reforma", startedMonthsAgo: 2, months: 12, paymentDay: 15 },
  { email: "paola.vega@demo.mx", name: "Paola Vega", phone: "55 7890 1234", documentId: "VEPA960530MDF", unitCode: "107", building: "reforma", startedMonthsAgo: 6, months: 12, paymentDay: 5 },
  { email: "ricardo.solis@demo.mx", name: "Ricardo Solís", phone: "55 8901 2345", documentId: "SORI850811HDF", unitCode: "A-1", building: "juarez", startedMonthsAgo: 9, months: 24, paymentDay: 1 },
  { email: "carmen.ortiz@demo.mx", name: "Carmen Ortiz", phone: "55 9012 3456", documentId: "ORCA920623MDF", unitCode: "A-2", building: "juarez", startedMonthsAgo: 4, months: 12, paymentDay: 3 },
];


/**
 * Comprobante de pago de ejemplo.
 *
 * Se genera como SVG para no arrastrar imágenes binarias en el repositorio;
 * imita la captura de una transferencia, que es lo que un arrendador adjunta
 * en la vida real. Los comprobantes que suben los usuarios desde la aplicación
 * siempre son JPEG (ver src/lib/images.ts).
 */
function receiptDataUrl(opts: {
  tenant: string;
  amount: number;
  date: Date;
  method: string;
  reference: string;
}) {
  const money = opts.amount.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
  const date = opts.date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="880" viewBox="0 0 620 880">
  <rect width="620" height="880" fill="#f1f5f9"/>
  <rect x="40" y="40" width="540" height="800" rx="20" fill="#ffffff"/>
  <rect x="40" y="40" width="540" height="110" rx="20" fill="#0f172a"/>
  <rect x="40" y="120" width="540" height="30" fill="#0f172a"/>
  <text x="70" y="95" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#ffffff" font-weight="bold">Banco Demo</text>
  <text x="70" y="125" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#94a3b8">Comprobante de operación</text>
  <circle cx="310" cy="235" r="42" fill="#dcfce7"/>
  <path d="M292 236 l13 13 l24 -26" stroke="#16a34a" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="310" y="318" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#16a34a" font-weight="bold">Operación exitosa</text>
  <text x="310" y="392" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#0f172a" font-weight="bold">${esc(money)}</text>
  <line x1="80" y1="440" x2="540" y2="440" stroke="#e2e8f0" stroke-width="2"/>
  <text x="80" y="486" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Concepto</text>
  <text x="540" y="486" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">Renta mensual</text>
  <text x="80" y="536" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Ordenante</text>
  <text x="540" y="536" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">${esc(opts.tenant)}</text>
  <text x="80" y="586" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Beneficiario</text>
  <text x="540" y="586" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">Rentas del Valle</text>
  <text x="80" y="636" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Forma de pago</text>
  <text x="540" y="636" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">${esc(opts.method)}</text>
  <text x="80" y="686" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Fecha</text>
  <text x="540" y="686" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">${esc(date)}</text>
  <text x="80" y="736" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Referencia</text>
  <text x="540" y="736" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#0f172a">${esc(opts.reference)}</text>
  <line x1="80" y1="770" x2="540" y2="770" stroke="#e2e8f0" stroke-width="2"/>
  <text x="310" y="806" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#94a3b8">Documento de demostración. Datos ficticios.</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

// ------------------------------------------------------------------ siembra

/**
 * Arrendadora principal de la demo: dos edificios, contratos, servicios, cobros
 * con historial y reservas de corta estancia.
 */
async function seedRentasDelValle(orgId: string, passwordHash: string) {
  // ---------------------------------------------------------- usuarios staff
  const staff = await Promise.all(
    [
      { email: "dueno@demo.mx", name: "Carlos Márquez", role: "OWNER" as const, phone: "55 1000 2000" },
      { email: "admin@demo.mx", name: "Daniela Ruiz", role: "ADMIN" as const, phone: "55 1000 3000" },
      { email: "consulta@demo.mx", name: "Despacho Contable Nava", role: "VIEWER" as const, phone: "55 1000 4000" },
      { email: "operacion@demo.mx", name: "Rosa Jiménez", role: "OPERATIONS" as const, phone: "55 1000 5000" },
    ].map((u) =>
      prisma.user.create({ data: { ...u, passwordHash, organizationId: orgId } }),
    ),
  );
  console.log(`Usuarios administrativos: ${staff.length}`);

  // Propietario de Casa Juárez: la arrendadora la administra y le rinde cuentas
  // desde hace tres meses (B-05).
  const propertyOwner = await prisma.user.create({
    data: {
      organizationId: orgId,
      email: "propietario@demo.mx",
      name: "Ernesto Salgado",
      role: "PROPERTY_OWNER",
      phone: "55 1000 6000",
      passwordHash,
    },
  });
  const now = new Date();
  const ownerSince = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  // ---------------------------------------------------------- edificios
  const reforma = await prisma.building.create({
    data: {
      organizationId: orgId,
      name: "Edificio Reforma",
      address: "Av. Reforma 148, Col. Juárez",
      city: "Ciudad de México",
      notes: "Diez cuartos en renta más un estudio para estancias cortas.",
    },
  });

  const juarez = await prisma.building.create({
    data: {
      organizationId: orgId,
      name: "Casa Juárez",
      address: "Calle Juárez 22, Col. Centro",
      city: "Ciudad de México",
      notes: "Cuatro departamentos; dos operan como renta vacacional.",
      ownerId: propertyOwner.id,
      ownerSince,
    },
  });

  // Captura: registra reservas solo de Casa Juárez.
  const capture = await prisma.user.create({
    data: {
      organizationId: orgId,
      email: "captura@demo.mx",
      name: "Natalia Ramos",
      role: "CAPTURE",
      phone: "55 1000 7000",
      passwordHash,
    },
  });
  await prisma.buildingAccess.create({
    data: { organizationId: orgId, userId: capture.id, buildingId: juarez.id },
  });

  const unitsByCode = new Map<string, { id: string; sizeM2: number; baseRent: number }>();

  for (const [building, seeds] of [
    [reforma, REFORMA_UNITS],
    [juarez, JUAREZ_UNITS],
  ] as const) {
    for (const seed of seeds) {
      const unit = await prisma.unit.create({
        data: {
          organizationId: orgId,
          buildingId: building.id,
          code: seed.code,
          type: seed.type,
          status: seed.status,
          floor: seed.floor,
          bedrooms: seed.bedrooms,
          bathrooms: seed.bathrooms,
          sizeM2: seed.sizeM2,
          // En las unidades de renta corta `seed.baseRent` es la tarifa por
          // noche; su renta mensual de contrato y sus tarifas de semana y mes
          // salen de ella para que la demo muestre el cálculo por bloques.
          ...(seed.status === "SHORT_TERM"
            ? {
                baseRent: seed.baseRent * 22,
                nightlyRate: seed.baseRent,
                weeklyRate: seed.baseRent * 6,
                monthlyRate: seed.baseRent * 22,
              }
            : { baseRent: seed.baseRent }),
          description: seed.description,
        },
      });
      unitsByCode.set(`${building.id}:${seed.code}`, {
        id: unit.id,
        sizeM2: seed.sizeM2,
        baseRent: seed.baseRent,
      });
    }
  }
  console.log(`Unidades: ${unitsByCode.size}`);

  // ---------------------------------------------------------- servicios
  // A nivel edificio: un solo recibo que se reparte entre las unidades.
  const buildingAccounts: { id: string; type: ServiceType; base: number }[] = [];

  for (const [building, water, maintenance] of [
    [reforma, "8891 4472 01", "MTTO-REF-2024"],
    [juarez, "8891 5530 77", "MTTO-JUA-2024"],
  ] as const) {
    const agua = await prisma.serviceAccount.create({
      data: {
        organizationId: orgId,
        type: "WATER",
        scope: "BUILDING",
        buildingId: building.id,
        providerName: "SACMEX",
        contractNumber: water,
        includedInRent: true,
        splitMode: "EQUAL",
      },
    });
    const mtto = await prisma.serviceAccount.create({
      data: {
        organizationId: orgId,
        type: "MAINTENANCE",
        scope: "BUILDING",
        buildingId: building.id,
        providerName: "Servicios Integrales GM",
        contractNumber: maintenance,
        includedInRent: true,
        splitMode: "EQUAL",
      },
    });
    buildingAccounts.push(
      { id: agua.id, type: "WATER", base: building.id === reforma.id ? 3200 : 1450 },
      { id: mtto.id, type: "MAINTENANCE", base: building.id === reforma.id ? 2800 : 1200 },
    );
  }

  // A nivel unidad: medidor de luz propio e internet contratado por cuarto.
  const unitAccounts: { id: string; type: ServiceType; base: number }[] = [];
  let meter = 4471000;

  for (const [building, seeds] of [
    [reforma, REFORMA_UNITS],
    [juarez, JUAREZ_UNITS],
  ] as const) {
    for (const seed of seeds) {
      const unit = unitsByCode.get(`${building.id}:${seed.code}`)!;
      meter += 137;

      const luz = await prisma.serviceAccount.create({
        data: {
          organizationId: orgId,
          type: "ELECTRICITY",
          scope: "UNIT",
          unitId: unit.id,
          providerName: "CFE",
          contractNumber: String(meter),
          includedInRent: false,
        },
      });
      unitAccounts.push({
        id: luz.id,
        type: "ELECTRICITY",
        base: seed.type === "APARTMENT" ? 1150 : 780,
      });

      // El internet solo está contratado (e incluido) en las unidades amuebladas.
      if (seed.status !== "MAINTENANCE") {
        const net = await prisma.serviceAccount.create({
          data: {
            organizationId: orgId,
            type: "INTERNET",
            scope: "UNIT",
            unitId: unit.id,
            providerName: "Totalplay",
            contractNumber: `TP-${meter}`,
            includedInRent: true,
          },
        });
        unitAccounts.push({ id: net.id, type: "INTERNET", base: 399 });
      }
    }
  }
  console.log(
    `Cuentas de servicio: ${buildingAccounts.length} de edificio, ${unitAccounts.length} de unidad`,
  );

  // ---------------------------------------------------------- cargos de servicio
  // Los dos meses anteriores están completos; el mes en curso a medias, para
  // que la demo muestre el estado vacío y el botón "copiar del mes anterior".
  const allAccounts = [...buildingAccounts, ...unitAccounts];
  let serviceChargeCount = 0;

  for (const [index, account] of allAccounts.entries()) {
    for (const [offset, key] of HISTORY) {
      const isCurrent = key === CURRENT;
      // En el mes en curso solo se ha capturado poco más de la mitad.
      if (isCurrent && seeded(index * 7.3) > 0.55) continue;

      const spread = account.type === "INTERNET" ? 0 : account.base * 0.35;
      await prisma.serviceCharge.create({
        data: {
          organizationId: orgId,
          serviceAccountId: account.id,
          period: key,
          amount: amountAround(account.base, spread, index * 3.1 + offset),
          dueDate: dayIn(offset, 20),
          status: isCurrent ? "PENDING" : "PAID",
          paidAt: isCurrent ? null : dayIn(offset, 18),
        },
      });
      serviceChargeCount += 1;
    }
  }
  console.log(`Cargos de servicio: ${serviceChargeCount}`);

  // ---------------------------------------------------------- inquilinos y contratos
  let rentChargeCount = 0;

  for (const [index, t] of TENANTS.entries()) {
    const tenant = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: t.email,
        name: t.name,
        phone: t.phone,
        documentId: t.documentId,
        role: "TENANT",
        passwordHash,
        notes: t.notes,
      },
    });

    const buildingId = t.building === "reforma" ? reforma.id : juarez.id;
    const unit = unitsByCode.get(`${buildingId}:${t.unitCode}`)!;

    const startDate = dayIn(-t.startedMonthsAgo, 1);
    const endDate =
      t.endsInDays === undefined
        ? dayIn(-t.startedMonthsAgo + t.months, 1)
        : daysFromToday(t.endsInDays);

    const lease = await prisma.lease.create({
      data: {
        organizationId: orgId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate,
        endDate,
        rentAmount: unit.baseRent,
        depositAmount: unit.baseRent,
        paymentDay: t.paymentDay,
        status: "ACTIVE",
        notes: t.notes,
      },
    });

    // Historial de renta: los dos meses previos pagados, el actual pendiente.
    // Sofía Castro (índice 4) queda vencida para mostrar el estado en rojo.
    for (const [offset, key] of HISTORY) {
      // No se cobra renta antes de que empezara el contrato.
      if (offset < -t.startedMonthsAgo) continue;

      const isCurrent = key === CURRENT;
      // Sofía Castro (índice 4) queda vencida y María Fernanda (índice 0, la
      // cuenta de demostración del portal) con su cargo del mes pendiente, para
      // que su portal muestre el próximo pago. El resto se reparte entre pagado
      // y pendiente para que la cobranza no se vea ni en ceros ni completa.
      const overdue = isCurrent && index === 4;
      const paid = !isCurrent || (index !== 4 && index % 2 === 1);
      const method = ["Transferencia", "Efectivo", "Depósito"][index % 3];
      const reference = `REF-${key.replace("-", "")}-${index + 1}`;
      const paidOn = dayIn(offset, t.paymentDay);
      // No todos los pagos traen comprobante: así la demo muestra ambos casos.
      const hasReceipt = paid && (index + offset) % 3 !== 0;

      await prisma.rentCharge.create({
        data: {
          organizationId: orgId,
          leaseId: lease.id,
          period: key,
          dueDate: dayIn(offset, t.paymentDay),
          amount: unit.baseRent,
          paidAmount: paid ? unit.baseRent : 0,
          status: overdue ? "OVERDUE" : paid ? "PAID" : "PENDING",
          paidAt: paid ? paidOn : null,
          method: paid ? method : null,
          reference: paid ? reference : null,
          receiptUrl: hasReceipt
            ? receiptDataUrl({
                tenant: t.name,
                amount: unit.baseRent,
                date: paidOn,
                method,
                reference,
              })
            : null,
        },
      });
      rentChargeCount += 1;
    }
  }
  console.log(`Contratos: ${TENANTS.length}, cargos de renta: ${rentChargeCount}`);

  // ---------------------------------------------------------- Airbnb (simulado)
  const shortTermCodes: { building: string; code: string; listing: string }[] = [
    { building: reforma.id, code: "108", listing: "Estudio moderno en Reforma" },
    { building: juarez.id, code: "A-3", listing: "Depa acogedor en el Centro" },
    { building: juarez.id, code: "A-4", listing: "Estudio luminoso Centro Histórico" },
  ];

  const guestNames = [
    "Emily Carter", "Tomás Iglesias", "Rachel Kim", "Marco Bianchi",
    "Julia Fischer", "Andrés Peña", "Hannah Müller", "Kenji Watanabe",
    "Laura Beaumont", "Peter O'Connor", "Valeria Rossi", "Samuel Adeyemi",
  ];

  let bookingCount = 0;
  let guestIndex = 0;

  for (const [i, st] of shortTermCodes.entries()) {
    const unit = unitsByCode.get(`${st.building}:${st.code}`)!;

    await prisma.airbnbConnection.create({
      data: {
        organizationId: orgId,
        unitId: unit.id,
        listingName: st.listing,
        listingUrl: `https://www.airbnb.mx/rooms/${40000000 + i * 137}`,
        icalUrl: `https://www.airbnb.mx/calendar/ical/${40000000 + i * 137}.ics?s=demo`,
        status: "CONNECTED",
        lastSyncedAt: new Date(TODAY.getTime() - 42 * 60 * 1000),
      },
    });

    // Reservas repartidas del mes pasado a los próximos dos meses.
    let cursor = -26 + i * 4;
    while (cursor < 58) {
      const nights = 2 + Math.floor(seeded(bookingCount * 5.7) * 5);
      const gap = 3 + Math.floor(seeded(bookingCount * 2.3) * 8);
      const checkIn = daysFromToday(cursor);
      const checkOut = daysFromToday(cursor + nights);
      const guestName = guestNames[guestIndex % guestNames.length];

      await prisma.booking.create({
        data: {
          organizationId: orgId,
          unitId: unit.id,
          source: bookingCount % 5 === 4 ? "DIRECT" : "AIRBNB",
          externalId: `HM${String(bookingCount + 1).padStart(6, "0")}`,
          guestName,
          guestEmail: `${guestName.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
          checkIn,
          checkOut,
          guests: 1 + Math.floor(seeded(bookingCount * 9.1) * 3),
          totalAmount: nights * unit.baseRent,
          status: cursor + nights < 0 ? "COMPLETED" : "CONFIRMED",
        },
      });

      bookingCount += 1;
      guestIndex += 1;
      cursor += nights + gap;
    }
  }
  console.log(`Reservas: ${bookingCount} en ${shortTermCodes.length} unidades conectadas`);

  // ---------------------------------------------------------- mantenimiento
  // Una reparación reportada por una inquilina, sin responsable todavía, para
  // que "Hoy" y Tareas muestren el flujo completo.
  const maria = await prisma.user.findFirst({ where: { organizationId: orgId, email: "inquilino@demo.mx" } });
  const unit101 = await prisma.unit.findFirst({ where: { organizationId: orgId, buildingId: reforma.id, code: "101" } });
  if (maria && unit101) {
    await prisma.task.create({
      data: {
        organizationId: orgId,
        kind: "REPAIR",
        unitId: unit101.id,
        title: "Gotea la llave del lavabo",
        description: "Gotea aunque esté cerrada; desde hace una semana.",
        reportedById: maria.id,
      },
    });
    console.log("Tareas: 1 reparación por asignar");
  }

}

/**
 * Segunda arrendadora, pequeña y en plan gratuito. Existe para que la demo (y
 * las pruebas) muestren que cada arrendadora solo ve lo suyo.
 */
async function seedCasaNorte(orgId: string, passwordHash: string) {
  await prisma.user.create({
    data: {
      organizationId: orgId,
      email: "dueno2@demo.mx",
      name: "Lucía Benítez",
      role: "OWNER",
      phone: "81 2000 1000",
      passwordHash,
    },
  });

  const building = await prisma.building.create({
    data: {
      organizationId: orgId,
      name: "Residencial Norte",
      address: "Av. Constitución 410, Col. Centro",
      city: "Monterrey",
    },
  });

  const units = [];
  for (const [code, status, rent] of [
    ["N-1", "OCCUPIED", 8900],
    ["N-2", "AVAILABLE", 8500],
    ["N-3", "AVAILABLE", 9200],
  ] as const) {
    units.push(
      await prisma.unit.create({
        data: {
          organizationId: orgId,
          buildingId: building.id,
          code,
          type: "APARTMENT",
          status,
          bedrooms: 1,
          bathrooms: 1,
          sizeM2: 45,
          baseRent: rent,
        },
      }),
    );
  }

  const tenant = await prisma.user.create({
    data: {
      organizationId: orgId,
      email: "inquilino2@demo.mx",
      name: "Héctor Garza",
      role: "TENANT",
      phone: "81 3000 4000",
      passwordHash,
    },
  });

  const lease = await prisma.lease.create({
    data: {
      organizationId: orgId,
      unitId: units[0].id,
      tenantId: tenant.id,
      startDate: dayIn(-3, 1),
      endDate: dayIn(9, 1),
      rentAmount: 8900,
      depositAmount: 8900,
      paymentDay: 5,
      status: "ACTIVE",
    },
  });

  for (const [offset, key] of HISTORY) {
    if (offset < -3) continue;
    const isCurrent = key === CURRENT;
    await prisma.rentCharge.create({
      data: {
        organizationId: orgId,
        leaseId: lease.id,
        period: key,
        dueDate: dayIn(offset, 5),
        amount: 8900,
        paidAmount: isCurrent ? 0 : 8900,
        status: isCurrent ? "PENDING" : "PAID",
        paidAt: isCurrent ? null : dayIn(offset, 4),
        method: isCurrent ? null : "Transferencia",
      },
    });
  }

  await prisma.serviceAccount.create({
    data: {
      organizationId: orgId,
      type: "ELECTRICITY",
      scope: "UNIT",
      unitId: units[0].id,
      providerName: "CFE",
      contractNumber: "9100221",
      includedInRent: false,
    },
  });

  console.log("Casa Norte: 1 edificio, 3 unidades, 1 contrato");
}

// ------------------------------------------------------------------ orquestación

async function main() {
  console.log("Limpiando datos anteriores…");
  await prisma.auditLog.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.task.deleteMany();
  await prisma.paymentProof.deleteMany();
  await prisma.rentPayment.deleteMany();
  await prisma.rentCharge.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.airbnbConnection.deleteMany();
  await prisma.serviceCharge.deleteMany();
  await prisma.serviceAccount.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.building.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = bcrypt.hashSync(PASSWORD, 10);

  // ---------------------------------------------------------- plataforma
  const superadminEmail = (
    process.env.SEED_SUPERADMIN_EMAIL ?? "super@demo.mx"
  ).toLowerCase();
  await prisma.user.create({
    data: {
      email: superadminEmail,
      name: "Administración de la plataforma",
      role: "SUPERADMIN",
      passwordHash,
    },
  });

  // ---------------------------------------------------------- arrendadoras
  const valle = await prisma.organization.create({
    data: {
      slug: "demo",
      name: "Rentas del Valle",
      brandName: "Rentas del Valle",
      plan: "PREMIUM",
      // Dueño, 3 de equipo, 1 propietario y 9 inquilinos activos: 14 de 17.
      maxUsers: 17,
      primaryColor: "#0F766E",
      radius: "SOFT",
      fontFamily: "Inter",
      contactEmail: "contacto@rentasdelvalle.mx",
      contactPhone: "55 1122 3344",
    },
  });
  await seedRentasDelValle(valle.id, passwordHash);

  const norte = await prisma.organization.create({
    data: {
      slug: "demo2",
      name: "Casa Norte",
      brandName: "Casa Norte",
      plan: "FREE",
      // Dueño y 1 inquilino: lleno al sumar uno más, para enseñar el aviso.
      maxUsers: 3,
      primaryColor: "#1D4ED8",
      radius: "ROUND",
      fontFamily: "Poppins",
      contactEmail: "hola@casanorte.mx",
    },
  });
  await seedCasaNorte(norte.id, passwordHash);

  // Cada cargo sembrado como pagado recibe su pago (igual que hace la
  // migración de pagos parciales con los datos existentes).
  const paidCharges = await prisma.rentCharge.findMany({ where: { paidAmount: { gt: 0 } } });
  await prisma.rentPayment.createMany({
    data: paidCharges.map((c) => ({
      organizationId: c.organizationId,
      rentChargeId: c.id,
      amount: c.paidAmount,
      paidAt: c.paidAt ?? c.updatedAt,
      method: c.method ?? "Sin especificar",
      reference: c.reference,
      receiptUrl: c.receiptUrl,
    })),
  });
  console.log(`Pagos: ${paidCharges.length}`);

  console.log(`\nListo. Contraseña para todas las cuentas: ${PASSWORD}`);
  console.log(`  ${superadminEmail.padEnd(20)} Superadministrador (plataforma)`);
  console.log("  Rentas del Valle (slug demo, Premium)");
  console.log("    dueno@demo.mx        Arrendador");
  console.log("    admin@demo.mx        Administrativo");
  console.log("    consulta@demo.mx     Solo lectura (calendario)");
  console.log("    operacion@demo.mx    Operación (sus tareas)");
  console.log("    propietario@demo.mx  Propietario de Casa Juárez (estado de cuenta)");
  console.log("    captura@demo.mx      Captura (reservas de Casa Juárez)");
  console.log("    inquilino@demo.mx    Inquilino (portal)");
  console.log("  Casa Norte (slug demo2, gratuito)");
  console.log("    dueno2@demo.mx       Arrendador");
  console.log("    inquilino2@demo.mx   Inquilino (portal)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
