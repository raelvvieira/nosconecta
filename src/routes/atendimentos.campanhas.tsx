import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  Megaphone,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CampaignDetailSheet } from "@/components/atendimentos/campaigns/CampaignDetailSheet";
import { FireCampaignDialog } from "@/components/atendimentos/campaigns/FireCampaignDialog";
import {
  CAMPAIGN_STATUS_LABEL,
  podeCancelar,
  podePausar,
  podeRetomar,
} from "@/components/atendimentos/campaigns/status";
import { NewCampaignSheet } from "@/components/atendimentos/campaigns/NewCampaignSheet";
import { cn } from "@/lib/utils";
import {
  campaignLifecycle,
  deleteCampaign,
  executeCampaign,
  getCampaignConfig,
  getCampaigns,
  getDailySendUsage,
  setDailySendLimit,
  updatePendingMove,
} from "@/lib/atendimentos/campaigns.functions";
import { cancelarDisparo, listarDisparos } from "@/lib/atendimentos/broadcast.functions";
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
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar as campanhas"
      description="Houve uma falha ao buscar as campanhas. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: CampanhasPage,
});

const DISPARO_STATUS_LABEL: Record<string, string> = {
  running: "Em andamento",
  done: "Concluído",
  cancelled: "Cancelado",
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
      className="flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-2xs font-semibold text-warning hover:opacity-80"
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
  const doDelete = useServerFn(deleteCampaign);
  const fetchDisparos = useServerFn(listarDisparos);
  const doCancelarDisparo = useServerFn(cancelarDisparo);

  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 10_000 });
  const usageQuery = useQuery({ queryKey: ["campaigns-usage"], queryFn: () => fetchUsage(), staleTime: 15_000 });
  // Os disparos segmentados (via "Selecionar contatos") não são campanha do
  // Wavy — vivem nas nossas próprias tabelas, lidos direto por RLS.
  const disparosQuery = useQuery({ queryKey: ["disparos"], queryFn: () => fetchDisparos(), staleTime: 10_000 });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    queryClient.invalidateQueries({ queryKey: ["disparos"] });
  };

  const executeMutation = useMutation({
    mutationFn: (campaignId: string) => doExecute({ data: { campaignId } }),
    onSuccess: (res) => {
      toast.success(`Campanha disparada — ~${res.recipientsCounted} contatos`);
      setDispararId(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const lifecycleMutation = useMutation({
    mutationFn: (vars: { campaignId: string; action: "pause" | "resume" | "stop" }) => doLifecycle({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.action === "stop" ? "Campanha cancelada" : "Campanha atualizada");
      setCancelarId(null);
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
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [dispararId, setDispararId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [cancelarDisparoId, setCancelarDisparoId] = useState<string | null>(null);

  const cancelarDisparoMutation = useMutation({
    mutationFn: (broadcastId: string) => doCancelarDisparo({ data: { broadcastId } }),
    onSuccess: () => {
      toast.success("Disparo cancelado — o que já saiu não volta.");
      setCancelarDisparoId(null);
      queryClient.invalidateQueries({ queryKey: ["disparos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => doDelete({ data: { campaignId } }),
    onSuccess: () => {
      toast.success("Campanha excluída");
      setExcluirId(null);
      setDetalheId(null);
      refresh();
    },
    // O diálogo fica aberto: a recusa do CRM aparece ali, junto do botão.
    onError: (error: Error) => toast.error(error.message),
  });
  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };
  const usagePct = usage.limit > 0 ? Math.min(100, Math.round((usage.usedToday / usage.limit) * 100)) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em]">
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

        <h2 className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" />
          Campanhas — todos os contatos
        </h2>
        <section className="surface-card mt-2.5 divide-y divide-border overflow-hidden">
          {(campaignsQuery.data ?? []).length === 0 && (
            <div className="grid min-h-40 place-items-center px-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
            </div>
          )}
          {(campaignsQuery.data ?? []).map((c) => (
            // A linha inteira abre o detalhe. Antes não havia nenhuma forma de
            // ver do que a campanha tratava — só o título e quatro ícones.
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetalheId(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetalheId(c.id);
                }
              }}
              className="press flex cursor-pointer flex-wrap items-center gap-3 px-4 py-4 text-left hover:bg-surface sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {/* Aqui dizia "Segmento" quando `sendToAll` vinha falso — e
                      vinha falso em todas, porque a listagem do CRM não ecoa o
                      campo. Segmentação nem existe nesta integração (campanhas
                      e pipeline não se falam no Wavy), então a palavra descrevia
                      algo que não acontece. O status sozinho é o que sabemos. */}
                  <span>{CAMPAIGN_STATUS_LABEL(c.status)}</span>
                  <PendingMoveBadge campaignId={c.id} />
                </p>
              </div>

              {/* Os botões vivem dentro da linha clicável, então cada um para a
                  propagação — senão disparar também abriria o detalhe. */}
              <div
                className="flex shrink-0 flex-wrap items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  // Por campanha, não pela página: a mutation é uma só, então
                  // `isPending` puro desabilitava o botão de todas as linhas.
                  disabled={executeMutation.isPending && executeMutation.variables === c.id}
                  onClick={() => setDispararId(c.id)}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Disparar
                </Button>

                {podePausar(c.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "pause" })}
                  >
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </Button>
                )}

                {podeRetomar(c.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "resume" })}
                  >
                    <Play className="h-3.5 w-3.5" /> Retomar
                  </Button>
                )}

                {podeCancelar(c.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-danger"
                    onClick={() => setCancelarId(c.id)}
                  >
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                )}

                {/* Excluir também mora aqui, e não só no rodapé do painel de
                    detalhe: no celular aquele rodapé fica no fim de uma tela
                    inteira de rolagem, e quem procura "apagar a campanha" não
                    abre o detalhe para achar. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`Mais ações de ${c.title}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDetalheId(c.id)}>
                      <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-danger" onClick={() => setExcluirId(c.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir campanha
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </section>

        {/* Disparos para uma seleção de contatos — caminho próprio, porque o
            motor do Wavy (acima) não recorta audiência. Vivem numa seção à
            parte, não numa aba: dá pra ver os dois numa rolagem só. */}
        <h2 className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Send className="h-3.5 w-3.5" />
          Disparos — contatos selecionados
        </h2>
        <section className="surface-card mt-2.5 divide-y divide-border overflow-hidden">
          {(disparosQuery.data ?? []).length === 0 && (
            <div className="grid min-h-32 place-items-center px-6 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum disparo para uma seleção de contatos ainda. Em "Nova campanha",
                escolha "Selecionar contatos" para filtrar por nome, número ou DDD.
              </p>
            </div>
          )}
          {(disparosQuery.data ?? []).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.message}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{DISPARO_STATUS_LABEL[d.status] ?? d.status}</span>
                  <span>
                    · {d.enviados}/{d.total} enviados
                    {d.falhas > 0 ? `, ${d.falhas} falharam` : ""}
                  </span>
                </p>
              </div>
              {d.status === "running" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-danger"
                  onClick={() => setCancelarDisparoId(d.id)}
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
            </div>
          ))}
        </section>
      </main>

      <NewCampaignSheet open={formOpen} onOpenChange={setFormOpen} onCreated={refresh} />

      <CampaignDetailSheet
        campaignId={detalheId}
        onOpenChange={(open) => !open && setDetalheId(null)}
      />

      <FireCampaignDialog
        campaignId={dispararId}
        isPending={executeMutation.isPending}
        onOpenChange={(open) => !open && setDispararId(null)}
        onConfirm={(id) => executeMutation.mutate(id)}
      />

      <AlertDialog open={Boolean(cancelarId)} onOpenChange={(o) => !o && setCancelarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              O envio para de onde estiver. As mensagens já entregues não voltam atrás, e
              a cota do dia já debitada não é devolvida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() =>
                cancelarId && lifecycleMutation.mutate({ campaignId: cancelarId, action: "stop" })
              }
            >
              Cancelar campanha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(cancelarDisparoId)} onOpenChange={(o) => !o && setCancelarDisparoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este disparo?</AlertDialogTitle>
            <AlertDialogDescription>
              O que já foi enviado não volta. Os contatos ainda pendentes na fila
              deixam de receber a mensagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelarDisparoMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={cancelarDisparoMutation.isPending}
              onClick={() => cancelarDisparoId && cancelarDisparoMutation.mutate(cancelarDisparoId)}
            >
              Cancelar disparo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(excluirId)} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent data-excluir-campanha="">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha sai do CRM e não tem como desfazer. O histórico de disparos
              já feitos continua contando no limite diário — porque as mensagens já
              saíram.
              {deleteMutation.isError && (
                <span className="mt-3 block rounded-xl bg-danger-soft px-3 py-2 text-2xs leading-4 text-danger">
                  {deleteMutation.error.message}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                // Segura o fechamento: a recusa do CRM precisa aparecer aqui.
                e.preventDefault();
                if (excluirId) deleteMutation.mutate(excluirId);
              }}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir campanha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
