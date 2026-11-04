import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import { z } from "zod";
import { PageHeading } from "@/components/layout/PageHeading";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { WhatsappConnectionCard } from "@/components/atendimentos/WhatsappConnectionCard";
import {
  FiltroDoPeriodo,
  PainelDoAtendimento,
} from "@/components/atendimentos/painel/PainelDoAtendimento";
import { getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import { getFunilDeLeads } from "@/lib/atendimentos/funis.functions";
import { getPainelDoAtendimento, getPicoDaSemana } from "@/lib/atendimentos/painel.functions";
import { PUBLICOS } from "@/lib/atendimentos/publico";

const searchSchema = z.object({
  /** Sem ele, "hoje". */
  periodo: z.enum(["hoje", "ontem", "7d", "30d", "mes", "mes_passado", "90d"]).optional(),
  funil: z.enum(PUBLICOS.map((p) => p.value) as [string, ...string[]]).optional(),
});

export const Route = createFileRoute("/atendimentos/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Dashboard · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Conversas, tempo de resposta e funil do WhatsApp." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o dashboard"
      description="Houve uma falha ao buscar as métricas de atendimento. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: DashboardPage,
});

function DashboardPage() {
  const { periodo = "hoje", funil: funilDaUrl } = Route.useSearch();
  const publico = (PUBLICOS.find((p) => p.value === funilDaUrl)?.value ??
    PUBLICOS[0].value) as (typeof PUBLICOS)[number]["value"];
  const navigate = Route.useNavigate();

  const buscarPainel = useServerFn(getPainelDoAtendimento);
  const buscarPico = useServerFn(getPicoDaSemana);
  const buscarFunil = useServerFn(getFunilDeLeads);
  const buscarUso = useServerFn(getDailySendUsage);

  const painel = useQuery({
    queryKey: ["painel-atendimento", periodo],
    queryFn: () => buscarPainel({ data: { filtro: periodo } }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const pico = useQuery({
    queryKey: ["painel-atendimento-pico"],
    queryFn: () => buscarPico(),
    staleTime: 10 * 60_000,
  });
  const funil = useQuery({
    queryKey: ["painel-atendimento-funil", publico],
    queryFn: () => buscarFunil({ data: { publico } }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const uso = useQuery({
    queryKey: ["campaigns-usage"],
    queryFn: () => buscarUso(),
    staleTime: 15_000,
  });

  if (painel.error && !painel.data) throw painel.error;

  return (
    <main className="flex flex-1 flex-col pb-nav lg:pb-8">
      <PageHeading
        className="px-4 pb-4 pt-6 sm:px-6 lg:px-10 lg:pt-7"
        icon={LayoutDashboard}
        title="Dashboard"
        actions={
          <FiltroDoPeriodo
            valor={periodo}
            onChange={(f) =>
              navigate({
                to: "/atendimentos",
                search: (prev) => ({ ...prev, periodo: f === "hoje" ? undefined : f }),
              })
            }
          />
        }
      />
      <div className="px-4 sm:px-6 lg:px-10">
        <PainelDoAtendimento
          dados={painel.data ?? null}
          pico={pico.data ?? null}
          funil={funil.data ?? null}
          atualizando={painel.isFetching && painel.isPlaceholderData}
          publico={publico}
          onPublico={(p) =>
            navigate({
              search: (prev) => ({ ...prev, funil: p === PUBLICOS[0].value ? undefined : p }),
            })
          }
          lateral={<WhatsappConnectionCard dailyUsage={uso.data} />}
        />
      </div>
    </main>
  );
}
