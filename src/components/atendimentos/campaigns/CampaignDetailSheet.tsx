import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageComposer, type ComposerState } from "./MessageComposer";
import { PacingSection } from "./PacingSection";
import { PhonePreview } from "./PhonePreview";
import { CAMPAIGN_STATUS_LABEL } from "./status";
import {
  deleteCampaign,
  getCampaignConfig,
  getCampaignDetail,
  getMessageTemplates,
  saveCampaign,
  saveMessageTemplate,
  type CampaignDetail,
  type MessageInterval,
} from "@/lib/atendimentos/campaigns.functions";

const INTERVAL_LABEL: Record<MessageInterval, string> = {
  "1_5": "1 a 5 segundos",
  "5_10": "5 a 10 segundos",
  "10_15": "10 a 15 segundos",
  "15_20": "15 a 20 segundos",
};

/**
 * Detalhe de uma campanha.
 *
 * Não existia: a lista mostrava só o título e quatro ícones, sem nenhuma forma
 * de ver do que a campanha tratava ou qual mensagem tinha dentro. O endpoint de
 * detalhe existia na Edge Function desde sempre, sem nenhuma tela chamando.
 *
 * A mensagem é recuperada cruzando o `templateId` da campanha com a lista de
 * templates, que já traz o conteúdo. Quando o CRM não devolve o vínculo, o
 * painel diz isso em vez de mostrar um preview vazio que pareceria "campanha
 * sem mensagem".
 */
