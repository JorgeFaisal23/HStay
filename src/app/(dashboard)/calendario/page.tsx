import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarPlus, CalendarRange, List, LogIn, LogOut } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { canEdit } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getCalendarData } from "@/lib/queries/calendar";
import { periodKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarToolbar } from "./calendar-toolbar";
import { Timeline, TimelineLegend } from "./timeline";

export const metadata: Metadata = { title: "Calendario" };

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; edificio?: string; q?: string }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN", "VIEWER"]);
  const { mes, edificio, q } = await searchParams;
  const editable = canEdit(session.role);
  const search = q?.trim().slice(0, 100) || undefined;

  const period = mes && PERIOD_PATTERN.test(mes) ? mes : periodKey(new Date());
  const data = await getCalendarData(
    period,
    edificio || undefined,
    session.organizationId,
    search,
  );

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Arrendamientos de largo plazo y reservas de corta estancia sobre el mismo eje de tiempo."
        action={
          editable ? (
            <>
              <ButtonLink href="/reservas" variant="outline">
                <List className="size-4" aria-hidden />
                Lista de reservas
              </ButtonLink>
              <ButtonLink href="/reservas/nueva">
                <CalendarPlus className="size-4" aria-hidden />
                Nueva reserva
              </ButtonLink>
            </>
          ) : null
        }
      />

      <Suspense fallback={<Skeleton className="h-9 w-full max-w-3xl" />}>
        <CalendarToolbar
          period={period}
          buildings={data.buildings}
          buildingId={edificio}
          search={search}
        />
      </Suspense>

      <Tabs defaultValue="ocupacion">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="ocupacion">Ocupación</TabsTrigger>
            <TabsTrigger value="mes">Vista de mes</TabsTrigger>
          </TabsList>
          <TimelineLegend />
        </div>

        {/* ------------------------------------------------- línea de tiempo */}
        <TabsContent value="ocupacion" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Ocupación por unidad</CardTitle>
              <CardDescription>
                {search
                  ? `${data.counts.shown} de ${data.counts.units} unidades coinciden con “${search}”`
                  : `${data.counts.units} ${data.counts.units === 1 ? "unidad" : "unidades"}`}{" "}
                · {data.counts.leases} contratos vigentes · {data.counts.bookings}{" "}
                reservas en el mes.
                {editable ? " Haz clic en una barra para ver o editar." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <EmptyState
                  icon={CalendarRange}
                  title={search ? "Sin coincidencias este mes" : "No hay unidades que mostrar"}
                  description={
                    search
                      ? "Nadie con ese nombre o unidad ocupa este mes. Para buscar en cualquier fecha usa la lista de reservas."
                      : "Registra propiedades y unidades para ver aquí su ocupación."
                  }
                  actions={
                    search && editable ? (
                      <ButtonLink href={`/reservas?q=${encodeURIComponent(search)}&estado=ALL&desde=2000-01-01`} size="sm">
                        Buscar en todas las fechas
                      </ButtonLink>
                    ) : undefined
                  }
                />
              ) : (
                <Timeline
                  rows={data.rows}
                  year={data.year}
                  month={data.month}
                  totalDays={data.totalDays}
                  linkable={editable}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------------------------- vista de mes */}
        <TabsContent value="mes" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Entradas y salidas</CardTitle>
              <CardDescription>
                Llegadas y salidas de las estancias cortas, día por día.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthGrid
                year={data.year}
                month={data.month}
                totalDays={data.totalDays}
                events={data.events}
                linkable={editable}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function MonthGrid({
  year,
  month,
  totalDays,
  events,
  linkable,
}: {
  year: number;
  month: number;
  totalDays: number;
  events: {
    id: string;
    type: "checkin" | "checkout";
    date: Date;
    label: string;
    unitCode: string;
    href: string;
  }[];
  linkable: boolean;
}) {
  // La semana empieza en lunes: getDay() devuelve 0 para domingo.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const byDay = new Map<number, typeof events>();
  for (const event of events) {
    const day = event.date.getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  const today = new Date();
  const todayDay =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : null;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-2xl">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-muted-foreground py-1 text-center text-xs font-medium"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="min-h-24" />;
            }
            const dayEvents = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className={cn(
                  "min-h-24 rounded-md border p-1.5",
                  day === todayDay && "border-primary bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    day === todayDay
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  {day}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <li
                      key={event.id}
                      title={`${event.type === "checkin" ? "Llegada" : "Salida"}: ${event.label} · Unidad ${event.unitCode}`}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]",
                        event.type === "checkin"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                      )}
                    >
                      {event.type === "checkin" ? (
                        <LogIn className="size-2.5 shrink-0" aria-hidden />
                      ) : (
                        <LogOut className="size-2.5 shrink-0" aria-hidden />
                      )}
                      {linkable ? (
                        <Link href={event.href} className="truncate hover:underline">
                          {event.unitCode} · {event.label.split(" ")[0]}
                        </Link>
                      ) : (
                        <span className="truncate">
                          {event.unitCode} · {event.label.split(" ")[0]}
                        </span>
                      )}
                    </li>
                  ))}
                  {dayEvents.length > 3 ? (
                    <li className="text-muted-foreground px-1 text-[10px]">
                      +{dayEvents.length - 3} más
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
