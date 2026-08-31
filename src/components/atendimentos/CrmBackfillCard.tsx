import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, PhoneCall, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  backfillCrmContactLinks,
  fixMissingCountryCodePhones,
} from "@/lib/patients/patients.functions";
import { cn } from "@/lib/utils";

/**
 * Ações de manutenção, não métricas do dia a dia — por isso ficam discretas
 * (sem KPI, sem polling), diferente do resto do dashboard.
 *
 * São dois cards, e não um com dois blocos separados por linha: as duas ações
 * são independentes, cada uma com o próprio resultado, e empilhá-las dentro de
 * um cartão só obrigava a caixa a ser estreita para o texto caber — o que
 * deixava metade da largura do dashboard vazia ao lado dela.
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
              r.baseTruncada
                ? " A base de contatos do CRM é grande e pode não ter sido varrida inteira."
                : ""
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
    <>
      <CardDeManutencao
        icone={Link2}
        tom="info"
        titulo="Vincular pacientes ao CRM"
        descricao='Liga cada paciente "sem conversa" ao contato que já existe no CRM com o mesmo telefone — deixa o disparo pra eles rápido, em vez de procurar o vínculo na hora.'
        resultado={resultadoBackfill}
        rodando={backfillMutation.isPending}
        rotuloRodando="Vinculando…"
        onRodar={() => backfillMutation.mutate()}
      />
      <CardDeManutencao
        icone={PhoneCall}
        tom="warning"
        titulo="Corrigir telefones sem código do país"
        descricao='Telefone salvo sem o "55" na frente (ex.: DDD 51 sem o país) faz o CRM confundir o DDD com o código de outro país e criar um contato pro qual o disparo nunca entrega. Corrige e esquece o vínculo antigo, pra ser refeito certo.'
        resultado={resultadoFix}
        rodando={fixMutation.isPending}
        rotuloRodando="Corrigindo…"
        onRodar={() => fixMutation.mutate()}
      />
    </>
  );
}

function CardDeManutencao({
  icone: Icone,
  tom,
  titulo,
  descricao,
  resultado,
  rodando,
  rotuloRodando,
  onRodar,
}: {
  icone: LucideIcon;
  tom: "info" | "warning";
  titulo: string;
  descricao: string;
  resultado: string | null;
  rodando: boolean;
  rotuloRodando: string;
  onRodar: () => void;
}) {
  return (
    <div className="surface-card flex h-full flex-col p-5">
      {/* `flex-1` no bloco de texto: as duas descrições têm alturas diferentes,
          e sem isso os botões ficariam em alturas diferentes lado a lado. */}
      <div className="flex flex-1 items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
            tom === "info" ? "bg-info-soft text-info" : "bg-warning-soft text-warning",
          )}
        >
          <Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{descricao}</p>
          {resultado && <p className="mt-2 text-xs font-medium text-foreground">{resultado}</p>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        onClick={onRodar}
        disabled={rodando}
      >
        {rodando ? rotuloRodando : "Rodar agora"}
      </Button>
    </div>
  );
}
