import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Sidebar } from "@/components/finance/Sidebar";
import { PainelDeGestao } from "@/components/gestao/PainelDeGestao";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { clinicTodayStr } from "@/lib/date";
import { getVisaoDeGestao, salvarMetaDeFaturamento } from "@/lib/gestao/gestao.functions";

// A Gestão: o painel do administrador. Fora do Financeiro de propósito — o
// nível Financeiro vê os lançamentos, mas lucro, margem e crescimento do
// negócio inteiro são do administrador (ver `AREAS_DO_NIVEL`).

const searchSchema = z.object({
  /** "AAAA-MM". Sem ele, o mês corrente. */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  /** Uma unidade; sem ela, todas. */
  unidade: z.string().uuid().optional(),
});

export const Route = createFileRoute("/gestao")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gestão · NÓS Conecta" },
      { name: "description", content: "Resultado, eficiência e crescimento da clínica." },
    ],
  }),
  validateSearch: searchSchema,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar a gestão" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: GestaoPage,
});

function GestaoPage() {
  const { mes: mesDaUrl, unidade } = Route.useSearch();
  const navigate = Route.useNavigate();
  const mesMaximo = clinicTodayStr().slice(0, 7);
  const mes = mesDaUrl ?? mesMaximo;

  const buscar = useServerFn(getVisaoDeGestao);
  const gravarMeta = useServerFn(salvarMetaDeFaturamento);
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: ["gestao", mes, unidade ?? "todas"],
    queryFn: () => buscar({ data: { mes, unitId: unidade ?? null } }),
    // Trocar de mês mantém o painel anterior na tela, esmaecido, até o novo
    // chegar — sem piscar para um esqueleto a cada clique.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  useEffect(() => {
    document.title = "Gestão · NÓS Conecta";
  }, []);

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="custom-scroll sem-arrasto-lateral min-w-0 flex-1 overflow-y-auto px-4 py-6 pb-nav md:px-6 md:py-8 lg:px-10 lg:pb-12">
        <PainelDeGestao
          dados={consulta.data ?? null}
          carregando={consulta.isFetching}
          erro={consulta.error instanceof Error ? consulta.error.message : null}
          mesMaximo={mesMaximo}
          onMes={(m) =>
            navigate({ search: (prev) => ({ ...prev, mes: m === mesMaximo ? undefined : m }) })
          }
          onMeta={async (valor) => {
            await gravarMeta({ data: { valor } });
            await queryClient.invalidateQueries({ queryKey: ["gestao"] });
          }}
          onUnidade={(id) =>
            navigate({ search: (prev) => ({ ...prev, unidade: id ?? undefined }) })
          }
          acaoDoCaixa={
            <Link
              to="/configuracoes/contas"
              className="font-medium text-warning underline-offset-2 hover:underline"
            >
              Informe o saldo das contas
            </Link>
          }
        />
      </main>
    </div>
  );
}
