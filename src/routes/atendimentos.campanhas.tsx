import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Megaphone, Pause, Play, Plus, RefreshCw, Rocket, Square } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import { NewCampaignSheet } from "@/components/atendimentos/campaigns/NewCampaignSheet";
import { cn } from "@/lib/utils";
import {
  campaignLifecycle,
  executeCampaign,
  getCampaignConfig,
  getCampaigns,
  getDailySendUsage,
  setDailySendLimit,
  updatePendingMove,
} from "@/lib/atendimentos/campaigns.functions";
import { movePipelineItem } from "@/lib/atendimentos/pipeline.functions";
import { moveContactsToStage } from "@/lib/atendimentos/campaignMoveLoop";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/campanhas")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Campanhas · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Disparo de mensagens em massa pelo WhatsApp." },
    ],
  }),
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar as campanhas"
      description="Houve uma falha ao buscar as campanhas. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: CampanhasPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  stopped: "Parada",
};

function PendingMoveBadge({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(getCampaignConfig);
  const doMovePipelineItem = useServerFn(movePipelineItem);
  const doUpdatePendingMove = useServerFn(updatePendingMove);

  const configQuery = useQuery({
    queryKey: ["campaign-config", campaignId],
    queryFn: () => fetchConfig({ data: { campaignId } }),
    staleTime: 30_000,
  });
  const pending = configQuery.data?.movePendingContactIds ?? [];
  const targetStageId = configQuery.data?.targetStageId;

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!targetStageId) return;
      const { failedIds } = await moveContactsToStage(
        (args) => doMovePipelineItem({ data: args }),
        pending,
        targetStageId,
      );
      await doUpdatePendingMove({ data: { campaignId, remainingIds: failedIds } });
      return failedIds;
    },
    onSuccess: (failedIds) => {
      if (failedIds && failedIds.length > 0) {
        toast.warning(`${failedIds.length} contato(s) ainda não puderam ser movidos.`);
      } else {
        toast.success("Contatos movidos de etapa.");
      }
      queryClient.invalidateQueries({ queryKey: ["campaign-config", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (pending.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => retryMutation.mutate()}
      disabled={retryMutation.isPending}
      className="flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning hover:opacity-80"
    >
      {retryMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
      Movimentação pendente ({pending.length}) — tentar de novo
    </button>
  );
}

function CampanhasPage() {
  const queryClient = useQueryClient();
  const fetchCampaigns = useServerFn(getCampaigns);
  const fetchUsage = useServerFn(getDailySendUsage);
  const doSetLimit = useServerFn(setDailySendLimit);
  const doExecute = useServerFn(executeCampaign);
  const doLifecycle = useServerFn(campaignLifecycle);

  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 10_000 });
  const usageQuery = useQuery({ queryKey: ["campaigns-usage"], queryFn: () => fetchUsage(), staleTime: 15_000 });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
  };

  const executeMutation = useMutation({
    mutationFn: (campaignId: string) => doExecute({ data: { campaignId } }),
    onSuccess: (res) => {
      toast.success(`Campanha disparada — ~${res.recipientsCounted} contatos`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const lifecycleMutation = useMutation({
    mutationFn: (vars: { campaignId: string; action: "pause" | "resume" | "stop" }) => doLifecycle({ data: vars }),
    onSuccess: () => {
      toast.success("Atualizado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [limitInput, setLimitInput] = useState("");
  const limitMutation = useMutation({
    mutationFn: () => doSetLimit({ data: { limit: Number(limitInput) } }),
    onSuccess: () => {
      toast.success("Limite atualizado");
      setLimitInput("");
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [formOpen, setFormOpen] = useState(false);
  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };
  const usagePct = usage.limit > 0 ? Math.min(100, Math.round((usage.usedToday / usage.limit) * 100)) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.03em]">
            <Megaphone className="h-5 w-5 text-pink" />
            Campanhas
          </h1>
          <div className="flex items-center gap-2.5">
            <WhatsappStatusBadge />
            <Button className="gap-2 bg-gradient-primary text-white" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          </div>
        </header>

        <section className="surface-card mt-5 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Limite diário de disparo</span>
            <span className="text-muted-foreground">
              {usage.usedToday}/{usage.limit} contatos hoje
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", usagePct >= 100 ? "bg-danger" : "bg-gradient-primary")}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value.replace(/\D/g, ""))}
              placeholder={`Novo limite (atual: ${usage.limit})`}
              className="h-9 max-w-[220px] rounded-xl"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!limitInput || limitMutation.isPending}
              onClick={() => limitMutation.mutate()}
            >
              Salvar limite
            </Button>
          </div>
        </section>

        <section className="surface-card mt-5 divide-y divide-border overflow-hidden">
          {(campaignsQuery.data ?? []).length === 0 && (
            <div className="grid min-h-40 place-items-center px-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
            </div>
          )}
          {(campaignsQuery.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {STATUS_LABEL[c.status] ?? c.status} · {c.sendToAll ? "Todos os contatos" : "Segmento"}
                  </span>
                  <PendingMoveBadge campaignId={c.id} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={executeMutation.isPending}
                  onClick={() => executeMutation.mutate(c.id)}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Disparar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "pause" })}
                  aria-label="Pausar"
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "resume" })}
                  aria-label="Retomar"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-danger"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "stop" })}
                  aria-label="Parar"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </section>
      </main>

      <NewCampaignSheet open={formOpen} onOpenChange={setFormOpen} onCreated={refresh} />
    </>
  );
}
