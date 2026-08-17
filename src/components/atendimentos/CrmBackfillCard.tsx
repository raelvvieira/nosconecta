import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backfillCrmContactLinks, fixMissingCountryCodePhones } from "@/lib/patients/patients.functions";

/**
 * Ações de manutenção, não métricas do dia a dia — por isso ficam discretas
 * (sem KPI, sem polling), diferente do resto do dashboard.
 */
export function CrmBackfillCard() {
  const backfill = useServerFn(backfillCrmContactLinks);
  const fixPhones = useServerFn(fixMissingCountryCodePhones);
  const [resultadoBackfill, setResultadoBackfill] = useState<string | null>(null);
  const [resultadoFix, setResultadoFix] = useState<string | null>(null);

  const backfillMutation = useMutation({
    mutationFn: () => backfill(),
    onSuccess: (r) => {
      setResultadoBackfill(
        r.pacientesSemVinculo === 0
          ? "Nenhum paciente sem vínculo com o CRM."
          : `${r.linkados} de ${r.pacientesSemVinculo} pacientes vinculados.${
              r.baseTruncada ? " A base de contatos do CRM é grande e pode não ter sido varrida inteira." : ""
            }`,
      );
      toast.success("Vínculos atualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fixMutation = useMutation({
    mutationFn: () => fixPhones(),
    onSuccess: (r) => {
      setResultadoFix(
        r.corrigidos === 0
          ? "Nenhum telefone sem código do país encontrado."
          : `${r.corrigidos} telefone(s) corrigido(s). Rode "Vincular pacientes ao CRM" de novo pra ligar o contato certo.`,
      );
      toast.success("Telefones corrigidos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface-card p-5 space-y-5">
      <div>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-info-soft text-info">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Vincular pacientes ao CRM</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Liga cada paciente "sem conversa" ao contato que já existe no CRM com o mesmo telefone — deixa o
              disparo pra eles rápido, em vez de procurar o vínculo na hora.
            </p>
            {resultadoBackfill && <p className="mt-2 text-xs font-medium text-foreground">{resultadoBackfill}</p>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full"
          onClick={() => backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
        >
          {backfillMutation.isPending ? "Vinculando…" : "Rodar agora"}
        </Button>
      </div>

      <div className="border-t border-border pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warning-soft text-warning">
            <PhoneCall className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Corrigir telefones sem código do país</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Telefone salvo sem o "55" na frente (ex.: DDD 51 sem o país) faz o CRM confundir o DDD com o código
              de outro país e criar um contato pro qual o disparo nunca entrega. Corrige e esquece o vínculo
              antigo, pra ser refeito certo.
            </p>
            {resultadoFix && <p className="mt-2 text-xs font-medium text-foreground">{resultadoFix}</p>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full"
          onClick={() => fixMutation.mutate()}
          disabled={fixMutation.isPending}
        >
          {fixMutation.isPending ? "Corrigindo…" : "Rodar agora"}
        </Button>
      </div>
    </div>
  );
}
