import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { avisosPorAgendamento } from "@/lib/notifications/inbox.functions";
import type { TipoDeAviso } from "./tipo-do-aviso";

/** Agendamentos com aviso da equipe em aberto.
 *
 *  Hook, e não prop vinda da rota, porque o calendário do desktop e a agenda do
 *  celular precisam do mesmo conjunto e não compartilham pai — passar por prop
 *  significaria enfiar o dado em duas cadeias de componentes que não têm nada a
 *  ver com aviso. A chave é compartilhada, então as duas telas usam a mesma
 *  resposta em cache.
 *
 *  Devolve um Map, e não um Set: a pergunta não é só "tem aviso?", é "aviso
 *  de quê?". Com Set, as duas telas escreviam "pediu remarcar" em cima de
 *  qualquer aviso — e quase todo aviso é outra coisa. */
export function useAvisosPorAgendamento(): Map<string, TipoDeAviso> {
  const buscar = useServerFn(avisosPorAgendamento);
  const { data } = useQuery({
    queryKey: ["clinic-notifications", "por-agendamento"],
    queryFn: () => buscar(),
    staleTime: 30_000,
  });
  return new Map((data ?? []).map((a) => [a.appointmentId, a.tipo]));
}
