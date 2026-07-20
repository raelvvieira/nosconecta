import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Armchair,
  Bell,
  BriefcaseMedical,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { SettingsFormSheet } from "@/components/settings/SettingsFormSheet";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import {
  deleteSetting,
  getSettings,
  saveSetting,
  type ChairSetting,
  type MemberRole,
  type MemberSetting,
  type ProcedureSetting,
  type ProfessionalSetting,
  type SettingsData,
  type SettingsRecord,
  type SettingsSection,
} from "@/lib/settings/settings.functions";

const searchSchema = z.object({
  section: z.enum(["professionals", "chairs", "procedures", "members"]).default("professionals"),
});
type SettingsFetcher = () => Promise<SettingsData>;
const settingsQuery = (fetcher: SettingsFetcher) =>
  queryOptions({ queryKey: ["settings"], queryFn: () => fetcher(), staleTime: 15_000 });

export const Route = createFileRoute("/configuracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurações · NÓS Conecta" },
      { name: "description", content: "Cadastros que mantêm a operação da clínica conectada." },
    ],
  }),
  validateSearch: searchSchema,
  // No SSR loader: getSettings requires auth which isn't available during prerender.
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar as configurações"
      description="Houve uma falha ao buscar os dados da clínica. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      title="Configuração não encontrada"
      description="A área de configurações que você tentou acessar não está disponível."
      notFound
    />
  ),
  component: SettingsPage,
});

const SECTIONS = [
  {
    value: "professionals",
    label: "Profissionais",
    description: "Equipe clínica e comissões",
    icon: Stethoscope,
  },
  { value: "chairs", label: "Cadeiras", description: "Consultórios e recursos", icon: Armchair },
  {
    value: "procedures",
    label: "Procedimentos",
    description: "Duração, preço e custo",
    icon: BriefcaseMedical,
  },
  {
    value: "members",
    label: "Usuários e permissões",
    description: "Acessos da equipe",
    icon: ShieldCheck,
  },
] as const;

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Administrador",
  reception: "Recepção",
  dentist: "Dentista",
  finance: "Financeiro",
};

