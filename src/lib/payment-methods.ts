/** Formas de pago que se ofrecen al registrar un pago o enviar un comprobante. */
export const PAYMENT_METHODS = ["Transferencia", "Efectivo", "Depósito", "Tarjeta", "Otro"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
