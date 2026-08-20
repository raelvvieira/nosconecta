import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MoreHorizontal, Plus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { MembersApprovalSection } from "@/components/settings/MembersApprovalSection";
import { SettingsFormSheet } from "@/components/settings/SettingsFormSheet";
import { settingsQuery } from "@/components/settings/SettingsNav";
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
  type ProcedureSetting,
  type ProfessionalSetting,
  type SettingsData,
  type SettingsRecord,
  type SettingsSection,
  type UnitSetting,
} from "@/lib/settings/settings.functions";

// "members" navega pela mesma URL de sempre (?section=members), mas não é
// um SettingsSection de verdade — não tem CRUD genérico, é a tela de
// aprovação (ver branch no componente abaixo).
const searchSchema = z.object({
  section: z.enum(["professionals", "chairs", "procedures", "units", "members"]).default("professionals"),
});
type PageSection = SettingsSection | "members";
type SettingsFetcher = () => Promise<SettingsData>;

export const Route = createFileRoute("/configuracoes/")({
  ssr: false,
  validateSearch: searchSchema,
  // No SSR loader: getSettings requires auth which isn't available during prerender.
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar os cadastros"
      description="Houve uma falha ao buscar os dados da clínica. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: SettingsRegistryPage,
});

const SECTION_LABEL: Record<PageSection, string> = {
  professionals: "Profissionais",
  chairs: "Cadeiras",
  procedures: "Procedimentos",
  units: "Unidades",
  members: "Usuários e permissões",
};

function SettingsRegistryPage() {
  const { section } = Route.useSearch();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(saveSetting);
  const remove = useServerFn(deleteSetting);
  const settingsResult = useQuery(settingsQuery(fetchSettings as unknown as SettingsFetcher));
  const data: SettingsData =
    settingsResult.data ?? { professionals: [], chairs: [], procedures: [], units: [], isAdmin: false };
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SettingsRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SettingsRecord | null>(null);

  // As seções genéricas (professionals/chairs/procedures/units) são as únicas
  // que passam por essa lista/CRUD; "members" tem sua própria tela mais
  // abaixo. Os hooks abaixo têm que rodar sempre, na mesma ordem, então o
  // desvio para "members"/acesso negado só acontece no retorno JSX no fim.
  const isGenericSection = section !== "members";
  const items = isGenericSection ? ((data as unknown as Record<string, SettingsRecord[]>)[section] ?? []) : [];
  const filtered = useMemo(
    () => items.filter((item: SettingsRecord) => searchable(item).includes(query.toLocaleLowerCase("pt-BR"))),
    [items, query],
  );
  const activeCount = items.filter((item: SettingsRecord) => item.active).length;
  const label = SECTION_LABEL[section];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings"] });
  const toggle = useMutation({
    mutationFn: (item: SettingsRecord) =>
      save({ data: { section: section as SettingsSection, item: { ...item, active: !item.active } } }),
    onSuccess: () => {
      toast.success("Situação atualizada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deletion = useMutation({
    mutationFn: (item: SettingsRecord) => remove({ data: { section: section as SettingsSection, id: item.id } }),
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

  // Trocar de seção zera a busca. Agora a navegação é por <Link>, então o
  // componente não desmonta entre seções — sem isso, um termo digitado em
  // Profissionais continuaria filtrando (e escondendo) a lista de Cadeiras.
  useEffect(() => setQuery(""), [section]);

  const restrictedSection = section === "members" || section === "units";
  if (restrictedSection && settingsResult.isSuccess && !data.isAdmin) {
    return (
      <div className="surface-card grid min-h-72 place-items-center px-6 py-10 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-semibold">Apenas administradores acessam esta área</h3>
        </div>
      </div>
    );
  }

  if (section === "members") {
    return <MembersApprovalSection units={data.units} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} ativos de {items.length} cadastrados
          </p>
        </div>
        <Button className="gap-2 bg-gradient-primary text-white" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Adicionar {singular(section as SettingsSection)}
        </Button>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 rounded-xl bg-white pl-11 shadow-soft"
          placeholder={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
        />
      </div>

      <div className="surface-card mt-4 divide-y divide-border overflow-hidden">
        {filtered.map((item: SettingsRecord, index: number) => (
          <SettingsRow
            key={item.id}
            section={section as SettingsSection}
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
          <div className="grid min-h-72 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                <Search className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">
                {query ? "Nenhum cadastro encontrado" : `Nenhum ${singular(section as SettingsSection)} cadastrado`}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {query
                  ? "Ajuste a busca para encontrar o que procura."
                  : "Cadastre o primeiro para começar a usar esta área."}
              </p>
              {/* Ação à mão no estado vazio: antes a tela só dizia "nenhum
                  cadastro encontrado" e o botão de adicionar ficava longe. */}
              {!query && (
                <Button className="mt-5 gap-2 bg-gradient-primary text-white" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Adicionar {singular(section as SettingsSection)}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <SettingsFormSheet
        open={formOpen}
        section={section as SettingsSection}
        item={editing}
        units={data.units}
        isAdmin={data.isAdmin}
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
    </>
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
    "color" in item ? item.color : ["#FF7A59", "#8B5CF6", "#0EA5E9", "#F59E0B"][index % 4];
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
          <p className="truncate text-sm font-semibold sm:text-sm">{item.name}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-3xs font-semibold",
              item.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {item.active ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        {detail && <p className="mt-1 truncate text-2xs text-muted-foreground/80">{detail}</p>}
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
  if (section === "units") {
    const row = item as UnitSetting;
    return row.address || "Endereço não informado";
  }
  const row = item as ProcedureSetting;
  return `${row.category || "Sem categoria"} · ${row.durationMinutes} min`;
}

function rowDetail(section: SettingsSection, item: SettingsRecord) {
  if (section === "professionals")
    return `${(item as ProfessionalSetting).commissionPct}% de comissão`;
  if (section === "chairs") return (item as ChairSetting).notes;
  if (section === "units") return (item as UnitSetting).isDefault ? "Unidade principal" : "";
  const row = item as ProcedureSetting;
  return `${formatBRL(row.price)} · custo ${formatBRL(row.cost)}`;
}

const singular = (section: SettingsSection) =>
  ({
    professionals: "profissional",
    chairs: "cadeira",
    procedures: "procedimento",
    units: "unidade",
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
