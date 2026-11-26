import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MenuDeOrigem } from "@/components/atendimentos/chat/OrigemDoLead";
import { definirOrigemDoLead } from "@/lib/atendimentos/atendimentos.functions";
import { getOrigemDoPaciente } from "@/lib/atendimentos/origem.functions";
import type { OrigemDoLead } from "@/lib/atendimentos/origem-do-lead";

/**
 * "Origem do lead" no card de agendamento: de onde a pessoa veio, para a
 * recepção marcar na hora em que agenda.
 *
 * Já chega preenchida quando o WhatsApp provou (clique em anúncio da Meta, ou a
 * frase pronta do botão do site); a recepção corrige se for outra. A escolha vale
 * para a PESSOA, não para este horário: é a mesma que aparece no chat.
 *
 * Só aparece quando dá para identificar quem é: paciente com ficha, ou um
 * telefone válido. Sem isso não há onde guardar a escolha.
 */
export function OrigemNoAgendamento({
  patientId,
  phone,
}: {
  patientId?: string | null;
  /** Telefone válido de quem ainda não tem ficha (ou do contato do chat). */
  phone?: string | null;
}) {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getOrigemDoPaciente);
  const definir = useServerFn(definirOrigemDoLead);
  const chave = ["origem-do-paciente", patientId ?? null, phone ?? null] as const;

  const { data } = useQuery({
    queryKey: chave,
    queryFn: () => buscar({ data: { patientId: patientId ?? null, phone: phone ?? null } }),
    enabled: Boolean(patientId || phone),
    staleTime: 30_000,
  });

  const mutacao = useMutation({
    mutationFn: (origem: OrigemDoLead | null) =>
      definir({
        data: {
          phone: data?.phone ?? phone ?? null,
          conversationId: patientId ? `paciente:${patientId}` : `telefone:${phone}`,
          origem,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["origem-do-paciente"] });
      // O mesmo número aparece na caixa de entrada com a bolinha da origem.
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar a origem"),
  });

  if (!patientId && !phone) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground-secondary">Origem do lead</span>
      {data ? (
        <MenuDeOrigem
          origem={data}
          onEscolher={(o) => mutacao.mutate(o)}
          compacto={false}
          className={mutacao.isPending ? "opacity-60" : undefined}
        />
      ) : (
        <span className="h-8 w-28 animate-pulse rounded-full bg-muted/50" aria-hidden />
      )}
    </div>
  );
}