export function CampaignDetailSheet({
  campaignId,
  onOpenChange,
  onDetailLoaded,
}: {
  /** `null` = fechado. */
  campaignId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Devolve o detalhe carregado, para a revisão de disparo reaproveitar. */
  onDetailLoaded?: (detail: CampaignDetail, message: string, mediaUrl: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getCampaignDetail);
  const fetchConfig = useServerFn(getCampaignConfig);
  const fetchTemplates = useServerFn(getMessageTemplates);
  const doSaveCampaign = useServerFn(saveCampaign);
  const doSaveTemplate = useServerFn(saveMessageTemplate);
  const doDeleteCampaign = useServerFn(deleteCampaign);

  const open = Boolean(campaignId);

  const detailQuery = useQuery({
    queryKey: ["campaign-detail", campaignId],
    queryFn: () => fetchDetail({ data: { campaignId: campaignId! } }),
    enabled: open,
    staleTime: 5_000,
  });
  const configQuery = useQuery({
    queryKey: ["campaign-config", campaignId],
    queryFn: () => fetchConfig({ data: { campaignId: campaignId! } }),
    enabled: open,
    staleTime: 30_000,
  });
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => fetchTemplates(),
    enabled: open,
    staleTime: 30_000,
  });

  const detail = detailQuery.data ?? null;

  const template = useMemo(
    () => (templatesQuery.data ?? []).find((t) => t.id === detail?.templateId) ?? null,
    [templatesQuery.data, detail?.templateId],
  );

  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [interval, setInterval] = useState<MessageInterval>("5_10");
  const [pauseAfterCount, setPauseAfterCount] = useState<number | null>(null);
  const [resumeAfterMinutes, setResumeAfterMinutes] = useState<number | null>(null);
  const [composer, setComposer] = useState<ComposerState>({
    mode: "digitar",
    templateId: null,
    isNewTemplate: false,
    newTemplateName: "",
    content: "",
    mediaUrl: null,
  });

  // Repovoa ao abrir e sempre que o detalhe chegar; sair da edição descarta.
  useEffect(() => {
    if (!open || !detail) return;
    setEditando(false);
    setTitulo(detail.title);
    setInterval(detail.messageInterval ?? "5_10");
    setPauseAfterCount(detail.pauseAfterCount);
    setResumeAfterMinutes(detail.resumeAfterMinutes);
    setComposer((c) => ({ ...c, content: template?.content ?? "", templateId: detail.templateId }));
  }, [open, detail, template?.content]);

  useEffect(() => {
    if (detail) onDetailLoaded?.(detail, template?.content ?? "", null);
  }, [detail, template?.content, onDetailLoaded]);

  const salvar = useMutation({
    mutationFn: async () => {
      // Mensagem alterada vira template novo: o CRM exige um template por
      // campanha, e sobrescrever o existente afetaria outras campanhas que o
      // usam. Mesmo caminho da criação (ver NewCampaignSheet).
      let templateId = detail?.templateId ?? undefined;
      if (composer.content.trim() && composer.content !== template?.content) {
        const res = await doSaveTemplate({
          data: {
            name: `[Digitado] ${crypto.randomUUID().slice(0, 6)}`,
            content: composer.content,
          },
        });
        templateId = res.template?.id ?? templateId;
      }

      await doSaveCampaign({
        data: {
          id: campaignId!,
          title: titulo.trim(),
          sendToAll: true,
          messageInterval: interval,
          templateId,
          targetStageId: configQuery.data?.targetStageId ?? null,
          pauseAfterCount,
          resumeAfterMinutes,
        },
      });
    },
    onSuccess: () => {
      toast.success("Campanha atualizada");
      setEditando(false);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-detail", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const excluir = useMutation({
    mutationFn: () => doDeleteCampaign({ data: { campaignId: campaignId! } }),
    onSuccess: () => {
      toast.success("Campanha excluída");
      setConfirmandoExclusao(false);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
    },
    // O diálogo fica aberto no erro: a mensagem do CRM aparece ali, junto do
    // botão, em vez de virar um toast que some antes de ser lido.
    onError: (e: Error) => toast.error(e.message),
  });

  const mensagem = editando ? composer.content : (template?.content ?? "");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[600px]">
        <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/60 to-coral-soft/40 px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
              <Megaphone className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate">{detail?.title ?? "Campanha"}</SheetTitle>
              <SheetDescription>
                {detail ? CAMPAIGN_STATUS_LABEL(detail.status) : "Carregando..."}
                {detail ? ` · ~${detail.estimatedRecipients} contatos` : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {detailQuery.isPending ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">Carregando campanha...</p>
        ) : detailQuery.isError ? (
          <p className="px-6 py-8 text-sm text-danger">
            Não foi possível carregar esta campanha do CRM.
          </p>
        ) : (
          <div className="space-y-6 px-6 py-6">
            {editando ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="campanha-titulo" className="text-sm text-foreground-secondary">
                    Título
                  </Label>
                  <Input
                    id="campanha-titulo"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <PacingSection
                  interval={interval}
                  pauseAfterCount={pauseAfterCount}
                  resumeAfterMinutes={resumeAfterMinutes}
                  onIntervalChange={setInterval}
                  onPauseAfterChange={setPauseAfterCount}
                  onResumeAfterChange={setResumeAfterMinutes}
                />
                <MessageComposer state={composer} onChange={setComposer} />
              </>
            ) : (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mensagem
                  </h3>
                  {mensagem.trim() ? (
                    <PhonePreview content={mensagem} mediaUrl={null} />
                  ) : (
                    <p className="rounded-xl bg-surface px-3 py-4 text-2xs leading-4 text-muted-foreground">
                      Mensagem não recuperável do CRM — a campanha não devolveu o
                      template vinculado. Editar e escrever uma nova mensagem religa
                      o vínculo.
                    </p>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Envio
                  </h3>
                  <dl className="divide-y divide-border rounded-xl border border-border px-3">
                    <Linha rotulo="Intervalo entre mensagens" valor={INTERVAL_LABEL[interval]} />
                    <Linha
                      rotulo="Pausar a cada"
                      valor={pauseAfterCount ? `${pauseAfterCount} mensagens` : "Não pausar"}
                    />
                    <Linha
                      rotulo="Estimativa de contatos"
                      valor={`~${detail?.estimatedRecipients ?? 0}`}
                    />
                    <Linha
                      rotulo="Mover para etapa após envio"
                      valor={configQuery.data?.targetStageId ? "Configurada" : "Nenhuma"}
                    />
                  </dl>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Disparos
                  </h3>
                  {detail?.sends.length ? (
                    <ul className="divide-y divide-border rounded-xl border border-border px-3">
                      {detail.sends.map((s) => (
                        <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                          <span className="text-foreground-secondary">
                            {new Date(s.executedAt).toLocaleString("pt-BR")}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            ~{s.recipientCount} contatos
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nunca disparada.</p>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {detail && (
          <div className="sticky bottom-0 flex gap-3 border-t border-border bg-white px-6 py-4">
            {editando ? (
              <>
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-gradient-primary text-white"
                  disabled={!titulo.trim() || salvar.isPending}
                  onClick={() => salvar.mutate()}
                >
                  {salvar.isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1 gap-2 rounded-xl" onClick={() => setEditando(true)}>
                  <Pencil className="h-4 w-4" /> Editar campanha
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl border-danger/30 text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              </>
            )}
          </div>
        )}

        <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{detail?.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                A campanha sai do CRM e não tem como desfazer. O histórico de
                disparos já feitos continua contando no limite diário — porque as
                mensagens já saíram.
                {excluir.isError && (
                  <span className="mt-3 block rounded-xl bg-danger-soft px-3 py-2 text-2xs leading-4 text-danger">
                    {excluir.error.message}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-danger text-white hover:bg-danger/90"
                disabled={excluir.isPending}
                onClick={(e) => {
                  // Segura o fechamento: o erro do CRM precisa aparecer aqui.
                  e.preventDefault();
                  excluir.mutate();
                }}
              >
                {excluir.isPending ? "Excluindo..." : "Excluir campanha"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium text-foreground">{valor}</dd>
    </div>
  );
}
