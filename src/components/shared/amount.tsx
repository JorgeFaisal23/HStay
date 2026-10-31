import { moneyParts, type Decimalish } from "@/lib/format";
import { moneyEntries, type Currency, type MoneyByCurrency } from "@/lib/currency";
import { TONE_TEXT, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Monto de dinero. La cifra es la protagonista: cifras tabulares, peso
 * semibold y el símbolo de moneda atenuado y un paso más chico. Hereda el
 * tamaño de su contenedor, así sirve igual en una tabla que en un KPI.
 */
export function Amount({
  value,
  currency = "MXN",
  compact,
  tone,
  className,
}: {
  value: Decimalish;
  /** Moneda de la propiedad del monto. Pesos si no se indica. */
  currency?: Currency;
  /** Sin centavos: para KPIs, donde los centavos son ruido. */
  compact?: boolean;
  /** Color de estado; nunca se usa solo, siempre junto a un texto. */
  tone?: Tone;
  className?: string;
}) {
  const { sign, symbol, number } = moneyParts(value, { compact, currency });
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular-nums",
        tone && TONE_TEXT[tone],
        className,
      )}
    >
      {sign}
      <span className="mr-px align-baseline text-[0.8em] font-normal opacity-60">
        {/* "USD" va separado de la cifra; "$" va pegado. */}
        {symbol.length > 1 ? `${symbol} ` : symbol}
      </span>
      {number}
    </span>
  );
}

/**
 * Total que junta propiedades de varias monedas: una cifra por moneda, pesos
 * primero, sin sumar pesos con dólares. Con una sola moneda se ve igual que
 * un <Amount>.
 */
export function Amounts({
  value,
  compact,
  tone,
  className,
}: {
  value: MoneyByCurrency;
  compact?: boolean;
  tone?: Tone;
  className?: string;
}) {
  const entries = moneyEntries(value);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      {entries.map(([currency, amount], index) => (
        <span key={currency} className="inline-flex items-baseline gap-x-2">
          {index > 0 ? (
            <span className="text-muted-foreground font-normal" aria-hidden>
              ·
            </span>
          ) : null}
          <Amount value={amount} currency={currency} compact={compact} tone={tone} />
        </span>
      ))}
    </span>
  );
}
