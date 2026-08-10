import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { PhonePreview } from "./PhonePreview";
import { getCampaignDetail, getMessageTemplates } from "@/lib/atendimentos/campaigns.functions";

/**
 * Revisão antes de disparar.
 *
 * Antes, "Disparar" mandava a campanha no clique, sem perguntar nada — e como
 * o botão fica ao lado de Pausar e Cancelar, um clique errado disparava para
 * toda a base. Agora mostra o que vai sair: a mensagem, quantos contatos e
 * quanto sobra do limite do dia.
 *
 * Não é um "tem certeza?" genérico de propósito. O que evita o disparo errado
 * não é mais um clique, é ver a mensagem e reconhecer que não era aquela.
 */
export function FireCampaignDialog({
  campaignId,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  /** `null` = fechado. */
  campaignId: string | null;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (campaignId: string) => void;
}) {
  const fetchDetail = useServerFn(getCampaignDetail);
  const fetchTemplates = useServerFn(getMessageTemplates);
  const open = Boolean(campaignId);

  // A revisão busca o próprio detalhe em vez de receber pronto: assim ela
  // funciona a partir de qualquer lugar da tela, sem depender de o painel de
  // detalhe ter sido aberto antes.
  const detailQuery = useQuery({
    queryKey: ["campaign-detail", campaignId],
    queryFn: () => fetchDetail({ data: { campaignId: campaignId! } }),
    enabled: open,
    staleTime: 5_000,
  });
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => fetchTemplates(),
    enabled: open,
    staleTime: 30_000,
  });

  const detail = detailQuery.data ?? null;
  const message = useMemo(
    () => (templatesQuery.data ?? []).find((t) => t.id === detail?.templateId)?.content ?? "",
    [templatesQuery.data, detail?.templateId],
  );
  const mediaUrl = null;

  const restante = detail ? Math.max(0, detail.usage.limit - detail.usage.usedToday) : 0;
  const estimativa = detail?.estimatedRecipients ?? 0;
  const estouraLimite = detail ? estimativa > restante : false;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <AlertDialogContent className="max-w-[520px]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Disparar {detail ? `"${detail.title}"` : "campanha"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Confira a mensagem antes de enviar. Depois de disparada, não há como recolher.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Vai para</span>
              <span className="font-semibold text-foreground">
                ~{estimativa} contato{estimativa === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Sobra hoje</span>
              <span className={estouraLimite ? "font-semibold text-danger" : "font-semibold text-foreground"}>
                {restante} de {detail?.usage.limit ?? 0}
              </span>
            </div>

            {estouraLimite && (
              <p className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2 text-2xs leading-4 text-danger">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                A estimativa passa do limite diário. O disparo será recusado.
              </p>
            )}

            {/* Ninguém sabia disto até agora: o limite é debitado inteiro no
                disparo, com a estimativa cheia. Pausar depois não devolve. */}
            <p className="rounded-xl bg-surface px-3 py-2 text-2xs leading-4 text-muted-foreground">
              O limite do dia é debitado no disparo, com a estimativa cheia — pausar
              no meio não devolve a cota.
            </p>
          </div>

          <div className="sm:w-[220px]">
            {message.trim() || mediaUrl ? (
              <PhonePreview content={message} mediaUrl={mediaUrl} />
            ) : (
              <p className="rounded-xl bg-surface px-3 py-6 text-center text-2xs leading-4 text-muted-foreground">
                Mensagem não recuperável do CRM. Confira no detalhe da campanha antes
                de disparar.
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-gradient-primary text-white hover:opacity-90"
            disabled={isPending || detailQuery.isPending || estouraLimite}
            onClick={(e) => {
              // O AlertDialogAction fecha sozinho ao clicar; segurar o
              // fechamento deixa o "Disparando..." visível até a resposta.
              e.preventDefault();
              if (campaignId) onConfirm(campaignId);
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Disparando...
              </>
            ) : (
              "Disparar agora"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
