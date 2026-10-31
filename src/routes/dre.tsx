import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Sigma, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { z } from "zod";
import { Sidebar } from "@/components/finance/Sidebar";
import { PageHeading } from "@/components/layout/PageHeading";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/finance/format";
import { localDateStr } from "@/lib/date";
import { mesDoDia, rotuloDoMes } from "@/lib/finance/mes";
import {
  GRUPOS_DRE,
  percentualDaReceita,
  soma,
  variacao,
  type GrupoDre,
  type Regime,
} from "@/lib/finance/dre";
import {
  definirGrupoDaCategoria,
  getDre,
  getLancamentosDaCelula,
  type CategoriaDoDre,
} from "@/lib/finance/dre.functions";

// O DRE: a demonstração de resultado, mês a mês.
//
// Responde a pergunta que Recebimentos e Pagamentos não respondem sozinhos:
// "a operação se paga?". Receita, menos o que varia com o movimento, menos o
// que existe mesmo sem paciente, menos juros e impostos. O investimento na
// montagem da clínica fica numa linha à parte, fora do resultado — dentro
// dele, todo mês de 2026 pareceria prejuízo.
//
// Cada valor traz quanto mudou em relação ao mês anterior (vermelho quando o
// gasto sobe, verde quando desce; na receita e nos resultados é o contrário)
// e uma setinha que abre o que compõe aquele valor. Para a variação do
// primeiro mês visível, o servidor busca um mês a mais do que a tela mostra.

const searchSchema = z.object({
  regime: z.enum(["caixa", "competencia"]).optional(),
  meses: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
});

export const Route = createFileRoute("/dre")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "DRE · Financeiro · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o DRE" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: DrePage,
});

type Meses = 1 | 3 | 6 | 12;

function valor(n: number, zeroVazio = true): string {
  if (zeroVazio && n === 0) return "—";
  return formatBRL(n);
}

