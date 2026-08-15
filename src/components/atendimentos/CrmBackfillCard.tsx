import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backfillCrmContactLinks } from "@/lib/patients/patients.functions";

/**
 * Ação de manutenção, não uma métrica do dia a dia — por isso fica discreta
 * (sem KPI, sem polling), diferente do resto do dashboard. Existe porque
 * disparar pra um paciente "sem conversa" cujo telefone já é um contato no
 * CRM (comum numa clínica que já recebia WhatsApp antes deste sistema) é
 * lento na hora do disparo — vale rodar isto uma vez em vez de deixar cada
 * disparo pagar essa varredura.
 */
export function CrmBackfillCard() {
  const backfill = useServerFn(backfillCrmContactLinks);
  const [resultado, setResultado] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => backfill(),
    onSuccess: (r) => {
      setResultado(
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

  return (
    <div className="surface-card p-5">
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
          {resultado && <p className="mt-2 text-xs font-medium text-foreground">{resultado}</p>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Vinculando…" : "Rodar agora"}
      </Button>
    </div>
  );
}
