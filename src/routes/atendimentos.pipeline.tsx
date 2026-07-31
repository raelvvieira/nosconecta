import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Settings2, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  createPipeline,
  deletePipelineStage,
  getPipelineItems,
  getPipelineStages,
  movePipelineItem,
  reorderPipelineStages,
  savePipelineStage,
  type PipelineStage,
} from "@/lib/atendimentos/pipeline.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/pipeline")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Pipeline · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Funil de atendimento — etapas e contatos em cada uma." },
    ],
  }),
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar o pipeline"
      description="Houve uma falha ao buscar as etapas. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: PipelinePage,
});

const STAGE_COLORS = ["#FF6B57", "#8B5CF6", "#0EA5E9", "#F59E0B", "#22C55E", "#EC4899"];

function PipelinePage() {
  const queryClient = useQueryClient();
  const fetchStages = useServerFn(getPipelineStages);
  const fetchItems = useServerFn(getPipelineItems);
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
  const configured = stagesQuery.data?.configured ?? true;
  const stages = [...(stagesQuery.data?.stages ?? [])].sort((a, b) => a.position - b.position);

  const itemsQuery = useQuery({
    queryKey: ["pipeline-items"],
    queryFn: () => fetchItems(),
    enabled: configured && stagesQuery.data?.configured === true,
    staleTime: 8_000,
    refetchInterval: 20_000,
  });
  const items = itemsQuery.data?.items ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
  };

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
    mutationFn: (vars: { itemId: string; newStageId: string }) =>
      doMove({ data: { itemId: vars.itemId, newStageId: vars.newStageId } }),
    onSuccess: () => {
      toast.success("Movido de etapa");
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [configOpen, setConfigOpen] = useState(false);

  if (stagesQuery.isLoading) {
    return <main className="flex flex-1 items-center justify-center lg:h-full" />;
  }

  return (
    <>
      <main className="flex flex-1 flex-col pb-24 lg:h-full lg:overflow-hidden lg:pb-0">
        <header className="flex items-center justify-between gap-3 px-4 pb-4 pt-6 sm:px-6 lg:px-8 lg:pt-7">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.03em]">
            <Workflow className="h-5 w-5 text-pink" />
            Pipeline
          </h1>
          {configured && (
            <Button variant="outline" className="gap-2" onClick={() => setConfigOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Configurar etapas
            </Button>
          )}
        </header>

        {!configured ? (
          <div className="flex flex-1 items-center justify-center px-4 pb-10">
            <section className="surface-card w-full max-w-[440px] px-6 py-8 text-center sm:px-10 sm:py-10">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-coral-soft text-coral">
                <Workflow className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">Criar o pipeline</h2>
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
          <div className="flex-1 overflow-x-auto px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">
            <div className="flex h-full min-w-max gap-4">
              {stages.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">Nenhuma etapa cadastrada — clique em "Configurar etapas".</p>
              )}
              {stages.map((stage) => {
                const stageItems = items.filter((i) => i.stageId === stage.id);
                return (
                  <div key={stage.id} className="flex w-[280px] shrink-0 flex-col">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color ?? "#94A3B8" }}
                      />
                      <span className="truncate text-sm font-semibold">{stage.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{stageItems.length}</span>
                    </div>
                    <div className="surface-card flex-1 space-y-2 overflow-y-auto p-2">
                      {stageItems.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-border bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium">{item.title ?? "Sem nome"}</p>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {stages
                                  .filter((s) => s.id !== stage.id)
                                  .map((s) => (
                                    <DropdownMenuItem
                                      key={s.id}
                                      onClick={() => moveMutation.mutate({ itemId: item.id, newStageId: s.id })}
                                    >
                                      Mover para {s.name}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.type === "contact" ? "Contato" : "Conversa"}
                          </p>
                        </div>
                      ))}
                      {stageItems.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">Vazio</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

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
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? "#94A3B8" }} />
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
