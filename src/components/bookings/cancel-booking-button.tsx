"use client";

import { useRouter } from "next/navigation";
import { CalendarX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/shared/form-field";
import { useFormAction } from "@/hooks/use-form-action";
import { cancelBooking } from "@/server/actions/bookings";

/** Cancela la reserva tras confirmar. La reserva no se borra. */
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { onSubmit, pending, error } = useFormAction(cancelBooking, {
    onSuccess: () => {
      toast.success("Reserva cancelada. Las fechas quedan libres.");
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={(event) => {
        if (!window.confirm("¿Cancelar esta reserva? Las fechas quedarán libres en el calendario.")) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="destructive" disabled={pending}>
        <CalendarX className="size-4" aria-hidden />
        {pending ? "Cancelando…" : "Cancelar reserva"}
      </Button>
      <FormError message={error} />
    </form>
  );
}
