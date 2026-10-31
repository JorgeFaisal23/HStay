import type {
  BookingSource,
  BookingStatus,
  ChargeStatus,
  ExpenseStatus,
  LeaseStatus,
  ProofStatus,
  TaskKind,
  TaskStatus,
  Role,
  ServiceType,
  SplitMode,
  UnitStatus,
  UnitType,
} from "@/generated/prisma/enums";

/**
 * Etiquetas en español y colores de estado. El "semáforo" vive aquí para que
 * verde/ámbar/rojo signifiquen lo mismo en toda la aplicación. Cada estado
 * lleva siempre texto además de color: nunca se comunica solo con color.
 */

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success-foreground border-success-border",
  warning: "bg-warning-soft text-warning-foreground border-warning-border",
  danger: "bg-danger-soft text-danger-foreground border-danger-border",
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-soft text-info-foreground border-info-border",
};

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
};

/** Texto en color de estado, sin fondo: cifras y avisos en línea. */
export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
  neutral: "text-muted-foreground",
  info: "text-info-foreground",
};

// ------------------------------------------------------------------ roles

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadministrador",
  OWNER: "Arrendador",
  ADMIN: "Administrativo",
  VIEWER: "Consulta",
  OPERATIONS: "Operación",
  PROPERTY_OWNER: "Propietario",
  CAPTURE: "Captura",
  TENANT: "Inquilino",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPERADMIN: "Administra las arrendadoras de la plataforma",
  OWNER: "Acceso total, incluida la marca y el equipo",
  ADMIN: "Gestiona propiedades, servicios y cobros",
  VIEWER: "Solo puede consultar el calendario",
  OPERATIONS: "Ve y cierra las limpiezas y reparaciones que se le asignan",
  PROPERTY_OWNER: "Ve el estado de cuenta de sus propiedades y lo que se le ha entregado",
  CAPTURE: "Registra y corrige reservas solo de las propiedades que se le asignan",
  TENANT: "Entra al portal a ver su contrato y sus pagos",
};

// ------------------------------------------------------------------ unidades

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  ROOM: "Cuarto",
  APARTMENT: "Departamento",
  STUDIO: "Estudio",
  COMMERCIAL: "Local comercial",
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  AVAILABLE: "Disponible",
  OCCUPIED: "Ocupada",
  SHORT_TERM: "Renta corta",
  MAINTENANCE: "Mantenimiento",
};

export const UNIT_STATUS_TONES: Record<UnitStatus, Tone> = {
  AVAILABLE: "info",
  OCCUPIED: "success",
  SHORT_TERM: "warning",
  MAINTENANCE: "neutral",
};

// ------------------------------------------------------------------ servicios

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  WATER: "Agua",
  ELECTRICITY: "Luz",
  INTERNET: "Internet",
  MAINTENANCE: "Mantenimiento",
  GAS: "Gas",
  OTHER: "Otro",
};

/** Orden fijo de columnas en la tabla de servicios. */
export const SERVICE_TYPE_ORDER: ServiceType[] = [
  "WATER",
  "ELECTRICITY",
  "INTERNET",
  "MAINTENANCE",
  "GAS",
  "OTHER",
];

export const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  NONE: "Sin prorrateo",
  EQUAL: "Partes iguales",
  BY_SIZE: "Por metros cuadrados",
};

// ------------------------------------------------------------------ cobros

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  PARTIAL: "Parcial",
  OVERDUE: "Vencido",
};

export const CHARGE_STATUS_TONES: Record<ChargeStatus, Tone> = {
  PENDING: "warning",
  PAID: "success",
  PARTIAL: "info",
  OVERDUE: "danger",
};

// ------------------------------------------------------------------ comprobantes

export const PROOF_STATUS_LABELS: Record<ProofStatus, string> = {
  SUBMITTED: "Por revisar",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export const PROOF_STATUS_TONES: Record<ProofStatus, Tone> = {
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
};

// ------------------------------------------------------------------ operación

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  CLEANING: "Limpieza",
  REPAIR: "Reparación",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Por hacer",
  DONE: "Hecha",
  CANCELLED: "Cancelada",
};

export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = {
  OPEN: "warning",
  DONE: "success",
  CANCELLED: "neutral",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: "Por aprobar",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export const EXPENSE_STATUS_TONES: Record<ExpenseStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

// ------------------------------------------------------------------ contratos

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Vigente",
  ENDED: "Terminado",
  CANCELLED: "Cancelado",
};

export const LEASE_STATUS_TONES: Record<LeaseStatus, Tone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  ENDED: "neutral",
  CANCELLED: "danger",
};

// ------------------------------------------------------------------ reservas

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  AIRBNB: "Airbnb",
  DIRECT: "Reserva directa",
  MANUAL: "Registro manual",
};

/**
 * Colores del calendario. Se mantienen fuera del token de marca a propósito:
 * distinguir el origen de una reserva es información, no estilo, y debe seguir
 * siendo legible aunque el arrendador elija un color de marca parecido.
 */
export const BOOKING_SOURCE_CLASSES: Record<BookingSource, string> = {
  AIRBNB: "bg-event-airbnb text-event-foreground",
  DIRECT: "bg-event-direct text-event-foreground",
  MANUAL: "bg-event-manual text-event-foreground",
};

export const LEASE_BAR_CLASS = "bg-event-lease text-event-foreground";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Terminada",
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, Tone> = {
  CONFIRMED: "success",
  CANCELLED: "neutral",
  COMPLETED: "neutral",
};
