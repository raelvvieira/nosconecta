import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Calendar } from "@/components/ui/calendar";
import { localDateStr } from "@/lib/date";
import {
  definirDiasDaUnidade,
  listarDiasDasUnidades,
  type UnidadeComDias,
} from "@/lib/settings/dias-da-unidade.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/dias-de-viagem")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Dias de viagem · Configurações · NÓS Conecta" },
      {
        name: "description",
        content: "Em que dias a Dra. atende na outra unidade.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar os dias de viagem"
      description="Houve uma falha ao buscar as unidades. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: DiasDeViagemPage,
});

const SEM_UNIDADES: UnidadeComDias[] = [];
const CHAVE = ["dias-das-unidades"];

function DiasDeViagemPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarDiasDasUnidades);
  // `retry: false` de propósito: a falha esperada aqui é a tabela ainda não
  // existir, e nenhuma tentativa a mais resolve isso. Com as três tentativas
  // padrão a tela fica dez segundos em "Carregando…" para só então dizer o que
  // está errado — foi o que a clínica viu antes de a migration ser aplicada.
  const unidadesQuery = useQuery({ queryKey: CHAVE, queryFn: () => buscar(), retry: false });
  const unidades = unidadesQuery.data ?? SEM_UNIDADES;

  // A unidade principal não ganha calendário. Foi o pedido da clínica, e é a
  // leitura certa do problema: ela atende todos os dias, e o que não estiver
  // marcado nas outras é dela.
  const principal = unidades.find((u) => u.principal) ?? null;
  const deViagem = unidades.filter((u) => !u.principal);

  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
          <CalendarRange className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
          Dias de viagem
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Marque no calendário os dias em que a Dra. Mariane atende na outra unidade. A Luna só
          oferece horário de lá nesses dias
          {principal ? (
            <>
              {" "}
              — o que não estiver marcado é {semONos(principal.nome)}, que atende normalmente todos
              os dias da agenda
            </>
          ) : null}
          .
        </p>
      </header>

      {unidadesQuery.isPending ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
      ) : unidadesQuery.isError ? (
        // A falha esperada é uma só: a migration que cria a tabela dos dias e a
        // coluna do modo ainda não foi aplicada — o Lovable aplica isso num
        // passo manual, depois do push. Dizer "nenhuma unidade cadastrada" aqui
        // seria mentir sobre um cadastro que existe.
        <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <CalendarRange className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">Esta tela ainda não está pronta para uso</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            Ela depende de uma atualização do banco que ainda não foi aplicada. No Lovable, mande{" "}
            <span className="font-medium text-foreground">“Apply pending Supabase migrations”</span>{" "}
            e recarregue esta página.
          </p>
          <p className="mx-auto mt-3 max-w-md break-words text-2xs text-muted-foreground/70">
            {(unidadesQuery.error as Error)?.message}
          </p>
        </div>
      ) : deViagem.length === 0 ? (
        <p className="mt-8 max-w-prose text-sm text-muted-foreground">
          A clínica tem uma unidade só, que atende todos os dias da agenda. Não há dias de viagem a
          marcar.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {deViagem.map((u) => (
            <CalendarioDaUnidade
              key={u.id}
              unidade={u}
              invalidar={() => queryClient.invalidateQueries({ queryKey: CHAVE })}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function CalendarioDaUnidade({
  unidade,
  invalidar,
}: {
  unidade: UnidadeComDias;
  invalidar: () => void;
}) {
  const doDefinir = useServerFn(definirDiasDaUnidade);
  // O que está na tela enquanto o servidor confirma. Sem isto, cada clique
  // esperaria a ida e a volta para o dia aparecer marcado, e marcar uma viagem
  // de cinco dias seria cinco esperas.
  const [rascunho, setRascunho] = useState<string[] | null>(null);
  const marcados = rascunho ?? unidade.dias.map((d) => d.date);

  const salvar = useMutation({
    mutationFn: (dates: string[]) => doDefinir({ data: { unitId: unidade.id, dates } }),
    onSuccess: () => invalidar(),
    onError: (e: Error) => {
      toast.error(e.message);
      // Volta para o que o banco tem: deixar na tela um dia que não foi gravado
      // faria a clínica contar com uma viagem que a Luna não conhece.
      setRascunho(null);
      invalidar();
    },
  });

  const selecionados = useMemo(() => marcados.map(paraData), [marcados]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const trocar = (datas: Date[] | undefined) => {
    const dates = [...new Set((datas ?? []).map(localDateStr))].sort();
    setRascunho(dates);
    salvar.mutate(dates);
  };

  return (
    <article className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{unidade.nome}</h2>
          {unidade.endereco ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{unidade.endereco}</p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {salvar.isPending
            ? "Salvando…"
            : marcados.length === 0
              ? "Nenhum dia marcado"
              : `${marcados.length} ${marcados.length === 1 ? "dia marcado" : "dias marcados"}`}
        </p>
      </div>

      <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* Dois meses lado a lado: uma viagem costuma atravessar a virada do
            mês, e com um mês só isso vira navegar para frente e para trás. No
            celular, rola na horizontal. */}
        <div className="-mx-1 overflow-x-auto">
          <Calendar
            mode="multiple"
            locale={ptBR}
            numberOfMonths={2}
            selected={selecionados}
            onSelect={trocar}
            disabled={{ before: hoje }}
            className="p-0"
          />
        </div>

        <div className="min-w-0">
          {marcados.length === 0 ? (
            <p className="rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
              Sem nenhum dia marcado, a Luna não oferece horário desta unidade: ela diz que vai
              confirmar as próximas datas com a equipe, em vez de oferecer um dia em que ninguém
              está lá.
            </p>
          ) : (
            <>
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Dias de atendimento
              </p>
              <ul className="mt-2 space-y-1">
                {marcados.map((d) => (
                  <li key={d} className="text-sm">
                    {porExtenso(d)}
                    {nota(unidade, d) ? (
                      <span className="ml-2 text-xs text-muted-foreground">{nota(unidade, d)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Clique num dia do calendário para marcar, e de novo para desmarcar. Remover um dia
                não desmarca quem já tem consulta nele — só impede a Luna de oferecer horário novo
                ali.
              </p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function nota(unidade: UnidadeComDias, date: string): string {
  return unidade.dias.find((d) => d.date === date)?.note ?? "";
}

/** "NÓS Porto Alegre" → "Porto Alegre". */
function semONos(nome: string): string {
  return nome.replace(/^N[ÓO]S\s+/i, "").trim() || nome;
}

/** "2026-11-12" → `Date` da meia-noite LOCAL. `new Date("2026-11-12")` sozinho
 *  é interpretado em UTC e, no Brasil, cai no dia 11 à noite — o calendário
 *  marcaria o dia errado. */
function paraData(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "2026-11-12" → "quinta-feira, 12/11". Sem passar por fuso, pelo mesmo motivo
 *  de `paraData`. */
function porExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay();
  return `${DIAS[semana]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
