import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SupportActions } from "@/components/superadmin/support-actions";
import { requireSuperadmin } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import {
  listOrganizationNames,
  searchUsers,
  SUPPORT_ROLES,
  type SupportRole,
} from "@/server/superadmin/queries";

export const metadata: Metadata = { title: "Usuarios" };

type Props = { searchParams: Promise<{ q?: string; rol?: string; org?: string }> };

export default async function SupportUsersPage({ searchParams }: Props) {
  await requireSuperadmin();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const role = SUPPORT_ROLES.find((r) => r === params.rol) as SupportRole | undefined;
  const orgId = params.org || undefined;
  const searching = Boolean(q || role || orgId);

  const [orgs, users] = await Promise.all([
    listOrganizationNames(),
    searching ? searchUsers({ q, role, orgId }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Soporte a cualquier cuenta de las arrendadoras: nuevo acceso, cierre de sesión, desbloqueo y activación. Cada intervención queda en la bitácora de su arrendadora."
      />

      <Card>
        <CardContent>
          <form method="get" className="grid items-end gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
            <Field label="Nombre o correo" htmlFor="q">
              <Input id="q" name="q" defaultValue={q} placeholder="daniela@ejemplo.com" />
            </Field>
            <Field label="Rol" htmlFor="rol">
              <NativeSelect id="rol" name="rol" defaultValue={role ?? ""}>
                <option value="">Todos</option>
                {SUPPORT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Arrendadora" htmlFor="org">
              <NativeSelect id="org" name="org" defaultValue={orgId ?? ""}>
                <option value="">Todas</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit">
              <Search className="size-4" aria-hidden />
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {!searching ? (
        <EmptyState
          icon={UserSearch}
          title="Busca una cuenta"
          description="Escribe un nombre o correo, o filtra por rol o arrendadora, para ver sus cuentas y darles soporte."
        />
      ) : users.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="Sin resultados"
          description="Ninguna cuenta coincide. Revisa el correo o quita algún filtro."
        />
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {user.email ?? "Sin correo"} ·{" "}
                      <Link
                        href={`/superadmin/organizaciones/${user.organization.id}`}
                        className="hover:text-foreground underline-offset-4 hover:underline"
                      >
                        {user.organization.name}
                      </Link>{" "}
                      · alta el {shortDate(user.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={user.active ? "success" : "neutral"}>
                      {ROLE_LABELS[user.role]}
                      {user.active ? "" : " · inactivo"}
                    </StatusBadge>
                    {user.organization.status === "SUSPENDED" ? (
                      <StatusBadge tone="danger">Arrendadora suspendida</StatusBadge>
                    ) : null}
                    {user.lockedUntil ? (
                      <StatusBadge tone="danger">Acceso bloqueado</StatusBadge>
                    ) : null}
                    {user.mustChangePassword ? (
                      <StatusBadge tone="warning">Contraseña temporal</StatusBadge>
                    ) : null}
                    {user.hasSession ? (
                      <StatusBadge tone="info">Sesión abierta</StatusBadge>
                    ) : null}
                    <SupportActions account={user} />
                  </div>
                </li>
              ))}
            </ul>
            {users.length === 25 ? (
              <p className="text-muted-foreground mt-3 text-xs">
                Se muestran las primeras 25 cuentas. Afina la búsqueda para ver otras.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  );
}
