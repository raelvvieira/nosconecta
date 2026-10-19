import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adicionarDiaDaUnidade,
  definirModoDaUnidade,
  listarDiasDasUnidades,
  removerDiaDaUnidade,
  type DiaDaUnidade,
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
        content: "Em que dias cada unidade atende, quando ela não atende toda semana.",
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

  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
          <CalendarRange className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
          Dias de viagem
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Quando uma unidade não atende toda semana — como Porto Alegre, onde a Dra. Mariane vai de
          tempo em tempo — marque aqui os dias de atendimento. A Luna só oferece horário dessa
          unidade nesses dias.
        </p>
      </header>

      {/* O aviso fica na tela porque a consequência é invisível: uma unidade
          "aberta toda semana" tem vaga livre em todo dia do calendário, e quem
          recebe a oferta é uma pessoa de outra cidade. */}
      <p className="mt-5 max-w-prose rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
        Uma unidade marcada por dias e sem nenhum dia na lista fica sem horário para oferecer: a
        Luna diz que vai confirmar as próximas datas com a equipe, em vez de oferecer um dia em que
        ninguém está lá.
      </p>

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
      ) : unidades.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhuma unidade ativa cadastrada.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {unidades.map((u) => (
            <CartaoDaUnidade
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

function CartaoDaUnidade({
  unidade,
  invalidar,
}: {
  unidade: UnidadeComDias;
  invalidar: () => void;
}) {
  const doModo = useServerFn(definirModoDaUnidade);
  const doAdicionar = useServerFn(adicionarDiaDaUnidade);
  const doRemover = useServerFn(removerDiaDaUnidade);
  const [data, setData] = useState("");
  const [nota, setNota] = useState("");

  const modo = useMutation({
    mutationFn: (porData: boolean) => doModo({ data: { unitId: unidade.id, porData } }),
    onSuccess: (_r, porData) => {
      toast.success(
        porData
          ? `${unidade.nome} passa a atender só nos dias marcados.`
          : `${unidade.nome} volta a atender todos os dias da semana configurados.`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adicionar = useMutation({
    mutationFn: () => doAdicionar({ data: { unitId: unidade.id, date: data, note: nota } }),
    onSuccess: () => {
      toast.success("Dia marcado.");
      setData("");
      setNota("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (d: DiaDaUnidade) => doRemover({ data: { id: d.id } }),
    onSuccess: () => {
      toast.success("Dia removido.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <article className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{unidade.nome}</h2>
          {unidade.endereco ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{unidade.endereco}</p>
          ) : null}
        </div>
        <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <Switch
            checked={unidade.porData}
            disabled={modo.isPending}
            onCheckedChange={(v) => modo.mutate(v === true)}
            aria-label={`${unidade.nome}: atender só nos dias marcados`}
          />
          Só nos dias marcados
        </label>
      </div>

      {unidade.porData ? (
        <div className="mt-4 border-t border-border pt-4">
          {unidade.dias.length === 0 ? (
            <p className="text-xs text-warning">
              Nenhum dia marcado de hoje em diante — a Luna não oferece horário desta unidade.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {unidade.dias.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                >
                  <span className="min-w-0 text-sm">
                    {porExtenso(d.date)}
                    {d.note ? (
                      <span className="ml-2 text-xs text-muted-foreground">{d.note}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover ${porExtenso(d.date)}`}
                    disabled={remover.isPending}
                    onClick={() => remover.mutate(d)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (data) adicionar.mutate();
            }}
          >
            <div className="min-w-[9.5rem]">
              <Label htmlFor={`data-${unidade.id}`} className="text-2xs">
                Dia de atendimento
              </Label>
              <Input
                id={`data-${unidade.id}`}
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="min-w-[11rem] flex-1">
              <Label htmlFor={`nota-${unidade.id}`} className="text-2xs">
                Observação (opcional)
              </Label>
              <Input
                id={`nota-${unidade.id}`}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="volta no mesmo dia"
                className="mt-1"
              />
            </div>
            <Button type="submit" variant="premium" disabled={!data || adicionar.isPending}>
              <Plus className="h-4 w-4" /> Marcar
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Atende nos dias da semana configurados na agenda. É o normal para a unidade onde a equipe
          está todos os dias.
        </p>
      )}
    </article>
  );
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

/** "2026-11-12" → "quinta-feira, 12/11". Sem passar por fuso: a data aqui é um
 *  rótulo de calendário, e `new Date("2026-11-12")` em UTC vira dia 11 à noite
 *  no Brasil — o dia errado na tela. */
function porExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay();
  return `${DIAS[semana]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
