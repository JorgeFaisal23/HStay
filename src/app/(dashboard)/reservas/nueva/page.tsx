import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/bookings/booking-form";
import { requireUser } from "@/lib/auth/session";
import { getBookableUnits } from "@/lib/queries/bookings";

export const metadata: Metadata = { title: "Nueva reserva" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const { unidad } = await searchParams;
  const units = await getBookableUnits(session.organizationId);

  return (
    <>
      <Link
        href="/reservas"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Reservas
      </Link>

      <PageHeader
        title="Nueva reserva"
        description="Estancias de corta duración: noches, semanas o meses. Una unidad puede tener muchas reservas mientras no se empalmen las fechas. Al guardar te llevamos al calendario de ese mes."
      />

      <Card className="max-w-3xl">
        <CardContent>
          <BookingForm units={units} defaultUnitId={unidad} />
        </CardContent>
      </Card>
    </>
  );
}