function DrePage() {
  const { regime = "caixa", meses = 6 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const hoje = localDateStr();
  const ate = mesDoDia(hoje);
  const buscar = useServerFn(getDre);
  // Um mês a mais do que a tela mostra, para a variação do primeiro.
  const dre = useQuery({
    queryKey: ["dre", ate, meses + 1, regime],
    queryFn: () => buscar({ data: { ate, meses: meses + 1, regime } }),
    staleTime: 60_000,
  });
  const [classificando, setClassificando] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ despesa_fixa: true });

  const dados = dre.data?.dre;
  // A primeira coluna buscada é só a base da variação: não aparece.
  const colunas = dados?.meses.slice(1) ?? [];
  const visivel = (v: number[]) => v.slice(1);
  const receitaTotal = dados ? soma(visivel(dados.linhas.receita.porMes)) : 0;
  const semGrupo = dre.data?.categorias.filter((c) => !c.grupo).length ?? 0;

  const mudar = (patch: { regime?: "caixa" | "competencia"; meses?: Meses }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="custom-scroll sem-arrasto-lateral min-w-0 flex-1 overflow-y-auto px-4 py-6 pb-nav md:px-6 md:py-8 lg:px-10 lg:pb-8">
        <PageHeading
          icon={Sigma}
          title="DRE"
          subtitle="Resultado da operação, mês a mês."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Segmentado
                valor={regime}
                opcoes={[
                  ["caixa", "Caixa"],
                  ["competencia", "Competência"],
                ]}
                onMudar={(v) => mudar({ regime: v as "caixa" | "competencia" })}
                ajuda="Caixa conta o que foi pago, no dia do pagamento. Competência conta pelo vencimento, pago ou não."
              />
              <Segmentado
                valor={String(meses)}
                opcoes={[
                  ["1", "Este mês"],
                  ["3", "3 meses"],
                  ["6", "6 meses"],
                  ["12", "12 meses"],
                ]}
                onMudar={(v) => mudar({ meses: Number(v) as Meses })}
              />
              <Button
                variant="outline"
                className="h-9 gap-2 rounded-full"
                onClick={() => setClassificando(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Categorias
                {semGrupo > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1 text-2xs font-bold text-white">
                    {semGrupo}
                  </span>
                )}
              </Button>
            </div>
          }
        />

        {dre.isLoading || !dados ? (
          <p className="mt-6 text-sm text-muted-foreground">Montando o DRE…</p>
        ) : (
          <>
            {/* O resultado do período, de relance. */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile rotulo="Receita" valor={receitaTotal} />
              <Tile
                rotulo="Margem de contribuição"
                valor={soma(visivel(dados.margemDeContribuicao))}
                pct={percentualDaReceita(soma(visivel(dados.margemDeContribuicao)), receitaTotal)}
              />
              <Tile
                rotulo="Resultado operacional"
                valor={soma(visivel(dados.resultadoOperacional))}
                pct={percentualDaReceita(soma(visivel(dados.resultadoOperacional)), receitaTotal)}
                comSinal
              />
              <Tile
                rotulo="Resultado líquido"
                valor={soma(visivel(dados.resultadoLiquido))}
                pct={percentualDaReceita(soma(visivel(dados.resultadoLiquido)), receitaTotal)}
                comSinal
                destaque
              />
            </div>

            <section className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-1">
              <div className="custom-scroll overflow-x-auto">
                <table className="w-full min-w-[840px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-card px-5 py-3 text-left font-semibold">
                        &nbsp;
                      </th>
                      {colunas.map((m) => (
                        <th key={m} className="px-3 py-3 text-right font-semibold">
                          {rotuloDoMes(m, hoje)}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LinhaDeGrupo
                      grupo="receita"
                      titulo="Receita"
                      meses={dados.meses}
                      regime={regime}
                      linha={dados.linhas.receita}
                      aberto={!!abertos.receita}
                      onAbrir={() => setAbertos((a) => ({ ...a, receita: !a.receita }))}
                    />
                    <LinhaDeGrupo
                      grupo="custo_variavel"
                      meses={dados.meses}
                      regime={regime}
                      titulo="(−) Custos variáveis"
                      linha={dados.linhas.custo_variavel}
                      aberto={!!abertos.custo_variavel}
                      onAbrir={() =>
                        setAbertos((a) => ({ ...a, custo_variavel: !a.custo_variavel }))
                      }
                    />
                    <LinhaDeTotal
                      titulo="= Margem de contribuição"
                      valores={dados.margemDeContribuicao}
                      receita={dados.linhas.receita.porMes}
                    />
                    <LinhaDeGrupo
                      grupo="despesa_fixa"
                      meses={dados.meses}
                      regime={regime}
                      titulo="(−) Despesas fixas"
                      linha={dados.linhas.despesa_fixa}
                      aberto={!!abertos.despesa_fixa}
                      onAbrir={() => setAbertos((a) => ({ ...a, despesa_fixa: !a.despesa_fixa }))}
                    />
                    <LinhaDeTotal
                      titulo="= Resultado operacional"
                      valores={dados.resultadoOperacional}
                      receita={dados.linhas.receita.porMes}
                      comSinal
                    />
                    <LinhaDeGrupo
                      grupo="financeiro"
                      meses={dados.meses}
                      regime={regime}
                      titulo="(−) Financeiro e impostos"
                      linha={dados.linhas.financeiro}
                      aberto={!!abertos.financeiro}
                      onAbrir={() => setAbertos((a) => ({ ...a, financeiro: !a.financeiro }))}
                    />
                    <LinhaDeTotal
                      titulo="= Resultado líquido"
                      valores={dados.resultadoLiquido}
                      receita={dados.linhas.receita.porMes}
                      comSinal
                      destaque
                    />
                    <tr>
                      <td colSpan={colunas.length + 2} className="h-3 bg-surface-subtle/60" />
                    </tr>
                    <LinhaDeGrupo
                      grupo="investimento"
                      meses={dados.meses}
                      regime={regime}
                      titulo="Investimentos (fora do resultado)"
                      linha={dados.linhas.investimento}
                      aberto={!!abertos.investimento}
                      onAbrir={() => setAbertos((a) => ({ ...a, investimento: !a.investimento }))}
                      apagada
                    />
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border/60 px-5 py-3 text-2xs text-muted-foreground">
                {regime === "caixa"
                  ? "Regime de caixa: só o que já foi pago ou recebido, no dia em que aconteceu."
                  : "Regime de competência: pelo vencimento, pago ou não."}
                {dados.semGrupo > 0 &&
                  ` · ${dados.semGrupo} lançamento${dados.semGrupo === 1 ? "" : "s"} de categoria sem grupo entrou pelo palpite do nome — classifique em "Categorias".`}
              </p>
            </section>
          </>
        )}

        <Sheet open={classificando} onOpenChange={setClassificando}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Categorias no DRE</SheetTitle>
            </SheetHeader>
            <p className="mt-1 text-sm text-muted-foreground">
              Diga de que grupo cada categoria é. É isso que separa o aluguel da cadeira nova.
            </p>
            <Classificador categorias={dre.data?.categorias ?? []} />
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}

function Segmentado({
  valor,
  opcoes,
  onMudar,
  ajuda,
}: {
  valor: string;
  opcoes: [string, string][];
  onMudar: (v: string) => void;
  ajuda?: string;
}) {
  return (
    <div
      className="flex rounded-full border border-border/70 bg-card p-0.5 shadow-1"
      role="group"
      title={ajuda}
    >
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          onClick={() => onMudar(v)}
          aria-pressed={valor === v}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            valor === v
              ? "bg-foreground text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Tile({
  rotulo,
  valor,
  pct,
  comSinal,
  destaque,
}: {
  rotulo: string;
  valor: number;
  pct?: number | null;
  comSinal?: boolean;
  destaque?: boolean;
}) {
  const negativo = comSinal && valor < 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-1",
        destaque && "border-transparent bg-gradient-primary text-white",
      )}
    >
      <span
        className={cn(
          "text-3xs font-medium uppercase tracking-[0.06em]",
          destaque ? "text-white/80" : "text-muted-foreground",
        )}
      >
        {rotulo}
      </span>
      <span
        className={cn(
          "mt-1.5 truncate text-xl font-semibold tabular-nums tracking-tight",
          !destaque && negativo && "text-danger",
          !destaque && comSinal && !negativo && valor > 0 && "text-success",
        )}
      >
        {formatBRL(valor)}
      </span>
      {pct !== undefined && pct !== null && (
        <span className={cn("text-2xs", destaque ? "text-white/80" : "text-muted-foreground")}>
          {pct}% da receita
        </span>
      )}
    </div>
  );
}

/** Quanto mudou em relação ao mês anterior. Nos gastos, subir é ruim
 *  (vermelho); na receita e nos resultados, subir é bom. */
function Delta({
  pct,
  subirEBom,
  neutro,
}: {
  pct: number | null;
  subirEBom?: boolean;
  neutro?: boolean;
}) {
  if (pct === null || pct === 0) return null;
  const subiu = pct > 0;
  const bom = neutro ? null : subirEBom ? subiu : !subiu;
  return (
    <span
      className={cn(
        "ml-1 inline-block min-w-[3.25rem] text-left text-3xs font-medium tabular-nums",
        bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-danger",
      )}
      title="Em relação ao mês anterior"
    >
      {subiu ? "▲" : "▼"} {Math.abs(pct) >= 1000 ? "999+" : Math.abs(pct)}%
    </span>
  );
}

/** Uma célula da tabela: o valor, a variação e a setinha que abre o que
 *  compõe aquele valor. */
function Celula({
  grupo,
  categoriaId,
  mes,
  regime,
  atual,
  anterior,
  subirEBom,
  neutro,
  className,
}: {
  grupo: GrupoDre;
  categoriaId?: string | null;
  mes: string;
  regime: Regime;
  atual: number;
  anterior: number;
  subirEBom?: boolean;
  neutro?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const buscar = useServerFn(getLancamentosDaCelula);
  const itens = useQuery({
    queryKey: ["dre-celula", mes, regime, grupo, categoriaId ?? "todas"],
    queryFn: () => buscar({ data: { mes, regime, grupo, categoriaId } }),
    enabled: aberto,
    staleTime: 60_000,
  });
  if (atual === 0) {
    return <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>—</td>;
  }
  return (
    <td className={cn("px-3 py-2.5 text-right tabular-nums whitespace-nowrap", className)}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Ver o que compõe este valor"
            className="group inline-flex items-center rounded-md px-1 -mx-1 hover:bg-surface-subtle"
          >
            {formatBRL(atual)}
            <Delta pct={variacao(atual, anterior)} subirEBom={subirEBom} neutro={neutro} />
            <ChevronDown
              className={cn(
                "ml-0.5 h-3 w-3 text-muted-foreground/60 transition-transform group-hover:text-foreground",
                aberto && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border/60 px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            O que compõe {formatBRL(atual)}
          </div>
          <ul className="custom-scroll max-h-72 divide-y divide-border/50 overflow-y-auto">
            {itens.isLoading && (
              <li className="px-3 py-3 text-xs text-muted-foreground">Buscando…</li>
            )}
            {itens.error && (
              <li className="px-3 py-3 text-xs text-danger">{(itens.error as Error).message}</li>
            )}
            {itens.data?.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted-foreground">Nenhum lançamento.</li>
            )}
            {itens.data?.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{l.descricao || "Sem descrição"}</p>
                  <p className="text-2xs text-muted-foreground">
                    {formatDateBR(l.dia)}
                    {l.fornecedor ? ` · ${l.fornecedor}` : ""}
                    {l.status !== "paid" ? " · em aberto" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums">{formatBRL(l.valor)}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </td>
  );
}

function LinhaDeGrupo({
  grupo,
  titulo,
  meses,
  regime,
  linha,
  aberto,
  onAbrir,
  apagada,
}: {
  grupo: GrupoDre;
  titulo: string;
  /** Todos os meses buscados; o primeiro é só a base da variação. */
  meses: string[];
  regime: Regime;
  linha: { porMes: number[]; categorias: { id: string | null; nome: string; porMes: number[] }[] };
  aberto: boolean;
  onAbrir: () => void;
  apagada?: boolean;
}) {
  const total = soma(linha.porMes.slice(1));
  const temDetalhe = linha.categorias.length > 0;
  const subirEBom = grupo === "receita";
  const neutro = grupo === "investimento";
  const celulas = (porMes: number[], categoriaId?: string | null, className?: string) =>
    meses
      .slice(1)
      .map((mes, i) => (
        <Celula
          key={mes}
          grupo={grupo}
          categoriaId={categoriaId}
          mes={mes}
          regime={regime}
          atual={porMes[i + 1]}
          anterior={porMes[i]}
          subirEBom={subirEBom}
          neutro={neutro}
          className={className}
        />
      ));
  return (
    <>
      <tr className={cn("border-t border-border/60", apagada && "text-muted-foreground")}>
        <td className="sticky left-0 z-10 bg-card px-5 py-2.5">
          <button
            type="button"
            onClick={onAbrir}
            disabled={!temDetalhe}
            aria-expanded={aberto}
            className="flex items-center gap-1.5 text-left font-medium disabled:cursor-default"
          >
            {titulo}
            {temDetalhe && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  aberto && "rotate-180",
                )}
              />
            )}
          </button>
        </td>
        {celulas(linha.porMes)}
        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{valor(total)}</td>
      </tr>
      {aberto &&
        linha.categorias.map((c) => (
          <tr key={`${grupo}:${c.id ?? "sem"}`} className="text-2xs text-muted-foreground">
            <td className="sticky left-0 z-10 bg-card px-5 py-1.5 pl-9">{c.nome}</td>
            {celulas(c.porMes, c.id, "py-1.5 text-2xs")}
            <td className="px-5 py-1.5 text-right tabular-nums">
              {valor(soma(c.porMes.slice(1)))}
            </td>
          </tr>
        ))}
    </>
  );
}

function LinhaDeTotal({
  titulo,
  valores,
  receita,
  comSinal,
  destaque,
}: {
  titulo: string;
  valores: number[];
  receita: number[];
  comSinal?: boolean;
  destaque?: boolean;
}) {
  const total = soma(valores.slice(1));
  const pct = percentualDaReceita(total, soma(receita.slice(1)));
  const cor = (v: number) =>
    comSinal ? (v < 0 ? "text-danger" : v > 0 ? "text-success" : "") : "";
  return (
    <tr
      className={cn("border-t border-border bg-surface-subtle/50", destaque && "bg-surface-subtle")}
    >
      <td className="sticky left-0 z-10 bg-surface-subtle px-5 py-2.5 font-semibold">
        {titulo}
        {pct !== null && (
          <span className="ml-2 text-2xs font-normal text-muted-foreground">{pct}%</span>
        )}
      </td>
      {valores.slice(1).map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap",
            cor(v),
          )}
        >
          {valor(v, false)}
          <Delta pct={variacao(v, valores[i])} subirEBom />
        </td>
      ))}
      <td className={cn("px-5 py-2.5 text-right font-bold tabular-nums", cor(total))}>
        {valor(total, false)}
      </td>
    </tr>
  );
}

function Classificador({ categorias }: { categorias: CategoriaDoDre[] }) {
  const definir = useServerFn(definirGrupoDaCategoria);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (v: { id: string; grupo: GrupoDre }) => definir({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dre"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  // As sem grupo primeiro: são as que pedem uma decisão.
  const lista = useMemo(
    () =>
      [...categorias].sort(
        (a, b) => Number(!!a.grupo) - Number(!!b.grupo) || a.nome.localeCompare(b.nome),
      ),
    [categorias],
  );
  return (
    <ul className="mt-4 divide-y divide-border/60">
      {lista.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">{c.nome}</span>
          <Select
            value={c.grupo ?? ""}
            onValueChange={(v) => mutation.mutate({ id: c.id, grupo: v as GrupoDre })}
          >
            <SelectTrigger
              className={cn("h-8 w-44 text-xs", !c.grupo && "border-warning text-warning")}
            >
              <SelectValue placeholder="Sem grupo" />
            </SelectTrigger>
            <SelectContent>
              {GRUPOS_DRE.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}
