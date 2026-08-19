import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Settings2, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import { DealDetailSheet } from "@/components/atendimentos/pipeline/DealDetailSheet";
import { PipelineCard, type CardExtras } from "@/components/atendimentos/pipeline/PipelineCard";
import { useCardDrag } from "@/components/atendimentos/pipeline/useCardDrag";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { getConversations } from "@/lib/atendimentos/atendimentos.functions";
import { getSalesAssistant } from "@/lib/atendimentos/insights.functions";
import { getDeals, type Deal } from "@/lib/atendimentos/deals.functions";
import {
  createPipeline,
  deletePipelineStage,
  getPipelineItems,
  getPipelineStages,
  movePipelineItem,
  reorderPipelineStages,
  savePipelineStage,
  type PipelineItem,
  type PipelineStage,
} from "@/lib/atendimentos/pipeline.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/pipeline")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Pipeline · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Funil de atendimento — etapas, negociações e valores." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar o pipeline"
      description="Houve uma falha ao buscar as etapas. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: PipelinePage,
});

const STAGE_COLORS = ["#FF7A59", "#8B5CF6", "#0EA5E9", "#F59E0B", "#22C55E", "#EC4899"];
type StatusFilter = "open" | "all" | "won" | "lost";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Em aberto" },
  { value: "all", label: "Todas" },
  { value: "won", label: "Ganhas" },
  { value: "lost", label: "Perdidas" },
];

