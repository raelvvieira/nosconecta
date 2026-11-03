import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { moverLead, type LeadNoFunil } from "@/lib/atendimentos/funis.functions";
import type { RegraDeFunil } from "@/lib/atendimentos/funnelRules";
import { PUBLICOS, type Publico } from "@/lib/atendimentos/publico";
import { cn } from "@/lib/utils";

/**
 * Mudar o card de lugar à mão: outro funil, outra etapa.
 *
 * O quadro continua se organizando sozinho; a escolha daqui vence o cálculo
 * até alguém clicar em "Voltar ao automático".
 */
export function SeletorDePosicao({
  lead,
  publico,
  colunas,
  onFeito,
}: {
  lead: LeadNoFunil;
  publico: Publico;
  colunas: RegraDeFunil[];
  onFeito?: () => void;
}) {
  const queryClient = useQueryClient();
  const mover = useServerFn(moverLead);
  const mutacao = useMutation({
    mutationFn: (patch: { publico?: Publico | null; etapa?: string | null }) =>
      mover({ data: { fone: lead.fone, ...patch } }),
    onSuccess: (_r, patch) => {
      queryClient.invalidateQueries({ queryKey: ["funil-leads"] });
      queryClient.invalidateQueries({ queryKey: ["publicos-dos-contatos"] });
      if (patch.publico === null && patch.etapa === null) {
        toast.success(`${lead.name} voltou ao automático.`);
      } else if (patch.publico) {
        const nome = PUBLICOS.find((p) => p.value === patch.publico)?.label;
        toast.success(`${lead.name} foi para o funil ${nome}.`);
      } else {
        const nome = colunas.find((c) => c.id === patch.etapa)?.nome;
        toast.success(`${lead.name} foi para ${nome}.`);
      }
      onFeito?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <p className="text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Funil
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PUBLICOS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={mutacao.isPending}
              onClick={() => p.value !== publico && mutacao.mutate({ publico: p.value })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                p.value === publico
                  ? "border-foreground bg-foreground font-medium text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <p className="text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Etapa
        </p>
        <div className="grid gap-0.5">
          {colunas.map((c) => {
            const atual = c.id === lead.stage;
            return (
              <button
                key={c.id}
                type="button"
                disabled={mutacao.isPending}
                onClick={() => !atual && mutacao.mutate({ etapa: c.id })}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  atual ? "bg-surface-subtle font-medium" : "hover:bg-surface-subtle",
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
                <span className="flex-1 truncate">{c.nome}</span>
                {atual && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-2xs text-muted-foreground">
          {lead.etapaManual ? "Etapa escolhida à mão." : "Etapa automática."}
        </p>
        <button
          type="button"
          disabled={mutacao.isPending}
          onClick={() => mutacao.mutate({ publico: null, etapa: null })}
          className="text-2xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Voltar ao automático
        </button>
      </div>
    </div>
  );
}

/** O mesmo seletor num balão, aberto pelo ícone do card. */
export function BalaoDePosicao({
  children,
  ...props
}: {
  children: ReactNode;
  lead: LeadNoFunil;
  publico: Publico;
  colunas: RegraDeFunil[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-2xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <SeletorDePosicao {...props} onFeito={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}
