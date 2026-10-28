import Link from "next/link";
import { cn } from "@/lib/utils";
import { BOOKING_SOURCE_CLASSES, LEASE_BAR_CLASS } from "@/lib/labels";
import type { CalendarBar, CalendarBarKind } from "@/lib/queries/calendar";

/**
 * Línea de tiempo por unidad: filas = unidades, columnas = días del mes.
 *
 * Es la vista que realmente comunica la ocupación de un edificio, porque pone
 * los arrendamientos largos y las estancias de tres noches en el mismo eje.
 * Se dibuja con CSS Grid: cada barra ocupa de `startDay` a `endDay + 1`.
 */

const BAR_STYLES: Record<CalendarBarKind, string> = {
  LEASE: LEASE_BAR_CLASS,
  ...BOOKING_SOURCE_CLASSES,
};

const WEEKDAY = ["D", "L", "M", "M", "J", "V", "S"];

export type TimelineRow = {
  unitId: string;
  code: string;
  buildingName: string;
  bars: CalendarBar[];
};

export function Timeline({
  rows,
  year,
  month,
  totalDays,
}: {
  rows: TimelineRow[];
  year: number;
  month: number;
  totalDays: number;
}) {
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  // Agrupamos por edificio para no perder el contexto al hacer scroll.
  const groups: { name: string; rows: TimelineRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.name === row.buildingName) last.rows.push(row);
    else groups.push({ name: row.buildingName, rows: [row] });
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${totalDays}, minmax(1.75rem, 1fr))`,
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-3xl">
        {/* ------------------------------------------------ encabezado */}
        <div className="flex border-b">
          <div className="bg-popover sticky left-0 z-10 w-28 shrink-0 py-2 pr-3 text-xs font-medium text-muted-foreground">
            Unidad
          </div>
          <div className="grid flex-1" style={gridStyle}>
            {days.map((day) => {
              const weekday = new Date(year, month, day).getDay();
              const isWeekend = weekday === 0 || weekday === 6;
              return (
                <div
                  key={day}
                  className={cn(
                    "py-1 text-center text-2xs leading-tight",
                    isWeekend ? "text-muted-foreground/70" : "text-muted-foreground",
                    day === todayDay && "text-primary font-semibold",
                  )}
                >
                  <span className="block">{WEEKDAY[weekday]}</span>
                  <span className="block tabular-nums">{day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------------------------------------------- filas */}
        {groups.map((group) => (
          <div key={group.name}>
            <div className="bg-muted/50 flex border-b">
              <div className="bg-muted/50 sticky left-0 z-10 w-28 shrink-0 truncate py-1.5 pr-3 text-xs font-semibold">
                {group.name}
              </div>
              <div className="flex-1" />
            </div>

            {group.rows.map((row) => (
              <div key={row.unitId} className="hover:bg-accent/40 flex border-b">
                <div className="bg-popover sticky left-0 z-10 w-28 shrink-0 py-1.5 pr-3">
                  <Link
                    href={`/unidades/${row.unitId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {row.code}
                  </Link>
                </div>

                <div
                  className="relative grid flex-1 items-center py-1.5"
                  style={gridStyle}
                >
                  {/* Rejilla de fondo: fines de semana y día de hoy. */}
                  {days.map((day) => {
                    const weekday = new Date(year, month, day).getDay();
                    const isWeekend = weekday === 0 || weekday === 6;
                    return (
                      <div
                        key={day}
                        className={cn(
                          "h-6 border-r border-dashed border-border/40 last:border-r-0",
                          isWeekend && "bg-muted/40",
                          day === todayDay && "bg-primary/10",
                        )}
                        style={{ gridColumn: `${day} / ${day + 1}`, gridRow: 1 }}
                        aria-hidden
                      />
                    );
                  })}

                  {row.bars.map((bar) => (
                    <div
                      key={bar.id}
                      style={{
                        gridColumn: `${bar.startDay} / ${bar.endDay + 1}`,
                        gridRow: 1,
                      }}
                      className="px-px"
                    >
                      <div
                        title={`${bar.label} — ${bar.detail}`}
                        className={cn(
                          "flex h-6 items-center overflow-hidden rounded-sm px-1.5 text-2xs font-medium",
                          BAR_STYLES[bar.kind],
                          bar.continuesBefore && "rounded-l-none",
                          bar.continuesAfter && "rounded-r-none",
                        )}
                      >
                        <span className="truncate">
                          {bar.continuesBefore ? "‹ " : ""}
                          {bar.label}
                          {bar.continuesAfter ? " ›" : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimelineLegend() {
  const items: { kind: CalendarBarKind; label: string }[] = [
    { kind: "LEASE", label: "Arrendamiento" },
    { kind: "AIRBNB", label: "Airbnb" },
    { kind: "DIRECT", label: "Reserva directa" },
    { kind: "MANUAL", label: "Registro manual" },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <li key={item.kind} className="flex items-center gap-1.5 text-xs">
          <span
            className={cn("size-3 rounded-sm", BAR_STYLES[item.kind])}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