function PipelinePage() {
  const queryClient = useQueryClient();
  const fetchStages = useServerFn(getPipelineStages);
  const fetchItems = useServerFn(getPipelineItems);
  const fetchDeals = useServerFn(getDeals);
  const fetchConversations = useServerFn(getConversations);
  const fetchAssistant = useServerFn(getSalesAssistant);
  const doCreatePipeline = useServerFn(createPipeline);
  const doMove = useServerFn(movePipelineItem);
  const doSaveStage = useServerFn(savePipelineStage);
  const doDeleteStage = useServerFn(deletePipelineStage);
  const doReorder = useServerFn(reorderPipelineStages);

  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchStages(),
    staleTime: 10_000,
  });
  const configured = stagesQuery.data?.configured ?? false;
  const stages = useMemo(
    () => [...(stagesQuery.data?.stages ?? [])].sort((a, b) => a.position - b.position),
    [stagesQuery.data],
  );

  const itemsQuery = useQuery({
    queryKey: ["pipeline-items"],
    queryFn: () => fetchItems(),
    staleTime: 8_000,
    refetchInterval: 20_000,
  });
  const items = itemsQuery.data?.items ?? [];

  const dealsQuery = useQuery({
    queryKey: ["pipeline-deals"],
    queryFn: () => fetchDeals(),
    staleTime: 10_000,
  });
  const dealByItem = useMemo(() => {
    const map = new Map<string, Deal>();
    for (const deal of dealsQuery.data ?? []) map.set(deal.itemId, deal);
    return map;
  }, [dealsQuery.data]);

  // Telefone e não-lidas já existem na lista de conversas; é só cruzar.
  // Nenhum endpoint novo do CRM envolvido.
  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    staleTime: 15_000,
  });
  const conversations = conversationsQuery.data ?? [];

  // "Parado há N dias" já era calculado pelo CRM e só aparecia no dashboard.
  const assistantQuery = useQuery({
    queryKey: ["sales-assistant"],
    queryFn: () => fetchAssistant(),
    staleTime: 5 * 60_000,
  });
  const stuckByConversation = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of assistantQuery.data?.travadas ?? []) map.set(row.conversaId, row.paradaHaDias);
    return map;
  }, [assistantQuery.data]);

  const extrasFor = (item: PipelineItem): CardExtras => {
    const conversation =
      item.type === "conversation"
        ? conversations.find((c) => c.id === item.itemId)
        : conversations.find((c) => c.contactId === item.itemId);
    return {
      phone: conversation?.phone ?? null,
      unreadCount: conversation?.unreadCount ?? 0,
      stuckDays: conversation ? (stuckByConversation.get(conversation.id) ?? null) : null,
    };
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
  };
  const refreshDeals = () => queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });

  const [pipelineNameInput, setPipelineNameInput] = useState("Atendimento");
  const setupMutation = useMutation({
    mutationFn: () => doCreatePipeline({ data: { name: pipelineNameInput.trim() } }),
    onSuccess: () => {
      toast.success("Pipeline criado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveMutation = useMutation({
    mutationFn: (vars: { itemId: string; newStageId: string; notes?: string }) =>
      doMove({ data: vars }),
    // Move o card na hora e desfaz se a chamada falhar. Antes só invalidava a
    // query, então o card ficava parado na coluna antiga até o refetch — com
    // arraste isso fica insuportável, o card "voltaria" por um instante.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline-items"] });
      const previous = queryClient.getQueryData(["pipeline-items"]);
      queryClient.setQueryData(["pipeline-items"], (old: any) =>
        old
          ? {
              ...old,
              items: (old.items ?? []).map((i: PipelineItem) =>
                i.id === vars.itemId ? { ...i, stageId: vars.newStageId } : i,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["pipeline-items"], context.previous);
      toast.error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["pipeline-items"] }),
  });

  const { drag, overStageId, registerColumn, ghostRef, handlers } = useCardDrag((itemId, toStageId) =>
    moveMutation.mutate({ itemId, newStageId: toStageId }),
  );

  const [configOpen, setConfigOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const status = dealByItem.get(item.id)?.status ?? "negotiating";
      if (statusFilter === "open" && status !== "negotiating") return false;
      if (statusFilter === "won" && status !== "won") return false;
      if (statusFilter === "lost" && status !== "lost") return false;
      if (!term) return true;
      const extras = extrasFor(item);
      return `${item.title ?? ""} ${extras.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(term);
    });
    // extrasFor depende de conversations; recalcular quando qualquer fonte mudar
  }, [items, dealByItem, statusFilter, query, conversations, stuckByConversation]);

  const openItem = items.find((i) => i.id === openItemId) ?? null;
  const openStage = openItem ? (stages.find((s) => s.id === openItem.stageId) ?? null) : null;
  const openConversation = openItem
    ? (openItem.type === "conversation"
        ? conversations.find((c) => c.id === openItem.itemId)
        : conversations.find((c) => c.contactId === openItem.itemId))
    : undefined;

  if (stagesQuery.isLoading) {
    return <main className="flex flex-1 items-center justify-center lg:h-full" />;
  }

  // Distinto do estado "sem etapas cadastradas" — antes um erro transitório
  // (ex.: corrida de relogin no CRM) caía silenciosamente nesse mesmo
  // estado vazio, fazendo parecer que etapas criadas tinham sumido.
  if (stagesQuery.isError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center lg:h-full">
        <p className="text-sm text-muted-foreground">Não foi possível carregar as etapas do pipeline.</p>
        <Button variant="outline" onClick={() => stagesQuery.refetch()}>
          Tentar de novo
        </Button>
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col pb-nav lg:h-full lg:overflow-hidden lg:pb-0">
        <header className="flex w-full flex-wrap items-center justify-between gap-3 px-4 pb-4 pt-6 sm:px-6 lg:px-10 lg:pt-7">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Workflow className="h-5 w-5 text-pink" />
            Pipeline
          </h1>
          <div className="flex items-center gap-2.5">
            <WhatsappStatusBadge />
            {configured && (
              <Button variant="outline" className="gap-2" onClick={() => setConfigOpen(true)}>
                <Settings2 className="h-4 w-4" />
                Configurar etapas
              </Button>
            )}
          </div>
        </header>

        {configured && stages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6 lg:px-10">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="h-10 rounded-[16px] bg-white pl-10"
              />
            </div>
            {/* Sem isso, ganhos e perdidos entopem o board com o tempo. */}
            <div className="flex items-center gap-1 rounded-full border border-border bg-white p-1">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === filter.value
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!configured ? (
          <div className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6 lg:px-10">
            <section className="surface-card w-full max-w-[440px] px-6 py-8 text-center sm:px-10 sm:py-10">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-coral-soft text-coral">
                <Workflow className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-xl font-semibold">Criar o pipeline</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Esta clínica ainda não tem um funil no CRM. Dê um nome e crie — depois dá pra
                adicionar, renomear e reordenar as etapas livremente.
              </p>
              <Input
                value={pipelineNameInput}
                onChange={(e) => setPipelineNameInput(e.target.value)}
                placeholder="Nome do pipeline"
                className="mx-auto mt-5 h-11 max-w-xs rounded-[16px] bg-white text-center"
              />
              <Button
                className="mt-4 gap-2 bg-gradient-primary text-white"
                disabled={!pipelineNameInput.trim() || setupMutation.isPending}
                onClick={() => setupMutation.mutate()}
              >
                Criar pipeline
              </Button>
            </section>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto px-4 pb-6 sm:px-6 lg:px-10 lg:pb-8">
            <div className="flex h-full min-w-max gap-4">
              {stages.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">Nenhuma etapa cadastrada — clique em "Configurar etapas".</p>
              )}
              {stages.map((stage) => {
                const stageItems = visibleItems.filter((i) => i.stageId === stage.id);
                const total = stageItems.reduce(
                  (sum, item) => sum + (dealByItem.get(item.id)?.value ?? 0),
                  0,
                );
                return (
                  <div key={stage.id} className="flex w-[280px] shrink-0 flex-col">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color ?? "var(--foreground-subtle)" }}
                      />
                      <span className="truncate text-sm font-semibold">{stage.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {stageItems.length}
                        {total > 0 && ` · ${formatBRL(total)}`}
                      </span>
                    </div>
                    <div
                      ref={(el) => registerColumn(stage.id, el)}
                      className={cn(
                        "surface-card flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
                        drag && overStageId === stage.id && "ring-2 ring-pink/40",
                      )}
                    >
                      {stageItems.map((item) => (
                        <PipelineCard
                          key={item.id}
                          item={item}
                          stage={stage}
                          stages={stages}
                          deal={dealByItem.get(item.id) ?? null}
                          extras={extrasFor(item)}
                          dragging={drag?.itemId === item.id}
                          onOpen={() => setOpenItemId(item.id)}
                          onMove={(toStageId) =>
                            moveMutation.mutate({ itemId: item.id, newStageId: toStageId })
                          }
                          onDragStart={(event) =>
                            handlers.start(event, {
                              id: item.id,
                              stageId: stage.id,
                              title: item.title ?? "Sem nome",
                            })
                          }
                          onDragMove={handlers.move}
                          onDragEnd={handlers.end}
                        />
                      ))}
                      {stageItems.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          {query || statusFilter !== "all" ? "Nada aqui com esse filtro" : "Vazio"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Fantasma seguindo o dedo/cursor: sem ele o arraste não tem retorno
          visual nenhum, já que o card original fica no lugar esmaecido.

          Fica ancorado em 0,0 e se move só por `transform`, que roda no
          compositor. Posicionar por `left`/`top` refazia o layout da página a
          cada pixel de arraste. Quem escreve o transform é o próprio hook, a
          um requestAnimationFrame por quadro — durante o arraste e durante o
          voo até o destino.

          Largura e deslocamento vêm do card de origem: assim ele levanta de
          onde estava, no ponto em que o dedo o pegou, em vez de aparecer com
          outro tamanho a 12px do dedo. */}
      {drag && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-50 rounded-2xl border border-pink/40 bg-white px-3 py-2 text-sm font-medium shadow-4 will-change-transform"
          style={{
            width: drag.width,
            transform: `translate3d(${drag.x + drag.offsetX}px, ${drag.y + drag.offsetY}px, 0)`,
          }}
        >
          {drag.title}
        </div>
      )}

      <DealDetailSheet
        item={openItem}
        stage={openStage}
        stages={stages}
        deal={openItem ? (dealByItem.get(openItem.id) ?? null) : null}
        conversationId={openConversation?.id ?? null}
        contactId={openConversation?.contactId ?? (openItem?.type === "contact" ? openItem.itemId : null)}
        phone={openConversation?.phone ?? null}
        onOpenChange={(open) => !open && setOpenItemId(null)}
        onMove={(toStageId, notes) =>
          openItem && moveMutation.mutate({ itemId: openItem.id, newStageId: toStageId, notes })
        }
        onChanged={refreshDeals}
      />

      <StagesSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        stages={stages}
        onSaveStage={(stage) => doSaveStage({ data: stage })}
        onDeleteStage={(id) => doDeleteStage({ data: { id } })}
        onReorder={(orderedIds) => doReorder({ data: { orderedIds } })}
        onChanged={refresh}
      />
    </>
  );
}

function StagesSheet({
  open,
  onOpenChange,
  stages,
  onSaveStage,
  onDeleteStage,
  onReorder,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PipelineStage[];
  onSaveStage: (stage: { id?: string; name: string; position?: number; color?: string }) => Promise<unknown>;
  onDeleteStage: (id: string) => Promise<unknown>;
  onReorder: (orderedIds: string[]) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setEditing(Object.fromEntries(stages.map((s) => [s.id, s.name])));
  }, [open, stages]);

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; name: string; position?: number; color?: string }) => onSaveStage(vars),
    onSuccess: onChanged,
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => onDeleteStage(id),
    onSuccess: onChanged,
    onError: (error: Error) => toast.error(error.message),
  });
  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => onReorder(orderedIds),
    onSuccess: onChanged,
    onError: (error: Error) => toast.error(error.message),
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...stages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((s) => s.id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Etapas do funil</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-2xl border border-border p-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? "var(--foreground-subtle)" }} />
              <Input
                value={editing[stage.id] ?? stage.name}
                onChange={(e) => setEditing((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                onBlur={() => {
                  const name = (editing[stage.id] ?? stage.name).trim();
                  if (name && name !== stage.name) saveMutation.mutate({ id: stage.id, name });
                }}
                className="h-9 flex-1 rounded-xl"
              />
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === stages.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-danger"
                  onClick={() => deleteMutation.mutate(stage.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova etapa"
            className="h-10 flex-1 rounded-xl"
          />
          <Button
            className="gap-1.5 bg-gradient-primary text-white"
            disabled={!newName.trim() || saveMutation.isPending}
            onClick={() => {
              const color = STAGE_COLORS[stages.length % STAGE_COLORS.length];
              saveMutation.mutate({ name: newName.trim(), position: stages.length, color });
              setNewName("");
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
