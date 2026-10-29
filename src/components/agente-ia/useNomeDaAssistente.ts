import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getNomeDaAssistente } from "@/lib/agente-ia/agente.functions";

/** O nome da assistente deste consultório. "Luna" enquanto carrega, que é
 *  também o padrão de quem não escolheu outro. */
export function useNomeDaAssistente(): string {
  const buscar = useServerFn(getNomeDaAssistente);
  const { data } = useQuery({
    queryKey: ["nome-da-assistente"],
    queryFn: () => buscar(),
    staleTime: 5 * 60_000,
  });
  return data ?? "Luna";
}
