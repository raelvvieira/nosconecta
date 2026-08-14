import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ListFilter, Rocket, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  saveCampaign,
  saveMessageTemplate,
  executeCampaign,
  getEstimatedRecipients,
  getDailySendUsage,
  updatePendingMove,
  type MessageInterval,
} from "@/lib/atendimentos/campaigns.functions";
import { criarDisparo, type BroadcastAlvo } from "@/lib/atendimentos/broadcast.functions";
import { garantirContatoCrm } from "@/lib/patients/patients.functions";
import { movePipelineItem } from "@/lib/atendimentos/pipeline.functions";
import { moveContactsToStage } from "@/lib/atendimentos/campaignMoveLoop";
import { FunnelSection, type ResolvedAudience } from "./FunnelSection";
import { PacingSection } from "./PacingSection";
import { MessageComposer, HIDDEN_TEMPLATE_PREFIX, type ComposerState } from "./MessageComposer";
import { PhonePreview } from "./PhonePreview";
import { CreateTransmissionDialog } from "./CreateTransmissionDialog";
import { ContactsTab, type ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import { BroadcastDialog } from "@/components/atendimentos/contacts/BroadcastDialog";

const EMPTY_AUDIENCE: ResolvedAudience = { moveCandidateItemIds: [] };

const INITIAL_COMPOSER: ComposerState = {
  mode: "digitar",
  templateId: null,
  isNewTemplate: true,
  newTemplateName: "",
  content: "",
  mediaUrl: null,
};

function isComposerReady(state: ComposerState): boolean {
  if (state.mode === "digitar") return state.content.trim().length > 0;
  if (state.isNewTemplate) return state.newTemplateName.trim().length > 0 && state.content.trim().length > 0;
  return !!state.templateId;
}

/**
 * Uma única página de campanhas, uma única criação. Existiam dois caminhos
 * separados — esta gaveta (sempre "todos os contatos", motor do Wavy) e a
 * aba Contatos (seleção filtrada, fila própria) — e quem queria mandar só
 * para o DDD 48 precisava sair daqui, ir pra outra aba, montar tudo de novo
 * lá. Agora a audiência é o primeiro passo desta própria gaveta: "Todos os
 * contatos" segue pelo motor do Wavy (não recorta — ver comentário abaixo);
 * "Selecionar contatos" reaproveita a busca/filtro por DDD da antiga aba
 * Contatos e dispara pela fila própria, que é a única capaz de recortar.
 */
export function NewCampaignSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const doSaveTemplate = useServerFn(saveMessageTemplate);
  const doSaveCampaign = useServerFn(saveCampaign);
  const doExecuteCampaign = useServerFn(executeCampaign);
  const doMovePipelineItem = useServerFn(movePipelineItem);
  const doUpdatePendingMove = useServerFn(updatePendingMove);
  const fetchEstimate = useServerFn(getEstimatedRecipients);
  const fetchUsage = useServerFn(getDailySendUsage);
  const doDisparar = useServerFn(criarDisparo);
  const doGarantirContato = useServerFn(garantirContatoCrm);

  const [audiencia, setAudiencia] = useState<"todos" | "selecionar">("todos");

  // Carregado só com a gaveta aberta: é uma ida ao CRM, e a tela precisa dele
  // apenas na hora de confirmar (e agora também para mostrar antes de programar).
  const estimateQuery = useQuery({
    queryKey: ["campaign-estimate"],
    queryFn: () => fetchEstimate(),
    enabled: open && audiencia === "todos",
    staleTime: 5 * 60_000,
  });
  // Mesma chave da página de campanhas: reaproveita o cache em vez de pedir de novo.
  const usageQuery = useQuery({
    queryKey: ["campaigns-usage"],
    queryFn: () => fetchUsage(),
    enabled: open,
    staleTime: 15_000,
  });

  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [audience, setAudience] = useState<ResolvedAudience>(EMPTY_AUDIENCE);

  const [interval, setInterval] = useState<MessageInterval>("5_10");
  const [pauseAfterCount, setPauseAfterCount] = useState<number | null>(null);
  const [resumeAfterMinutes, setResumeAfterMinutes] = useState<number | null>(null);

  const [composer, setComposer] = useState<ComposerState>(INITIAL_COMPOSER);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number } | null>(null);

  // Estado do caminho "Selecionar contatos" — mesma seleção e diálogo de
  // revisão que a antiga aba Contatos usava, agora vivendo aqui.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [disparoSelecao, setDisparoSelecao] = useState<ContatoSelecionado[] | null>(null);

  const reset = () => {
    setAudiencia("todos");
    setTargetStageId(null);
    setAudience(EMPTY_AUDIENCE);
    setInterval("5_10");
    setPauseAfterCount(null);
    setResumeAfterMinutes(null);
    setComposer(INITIAL_COMPOSER);
    setMoveProgress(null);
    setSelecionados(new Set());
    setDisparoSelecao(null);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
    queryClient.invalidateQueries({ queryKey: ["disparos"] });
  };

  const canProceed = isComposerReady(composer);

  const confirmMutation = useMutation({
    mutationFn: async ({ title, disparar }: { title: string; disparar: boolean }) => {
      let templateId = composer.templateId;
      if (composer.isNewTemplate) {
        const name =
          composer.mode === "digitar"
            ? `${HIDDEN_TEMPLATE_PREFIX}${crypto.randomUUID().slice(0, 6)}`
            : composer.newTemplateName.trim();
        const result = await doSaveTemplate({
          data: { name, content: composer.content, mediaUrl: composer.mediaUrl ?? undefined },
        });
        if (!result.template) throw new Error("O CRM não retornou o template criado.");
        templateId = result.template.id;
      }

      // sendToAll sempre true: segmentação por etapa do pipeline não é
      // suportada pelo CRM (confirmado no manual — campanhas e pipeline não
      // se comunicam). Ver comentário em FunnelSection.tsx.
      const campaignResult = await doSaveCampaign({
        data: {
          title,
          sendToAll: true,
          messageInterval: interval,
          templateId: templateId ?? undefined,
          targetStageId,
          moveContactIds: targetStageId ? audience.moveCandidateItemIds : undefined,
          pauseAfterCount,
          resumeAfterMinutes,
        },
      });
      const campaignId = campaignResult.campaign?.id;
      if (!campaignId) throw new Error("O CRM não retornou a campanha criada.");

      // Salvar sem disparar para aqui: a campanha fica na lista e o envio passa
      // pelo botão Disparar, que mostra contagem, cota e preview antes.
      if (!disparar) return { disparou: false as const, recipientsCounted: 0 };

      const executeResult = await doExecuteCampaign({ data: { campaignId } });

      // Só depois de disparar: mover contato de etapa sem ter enviado nada
      // registraria um avanço no funil que não aconteceu.
      if (targetStageId && audience.moveCandidateItemIds.length > 0) {
        setMoveProgress({ done: 0, total: audience.moveCandidateItemIds.length });
        const { failedIds } = await moveContactsToStage(
          (args) => doMovePipelineItem({ data: args }),
          audience.moveCandidateItemIds,
          targetStageId,
          (done, total) => setMoveProgress({ done, total }),
        );
        await doUpdatePendingMove({ data: { campaignId, remainingIds: failedIds } });
        setMoveProgress(null);
        if (failedIds.length > 0) {
          toast.warning(`Campanha disparada, mas ${failedIds.length} contato(s) não foram movidos de etapa — tente novamente na lista de campanhas.`);
        }
      }

      return { disparou: true as const, recipientsCounted: executeResult.recipientsCounted };
    },
    onSuccess: (res) => {
      toast.success(
        res.disparou
          ? `Campanha disparada — ~${res.recipientsCounted} contato(s)`
          : "Campanha salva. Dispare pela lista quando quiser — lá a revisão mostra para quantos vai.",
        { duration: res.disparou ? 4000 : 8000 },
      );
      refreshAll();
      setDialogOpen(false);
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (error: Error) => {
      setMoveProgress(null);
      toast.error(error.message);
    },
  });

  const disparoMutation = useMutation({
    mutationFn: async (dados: { message: string; intervalSeconds: number }) => {
      // Contato vindo da base de pacientes (nunca teve conversa) ainda não
      // tem contactId no CRM — o motor de envio só sabe falar com um. Cria
      // (ou acha) esse contato agora, um por um, antes de enfileirar; se
      // algum falhar, a mutation inteira falha, em vez de enfileirar um
      // alvo que o disparo não vai conseguir alcançar.
      const alvos: BroadcastAlvo[] = await Promise.all(
        (disparoSelecao ?? []).map(async (c) => {
          if (c.origem === "crm") {
            return { contactId: c.id, conversationId: c.conversationId, name: c.name, phone: c.phone };
          }
          if (!c.phone) throw new Error(`${c.name} não tem telefone cadastrado — não dá para disparar.`);
          const { contactId } = await doGarantirContato({
            data: { patientId: c.patientId!, name: c.name, phone: c.phone },
          });
          if (!contactId) throw new Error(`Não foi possível vincular ${c.name} ao CRM antes de disparar.`);
          return { contactId, conversationId: null, name: c.name, phone: c.phone };
        }),
      );
      return doDisparar({ data: { ...dados, targets: alvos } });
    },
    onSuccess: (r) => {
      const fim = r.terminaEm ? new Date(r.terminaEm) : null;
      toast.success(
        fim
          ? `Fila criada com ${r.total} contatos — termina por volta das ${fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
          : `Fila criada com ${r.total} contatos.`,
        { duration: 8000 },
      );
      refreshAll();
      setDisparoSelecao(null);
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/50 to-coral-soft/40 px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
                <Rocket className="h-5 w-5" />
              </span>
              <div>
                <SheetTitle>Nova campanha</SheetTitle>
                <SheetDescription>Escolha quem recebe, depois o ritmo e a mensagem.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-7 px-6 py-6">
            {/* Audiência vem primeiro: "quem recebe" decide o resto do fluxo,
                e precisa ser visto antes de programar o disparo, não depois. */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Quem recebe
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  data-audiencia="todos"
                  onClick={() => setAudiencia("todos")}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                    audiencia === "todos" ? "border-coral bg-coral-soft" : "border-border bg-white",
                  )}
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>
                    <span className="block text-sm font-semibold">Todos os contatos</span>
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      Vai para {estimateQuery.data ?? "…"} contatos da conta do CRM — sem recorte.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  data-audiencia="selecionar"
                  onClick={() => setAudiencia("selecionar")}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                    audiencia === "selecionar" ? "border-coral bg-coral-soft" : "border-border bg-white",
                  )}
                >
                  <ListFilter className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>
                    <span className="block text-sm font-semibold">Selecionar contatos</span>
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      Busque por nome/número, filtre por DDD e escolha só quem deve receber.
                    </span>
                  </span>
                </button>
              </div>
            </section>

            {audiencia === "selecionar" ? (
              <ContactsTab
                ativo={open && audiencia === "selecionar"}
                barraFixa={false}
                selecionados={selecionados}
                onSelecionadosChange={setSelecionados}
                onDisparar={setDisparoSelecao}
              />
            ) : (
              <>
                {/* "Todos os contatos" é o CRM mandando pra base inteira — não
                    existe registro de quem recebeu cada disparo por aqui, então
                    não tem como avisar ou excluir quem já recebeu recentemente
                    (isso só existe em "Selecionar contatos", ver ContactsTab). */}
                <p className="mt-4 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  Este modo manda para a base inteira sem exceção — para evitar repetir quem já
                  recebeu recentemente, use "Selecionar contatos".
                </p>

                <PacingSection
                  interval={interval}
                  pauseAfterCount={pauseAfterCount}
                  resumeAfterMinutes={resumeAfterMinutes}
                  onIntervalChange={setInterval}
                  onPauseAfterChange={setPauseAfterCount}
                  onResumeAfterChange={setResumeAfterMinutes}
                />

                <FunnelSection
                  targetStageId={targetStageId}
                  onTargetStageChange={setTargetStageId}
                  onAudienceResolved={setAudience}
                />

                <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
                  <MessageComposer state={composer} onChange={setComposer} />
                  <PhonePreview content={composer.content} mediaUrl={composer.mediaUrl} />
                </div>

                <div className="flex gap-3 border-t border-border pt-5">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 gap-2 bg-gradient-primary text-white"
                    disabled={!canProceed}
                    onClick={() => setDialogOpen(true)}
                  >
                    Prosseguir
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <CreateTransmissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultTitle=""
        isPending={confirmMutation.isPending}
        moveProgress={moveProgress}
        totalContatos={estimateQuery.data ?? null}
        onConfirm={(title, disparar) => confirmMutation.mutate({ title, disparar })}
      />

      <BroadcastDialog
        contatos={disparoSelecao}
        usage={usage}
        isPending={disparoMutation.isPending}
        onOpenChange={(o) => !o && setDisparoSelecao(null)}
        onConfirm={(dados) => disparoMutation.mutate(dados)}
      />
    </>
  );
}
