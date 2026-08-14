import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Ban, Check, Clock, Pencil, ShieldCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  approveMember,
  getActiveMembers,
  getPendingMembers,
  rejectMember,
  setMemberDisabled,
  updateMember,
  type ActiveMember,
  type PendingMember,
} from "@/lib/settings/members.functions";
import type { MemberRole } from "@/lib/auth/clinic-context.middleware";
import type { UnitSetting } from "@/lib/settings/settings.functions";

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Administrador",
  reception: "Recepção",
  dentist: "Dentista",
  finance: "Financeiro",
};

const PERMISSIONS = [
  { value: "agenda", label: "Agenda" },
  { value: "patients", label: "Pacientes" },
  { value: "finance", label: "Financeiro" },
  { value: "settings", label: "Configurações" },
];

type AccessValues = { role: MemberRole; unitId: string | null; permissions: string[] };

const pendingQuery = (fetcher: () => Promise<PendingMember[]>) =>
  queryOptions({ queryKey: ["settings", "members", "pending"], queryFn: fetcher, staleTime: 10_000 });
const activeQuery = (fetcher: () => Promise<ActiveMember[]>) =>
  queryOptions({ queryKey: ["settings", "members", "active"], queryFn: fetcher, staleTime: 10_000 });

export function MembersApprovalSection({ units }: { units: UnitSetting[] }) {
  const queryClient = useQueryClient();
  const fetchPending = useServerFn(getPendingMembers);
  const fetchActive = useServerFn(getActiveMembers);
  const pending = useQuery(pendingQuery(fetchPending));
  const active = useQuery(activeQuery(fetchActive));

  const approveFn = useServerFn(approveMember);
  const updateFn = useServerFn(updateMember);
  const rejectFn = useServerFn(rejectMember);
  const disableFn = useServerFn(setMemberDisabled);

  const [approving, setApproving] = useState<PendingMember | null>(null);
  const [editing, setEditing] = useState<ActiveMember | null>(null);
  const [rejecting, setRejecting] = useState<PendingMember | null>(null);
  const [disabling, setDisabling] = useState<ActiveMember | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings", "members"] });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cadastro recusado");
      setRejecting(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disableMutation = useMutation({
    mutationFn: (item: ActiveMember) => disableFn({ data: { id: item.id, disabled: item.status === "active" } }),
    onSuccess: () => {
      toast.success("Situação atualizada");
      setDisabling(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (values: AccessValues) => {
      if (!approving) throw new Error("Nenhum cadastro selecionado.");
      return approveFn({ data: { id: approving.id, ...values } });
    },
    onSuccess: () => {
      toast.success("Acesso aprovado");
      setApproving(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (values: AccessValues) => {
      if (!editing) throw new Error("Nenhum usuário selecionado.");
      return updateFn({ data: { id: editing.id, ...values } });
    },
    onSuccess: () => {
      toast.success("Acesso atualizado");
      setEditing(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-coral" />
          <h3 className="text-sm font-semibold">Pendentes de aprovação</h3>
          {!!pending.data?.length && (
            <span className="rounded-full bg-coral-soft px-2 py-0.5 text-3xs font-semibold text-coral">
              {pending.data.length}
            </span>
          )}
        </div>
        <div className="surface-card mt-3 divide-y divide-border overflow-hidden">
          {(pending.data ?? []).map((member) => (
            <div key={member.id} className="flex min-h-[80px] items-center gap-3 px-4 py-4 sm:px-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-coral-soft text-sm font-bold text-coral">
                {initials(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{member.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{member.email}</p>
                {member.phone && <p className="truncate text-2xs text-muted-foreground/80">{member.phone}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRejecting(member)}>
                  <X className="h-3.5 w-3.5" />
                  Recusar
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-gradient-primary text-white"
                  onClick={() => setApproving(member)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Aprovar
                </Button>
              </div>
            </div>
          ))}
          {pending.isSuccess && !pending.data.length && (
            <div className="grid min-h-40 place-items-center px-6 py-8 text-center">
              <div>
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm text-muted-foreground">Nenhum cadastro esperando aprovação.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold">Equipe</h3>
        <div className="surface-card mt-3 divide-y divide-border overflow-hidden">
          {(active.data ?? []).map((member) => (
            <div key={member.id} className="flex min-h-[80px] items-center gap-3 px-4 py-4 sm:px-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-muted text-sm font-bold text-foreground">
                {initials(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-3xs font-semibold",
                      member.status === "active" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {member.status === "active" ? "Ativo" : "Desativado"}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[member.role]} · {unitName(units, member.unitId)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label={`Editar ${member.name}`} onClick={() => setEditing(member)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={member.status === "active" ? `Desativar ${member.name}` : `Reativar ${member.name}`}
                  onClick={() => setDisabling(member)}
                >
                  {member.status === "active" ? <Ban className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))}
          {active.isSuccess && !active.data.length && (
            <div className="grid min-h-40 place-items-center px-6 py-8 text-center text-sm text-muted-foreground">
              Nenhum outro usuário na equipe ainda.
            </div>
          )}
        </div>
      </section>

      <MemberAccessSheet
        open={!!approving}
        title="Aprovar cadastro"
        description={approving ? `${approving.name} · ${approving.email}` : ""}
        units={units}
        initialRole="reception"
        initialUnitId={units.find((u) => u.isDefault)?.id ?? units[0]?.id ?? null}
        initialPermissions={["agenda", "patients"]}
        onOpenChange={(open) => !open && setApproving(null)}
        onConfirm={(values) => approveMutation.mutateAsync(values)}
        pending={approveMutation.isPending}
        confirmLabel="Aprovar acesso"
      />

      <MemberAccessSheet
        open={!!editing}
        title="Editar acesso"
        description={editing ? `${editing.name} · ${editing.email}` : ""}
        units={units}
        initialRole={editing?.role ?? "reception"}
        initialUnitId={editing?.unitId ?? null}
        initialPermissions={editing?.permissions ?? []}
        onOpenChange={(open) => !open && setEditing(null)}
        onConfirm={(values) => updateMutation.mutateAsync(values)}
        pending={updateMutation.isPending}
        confirmLabel="Salvar"
      />

      <AlertDialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar este cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejecting?.name} não vai conseguir acessar o sistema. A pessoa pode tentar se cadastrar de novo mais
              tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => rejecting && rejectMutation.mutate(rejecting.id)}
            >
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!disabling} onOpenChange={(open) => !open && setDisabling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {disabling?.status === "active" ? "Desativar este acesso?" : "Reativar este acesso?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {disabling?.status === "active"
                ? `${disabling?.name} perde o acesso ao sistema imediatamente. Dá para reativar depois.`
                : `${disabling?.name} volta a acessar o sistema com o papel e a unidade de antes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => disabling && disableMutation.mutate(disabling)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberAccessSheet({
  open,
  title,
  description,
  units,
  initialRole,
  initialUnitId,
  initialPermissions,
  onOpenChange,
  onConfirm,
  pending,
  confirmLabel,
}: {
  open: boolean;
  title: string;
  description: string;
  units: UnitSetting[];
  initialRole: MemberRole;
  initialUnitId: string | null;
  initialPermissions: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: AccessValues) => Promise<unknown>;
  pending: boolean;
  confirmLabel: string;
}) {
  const [role, setRole] = useState<MemberRole>(initialRole);
  const [unitId, setUnitId] = useState<string | null>(initialUnitId);
  const [permissions, setPermissions] = useState<string[]>(initialPermissions);

  // Só resincroniza ao abrir — trocar de pessoa com o sheet fechado não deve
  // fazer o formulário "vazar" o estado da edição anterior enquanto abre.
  useEffect(() => {
    if (!open) return;
    setRole(initialRole);
    setUnitId(initialUnitId);
    setPermissions(initialPermissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (role !== "admin" && !unitId) {
      toast.error("Selecione a unidade.");
      return;
    }
    try {
      // Admin enxerga a clínica toda — não faz sentido prender ele numa
      // unidade só, então unidade fica sempre nula para esse papel.
      await onConfirm({ role, unitId: role === "admin" ? null : unitId, permissions });
    } catch {
      // Erro já vira toast na mutation de origem.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/60 to-coral-soft/40 px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(value) => setRole(value as MemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="reception">Recepção</SelectItem>
                <SelectItem value="dentist">Dentista</SelectItem>
                <SelectItem value="finance">Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role !== "admin" && (
            <div className="space-y-2">
              <Label>Unidade *</Label>
              <Select value={unitId ?? undefined} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <Label>Áreas permitidas</Label>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {PERMISSIONS.map((permission) => {
                const selected = permissions.includes(permission.value);
                return (
                  <label
                    key={permission.value}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-white p-3 text-sm"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        setPermissions((current) =>
                          checked ? [...current, permission.value] : current.filter((v) => v !== permission.value),
                        )
                      }
                    />
                    {permission.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-gradient-primary text-white" disabled={pending}>
              {pending ? "Salvando..." : confirmLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function unitName(units: UnitSetting[], unitId: string | null) {
  if (!unitId) return "Todas as unidades";
  return units.find((u) => u.id === unitId)?.name ?? "Unidade removida";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
