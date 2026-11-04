import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettings } from "@/lib/settings/settings.functions";

/** Os profissionais ativos. Mesma consulta (e mesma chave de cache) da Agenda. */
export function useProfissionaisAtivos() {
  const buscar = useServerFn(getSettings);
  const consulta = useQuery({
    queryKey: ["settings"],
    queryFn: () => buscar(),
    staleTime: 15_000,
  });
  return (consulta.data?.professionals ?? [])
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name }));
}
