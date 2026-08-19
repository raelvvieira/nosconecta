import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { getFinanceOverview } from "@/lib/finance/queries.functions";
import { getHomeToday } from "@/lib/agenda/agenda.functions";
import { montarDadosHome, type HomeData } from "@/components/home/home-data";

// A tela inicial aparece em dois lugares (`/inicio` e o modo celular de
// `/financeiro`). Buscar aqui, e não em cada rota, é o que garante que as duas
// mostrem exatamente o mesmo número.

export const homeOverviewOptions = (
  fetcher: (args: { data: { period: "today"; granularity: "daily" } }) => Promise<any>,
) =>
  queryOptions({
    queryKey: ["home-overview", "today"],
    queryFn: () => fetcher({ data: { period: "today", granularity: "daily" } }),
    staleTime: 30_000,
  });

export const homeTodayOptions = (fetcher: () => Promise<any>) =>
  queryOptions({
    queryKey: ["home-today"],
    queryFn: () => fetcher(),
    staleTime: 30_000,
  });

/** `null` enquanto qualquer uma das duas consultas ainda não respondeu — a
 *  tela prefere não mostrar número nenhum a mostrar um número pela metade. */
export function useHomeData(): HomeData | null {
  const fetchOverview = useServerFn(getFinanceOverview);
  const fetchToday = useServerFn(getHomeToday);

  const overview = useQuery(homeOverviewOptions(fetchOverview as any));
  const today = useQuery(homeTodayOptions(fetchToday as any));

  return useMemo(
    () => (overview.data && today.data ? montarDadosHome(overview.data, today.data) : null),
    [overview.data, today.data],
  );
}
