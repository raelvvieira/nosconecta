import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, HeartCrack } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOSS_REASONS, MOTIVOS_DEFINITIVOS } from "@/lib/atendimentos/deals.functions";
import { marcarLeadPerdido } from "@/lib/atendimentos/leads-perdidos.functions";
import type { LeadNoFunil } from "@/lib/atendimentos/funis.functions";
import { cn } from "@/lib/utils";

/**
 * "Perdido" é para quem a clínica chamou, tentou, e que não vai agendar.
 * Escolher o motivo é obrigatório: é ele que organiza o funil de Perdidos.
 */
export function MarcarComoPerdido({ lead, onFeito }: { lead: LeadNoFunil; onFeito: () => void }) {
  const queryClient = useQueryClient();
  const marcar = useServerFn(marcarLeadPerdido);
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");

  const mutacao = useMutation({
    mutationFn: () =>
      marcar({
        data: {
          fone: lead.fone,
          motivo: motivo!,
          observacao,
          name: lead.name,
          crmContactId: lead.crmContactId,
          conversationId: lead.conversationId,
          valor: lead.valor,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funil-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-perdidos"] });
      toast.success(`${lead.name} foi para Perdidos · ${motivo}.`);
      onFeito();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <HeartCrack className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Marcar como perdido
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            aberto && "rotate-180",
          )}
        />
      </button>

      {aberto && (
        <div className="grid gap-3 border-t border-border/60 px-4 pb-4 pt-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Para quem a clínica já chamou e que não vai agendar. Por quê?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LOSS_REASONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m === motivo ? null : m)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  m === motivo
                    ? "border-foreground bg-foreground font-medium text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {motivo && MOTIVOS_DEFINITIVOS.includes(motivo) && (
            <p className="text-2xs leading-4 text-muted-foreground">
              Com este motivo a pessoa não recebe mais disparos de reativação.
            </p>
          )}
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação (opcional)"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!motivo || mutacao.isPending}
            onClick={() => mutacao.mutate()}
            className="h-10 rounded-xl"
          >
            {mutacao.isPending ? "Salvando…" : "Confirmar perda"}
          </Button>
        </div>
      )}
    </div>
  );
}
