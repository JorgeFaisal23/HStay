import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/shared/button-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/bookings/booking-form";
import { CancelBookingButton } from "@/components/bookings/cancel-booking-button";
import { requireUser } from "@/lib/auth/session";
import { getBookableUnits, getBooking } from "@/lib/queries/bookings";
import { longDate, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Reserva" };

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const [booking, units] = await Promise.all([
    getBooking(id, session.organizationId),
    getBookableUnits(session.organizationId),
  ]);
  if (!booking) notFound();

  const cancelled = booking.status === "CANCELLED";

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
        title={booking.guestName}
        description={`${booking.buildingName} · Unidad ${booking.unitCode} · ${shortDate(booking.checkIn)} → ${shortDate(booking.checkOut)}`}
        action={
          <ButtonLink
            href={`/calendario?mes=${booking.checkIn.slice(0, 7)}&edificio=${booking.buildingId}`}
            variant="outline"
          >
            <CalendarRange className="size-4" aria-hidden />
            Ver en calendario
          </ButtonLink>
        }
      />

      {cancelled ? (
        <div className="flex max-w-3xl flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Badge variant="destructive">Cancelada</Badge>
          <span className="text-muted-foreground">
            Esta reserva ya no ocupa la unidad. Registrada el {longDate(booking.createdAt)}.
          </span>
        </div>
      ) : null}

      <Card className="max-w-3xl">
        <CardContent>
          <BookingForm units={units} booking={booking} />
        </CardContent>
      </Card>

      {!cancelled ? (
        <div className="max-w-3xl">
          <CancelBookingButton bookingId={booking.id} />
        </div>
      ) : null}
    </>
  );
}
