import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { avisosPorAgendamento } from "@/lib/notifications/inbox.functions";

/** Agendamentos com aviso da equipe em aberto.
 *
 *  Hook, e não prop vinda da rota, porque o calendário do desktop e a agenda do
 *  celular precisam do mesmo conjunto e não compartilham pai — passar por prop
 *  significaria enfiar o dado em duas cadeias de componentes que não têm nada a
 *  ver com aviso. A chave é compartilhada, então as duas telas usam a mesma
 *  resposta em cache.
 *
 *  Devolve um Set porque o uso é sempre "este agendamento tem aviso?", dentro
 *  do laço que desenha os blocos. */
export function useAvisosPorAgendamento(): Set<string> {
  const buscar = useServerFn(avisosPorAgendamento);
  const { data } = useQuery({
    queryKey: ["clinic-notifications", "por-agendamento"],
    queryFn: () => buscar(),
    staleTime: 30_000,
  });
  return new Set(data ?? []);
}