function SettingsPage() {
  const { section } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(saveSetting);
  const remove = useServerFn(deleteSetting);
  const settingsResult = useQuery(settingsQuery(fetchSettings as unknown as SettingsFetcher));
  const data: SettingsData =
    settingsResult.data ?? { professionals: [], chairs: [], procedures: [], members: [] };
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SettingsRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SettingsRecord | null>(null);

  const items = (data as unknown as Record<string, SettingsRecord[]>)[section] ?? [];
  const filtered = useMemo(
    () => items.filter((item: SettingsRecord) => searchable(item).includes(query.toLocaleLowerCase("pt-BR"))),
    [items, query],
  );
  const activeCount = items.filter((item: SettingsRecord) => item.active).length;
  const current = SECTIONS.find((item) => item.value === section)!;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings"] });
  const toggle = useMutation({
    mutationFn: (item: SettingsRecord) =>
      save({ data: { section, item: { ...item, active: !item.active } } }),
    onSuccess: () => {
      toast.success("Situação atualizada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deletion = useMutation({
    mutationFn: (item: SettingsRecord) => remove({ data: { section, id: item.id } }),
    onSuccess: () => {
      toast.success("Cadastro excluído");
      setPendingDelete(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const selectSection = (value: SettingsSection) => {
    setQuery("");
    router.navigate({ to: "/configuracoes", search: { section: value } });
  };

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="pr-16 lg:flex lg:items-end lg:justify-between lg:pr-0">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
              <Settings2 className="h-4 w-4" />
              Base operacional
            </div>
            <h1 className="text-[30px] font-semibold tracking-[-0.035em] lg:text-4xl">
              Configurações
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Cadastros que mantêm agenda, atendimento e financeiro conectados.
            </p>
          </div>
          <Button
            className="mt-5 hidden gap-2 bg-gradient-primary text-white lg:flex"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            Adicionar {singular(section)}
          </Button>
        </header>

        <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {SECTIONS.map((item) => {
            const count = data[item.value].length;
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => selectSection(item.value)}
                className={cn(
                  "group rounded-[22px] border p-4 text-left transition-all sm:p-5",
                  section === item.value
                    ? "border-pink/30 bg-white shadow-soft"
                    : "border-border bg-white/65 hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-2xl transition-colors",
                    section === item.value
                      ? "bg-gradient-primary text-white"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-4 block text-sm font-semibold sm:text-base">{item.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {count} cadastrados
                </span>
              </button>
            );
          })}
          <Link
            to="/configuracoes/notificacoes"
            className="group rounded-[22px] border border-border bg-white/65 p-4 text-left transition-all hover:bg-white sm:p-5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <span className="mt-4 block text-sm font-semibold sm:text-base">Notificações</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              E-mail, SMS e WhatsApp
            </span>
          </Link>
        </section>

        <div className="mt-7 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="surface-card hidden h-fit overflow-hidden p-2 lg:block">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectSection(item.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left",
                    section === item.value
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        section === item.value ? "text-white/65" : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{current.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeCount} ativos de {items.length} cadastrados
                </p>
              </div>
              <Button
                className="gap-2 bg-gradient-primary text-white lg:hidden"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 rounded-[18px] bg-white pl-11 shadow-soft"
                placeholder={`Buscar ${current.label.toLocaleLowerCase("pt-BR")}`}
              />
            </div>

            <div className="surface-card mt-4 divide-y divide-border overflow-hidden">
              {filtered.map((item: SettingsRecord, index: number) => (
                <SettingsRow
                  key={item.id}
                  section={section}
                  item={item}
                  index={index}
                  onEdit={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  onToggle={() => toggle.mutate(item)}
                  onDelete={() => setPendingDelete(item)}
                />
              ))}
              {!filtered.length && (
                <div className="grid min-h-52 place-items-center px-6 text-center">
                  <div>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                      <Search className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">Nenhum cadastro encontrado</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ajuste a busca ou adicione um novo item.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <SettingsFormSheet
        open={formOpen}
        section={section}
        item={editing}
        onOpenChange={setFormOpen}
        onSaved={refresh}
      />
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove o item das próximas seleções. Registros históricos continuam
              preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => pendingDelete && deletion.mutate(pendingDelete)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsRow({
  section,
  item,
  index,
  onEdit,
  onToggle,
  onDelete,
}: {
  section: SettingsSection;
  item: SettingsRecord;
  index: number;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const subtitle = rowSubtitle(section, item);
  const detail = rowDetail(section, item);
  const color =
    "color" in item ? item.color : ["#FF6B57", "#8B5CF6", "#0EA5E9", "#F59E0B"][index % 4];
  return (
    <div className="flex min-h-[92px] items-center gap-3 px-4 py-4 sm:px-5">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {initials(item.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold sm:text-[15px]">{item.name}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              item.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {item.active ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        {detail && <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{detail}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações de ${item.name}`}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={onToggle}>
            {item.active ? "Desativar" : "Ativar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger focus:text-danger" onClick={onDelete}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function rowSubtitle(section: SettingsSection, item: SettingsRecord) {
  if (section === "professionals") {
    const row = item as ProfessionalSetting;
    return `${row.specialty || "Odontologia"}${row.registrationNumber ? ` · ${row.registrationNumber}` : ""}`;
  }
  if (section === "chairs") {
    const row = item as ChairSetting;
    return row.roomName || "Sala não informada";
  }
  if (section === "procedures") {
    const row = item as ProcedureSetting;
    return `${row.category || "Sem categoria"} · ${row.durationMinutes} min`;
  }
  const row = item as MemberSetting;
  return `${ROLE_LABEL[row.role]} · ${row.email}`;
}

function rowDetail(section: SettingsSection, item: SettingsRecord) {
  if (section === "professionals")
    return `${(item as ProfessionalSetting).commissionPct}% de comissão`;
  if (section === "chairs") return (item as ChairSetting).notes;
  if (section === "procedures") {
    const row = item as ProcedureSetting;
    return `${formatBRL(row.price)} · custo ${formatBRL(row.cost)}`;
  }
  return `${(item as MemberSetting).permissions.length} áreas permitidas`;
}

const singular = (section: SettingsSection) =>
  ({
    professionals: "profissional",
    chairs: "cadeira",
    procedures: "procedimento",
    members: "usuário",
  })[section];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const searchable = (item: SettingsRecord) =>
  Object.values(item).flat().join(" ").toLocaleLowerCase("pt-BR");
