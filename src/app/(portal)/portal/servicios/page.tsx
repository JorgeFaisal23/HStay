import type { Metadata } from "next";
import { Check, Receipt, X } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getPortalData } from "@/lib/queries/portal";
import { SERVICE_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Servicios" };

export default async function PortalServicesPage() {
  const { session, db } = await requireOrgUser(["TENANT"]);
  const data = await getPortalData(db, session.sub);

  const services = data.lease?.services ?? [];
  const included = services.filter((s) => s.includedInRent);
  const extra = services.filter((s) => !s.includedInRent);

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Qué está incluido en tu renta y qué se paga aparte.
        </p>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="Sin servicios registrados"
              description="Cuando el administrador registre los servicios de tu vivienda, aquí verás cuáles van incluidos en la renta."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ServiceList
            title="Incluidos en tu renta"
            description="No tienes que pagarlos por separado."
            services={included}
            included
          />
          <ServiceList
            title="Se pagan aparte"
            description="Estos llegan a tu nombre o se te cobran según consumo."
            services={extra}
            included={false}
          />
        </div>
      )}
    </>
  );
}

function ServiceList({
  title,
  description,
  services,
  included,
}: {
  title: string;
  description: string;
  services: {
    type: keyof typeof SERVICE_TYPE_LABELS;
    providerName: string | null;
    contractNumber: string | null;
  }[];
  included: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              included
                ? "bg-success-soft text-success-foreground"
                : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {included ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {included
              ? "Ningún servicio va incluido en tu renta."
              : "Todos tus servicios van incluidos en la renta."}
          </p>
        ) : (
          <ul className="divide-y">
            {services.map((service) => (
              <li key={service.type} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">
                  {SERVICE_TYPE_LABELS[service.type]}
                </p>
                <p className="text-muted-foreground text-xs">
                  {service.providerName ?? "Sin proveedor registrado"}
                  {service.contractNumber
                    ? ` · Contrato ${service.contractNumber}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
