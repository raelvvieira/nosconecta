import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAtendimento, salvarAtendimento } from "@/lib/agente-ia/agente.functions";

/**
 * A configuração do agente, e como gravá-la.
 *
 * Os quatro blocos da tela (chave, modo, com quem fala, ritmo) leem e escrevem
 * a MESMA linha de `ai_agents`. Cada um chamando `useQuery` por conta própria
 * daria quatro cópias do estado que podem divergir por um instante — o react-
 * query junta tudo pela chave, então a consulta é uma só e todos veem o mesmo.
 *
 * `gravar` recebe só os campos que mudaram. Mandar o objeto inteiro faria um
 * bloco sobrescrever o que outro acabou de salvar.
 */
export function useAtendimento() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getAtendimento);
  const salvar = useServerFn(salvarAtendimento);

  const query = useQuery({ queryKey: ["agente-ia-atendimento"], queryFn: () => buscar() });

  const gravar = async (campos: Parameters<typeof salvar>[0]["data"]) => {
    try {
      await salvar({ data: campos });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-atendimento"] });
      // O estado do agente mostra se há chave; salvar uma sem invalidar aqui
      // deixaria o aviso de "falta a chave" na tela depois de ela existir.
      await queryClient.invalidateQueries({ queryKey: ["agente-ia"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return { config: query.data, carregando: query.isPending, gravar };
}
