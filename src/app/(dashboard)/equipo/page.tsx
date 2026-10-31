import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { PremiumGate } from "@/components/premium/premium-gate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { initials, shortDate } from "@/lib/format";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, SUPPORT_ACTOR_LABEL } from "@/lib/labels";
import { UserQuotaNote } from "@/components/shared/user-quota-note";
import { userQuota } from "@/server/user-quota";
import { canManageOrganization } from "@/lib/permissions";
import { InviteStaffDialog, StaffRowActions } from "./team-controls";
import type { StaffRole } from "@/server/actions/team";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const isOwner = canManageOrganization(session.role);

  const [staff, logs, quota, buildings] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["OWNER", "ADMIN", "VIEWER", "OPERATIONS", "CAPTURE"] } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        buildingAccess: { select: { building: { select: { id: true, name: true } } } },
      },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        entity: true,
        detail: true,
        createdAt: true,
        user: { select: { name: true, role: true } },
      },
    }),
    userQuota(db),
    db.building.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);


  return (
    <>
      <PageHeader
        title="Equipo"
        description="Quién tiene acceso al panel y qué puede hacer. Los inquilinos entran por su portal y se administran en Inquilinos."
        action={
          isOwner ? (
            <InviteStaffDialog atLimit={quota.full} buildings={buildings} />
          ) : null
        }
      />

      <UserQuotaNote active={quota.active} max={quota.max} />

      <Card>
        <CardHeader>
          <CardTitle>Usuarios con acceso</CardTitle>
          <CardDescription>
            Administrativo: propiedades, servicios, cobros e inquilinos. Consulta:
            solo el resumen y el calendario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {staff.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.id === session.sub ? (
                        <span className="text-muted-foreground font-normal"> (tú)</span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {member.email} · alta el {shortDate(member.createdAt)}
                      {member.role === "CAPTURE"
                        ? ` · ${
                            member.buildingAccess.length === 0
                              ? "sin propiedades asignadas"
                              : member.buildingAccess.map((a) => a.building.name).join(", ")
                          }`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={member.active ? "success" : "neutral"}>
                    {ROLE_LABELS[member.role]}
                    {member.active ? "" : " · desactivado"}
                  </StatusBadge>
                  {isOwner && member.role !== "OWNER" ? (
                    <StaffRowActions
                      member={{
                        id: member.id,
                        name: member.name,
                        // El equipo siempre tiene correo (CHECK en la base).
                        email: member.email ?? "",
                        role: member.role as StaffRole,
                        active: member.active,
                        buildingIds: member.buildingAccess.map((a) => a.building.id),
                      }}
                      buildings={buildings}
                    />
                  ) : (
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                      {ROLE_DESCRIPTIONS[member.role]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <PremiumGate
        title="Bitácora de movimientos"
        description="Quién hizo cada movimiento y cuándo: altas, pagos, capturas y cambios de la plataforma."
      >
        <Card>
          <CardHeader>
            <CardTitle>Bitácora</CardTitle>
            <CardDescription>
              Cada movimiento queda registrado con su autor y su fecha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <ScrollText className="size-4" aria-hidden />
                Todavía no hay movimientos registrados.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{log.action}</p>
                      <p className="text-muted-foreground text-xs">
                        {log.user?.role === "SUPERADMIN"
                          ? `${SUPPORT_ACTOR_LABEL} · ${log.user.name}`
                          : (log.user?.name ?? "Sistema")}
                        {log.detail ? ` · ${log.detail}` : ""}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {shortDate(log.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </PremiumGate>
    </>
  );
}
