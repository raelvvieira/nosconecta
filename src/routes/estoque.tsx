import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  FileScan,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { z } from "zod";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { Sidebar } from "@/components/finance/Sidebar";
import { PageHeading } from "@/components/layout/PageHeading";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import {
  FolhaDeAjuste,
  FolhaDeEntrada,
  FolhaDeItem,
  FolhaDeSaida,
} from "@/components/estoque/Folhas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROTULO_DA_SITUACAO } from "@/lib/estoque/estoque";
import { getEstoque, type ItemDoEstoque } from "@/lib/estoque/estoque.functions";
import { formatBRL } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

// O estoque. Em cima, o que pede atenção; embaixo, a planilha de tudo que a
// clínica tem guardado, com um termômetro por item. O saldo é guardado em
// peças (a menor unidade) e mostrado em caixas + peças; a previsão de "quanto
// dura" sai do consumo médio dos últimos meses. A conta toda está em
// `src/lib/estoque/estoque.ts`.

const searchSchema = z.object({
  /** Uma unidade da clínica; sem ela, todas somadas (só o administrador). */
  unidade: z.string().uuid().optional(),
  /** Só o que está zerado ou acabando. */
  acabando: z.literal(true).optional(),
  q: z.string().max(60).optional(),
});

export const Route = createFileRoute("/estoque")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estoque · NÓS Conecta" },
      { name: "description", content: "Itens em estoque, entradas, saídas e o que está acabando." },
    ],
  }),
  validateSearch: searchSchema,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o estoque" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: EstoquePage,
});

const moedaCurta = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 10 ? 4 : 2,
  }).format(n);

type Folha =
  | { tipo: "nenhuma" }
  | { tipo: "entrada"; itemId: string | null }
  | { tipo: "saida"; itemId: string | null }
  | { tipo: "ajuste"; itemId: string | null }
  | { tipo: "item"; item: ItemDoEstoque | null };

function EstoquePage() {
  const { unidade, acabando, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const buscar = useServerFn(getEstoque);
  const consulta = useQuery({
    queryKey: ["estoque", unidade ?? "todas"],
    queryFn: () => buscar({ data: { unitId: unidade ?? null } }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const [folha, setFolha] = useState<Folha>({ tipo: "nenhuma" });
  const fechar = () => setFolha({ tipo: "nenhuma" });

  const painel = consulta.data;
  const mudar = (patch: { unidade?: string; acabando?: true; q?: string }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const visiveis = useMemo(() => {
    const itens = painel?.itens ?? [];
    const termo = (q ?? "").trim().toLowerCase();
    return itens
      .filter((i) => !termo || `${i.nome} ${i.categoria ?? ""}`.toLowerCase().includes(termo))
      .filter((i) => !acabando || i.situacao === "zerado" || i.situacao === "critico")
      .sort((a, b) => {
        // O que pede atenção sobe: os dias que restam, do menor para o maior.
        const da = a.situacao === "zerado" ? -1 : (a.diasRestantes ?? Number.POSITIVE_INFINITY);
        const db = b.situacao === "zerado" ? -1 : (b.diasRestantes ?? Number.POSITIVE_INFINITY);
        return da === db ? a.nome.localeCompare(b.nome, "pt-BR") : da - db;
      });
  }, [painel, q, acabando]);

  const base = {
    itens: painel?.itens ?? [],
    unidades: painel?.unidades ?? [],
    unidadeAtual: painel?.unidadeAtual ?? null,
    aoFechar: fechar,
  };

  const botaoAdicionar = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="premium" className="h-9 gap-2 rounded-full">
          <Plus className="h-4 w-4" />
          Adicionar itens
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <button
          type="button"
          onClick={() => setFolha({ tipo: "entrada", itemId: null })}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
        >
          <ArrowDownToLine className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            <span className="block text-sm font-medium">Dar entrada em um item</span>
            <span className="block text-xs text-muted-foreground">
              Escolha o item da lista e informe quanto chegou e o preço.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFolha({ tipo: "item", item: null })}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
        >
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
          <span>
            <span className="block text-sm font-medium">Cadastrar um item novo</span>
            <span className="block text-xs text-muted-foreground">
              Nome, como é comprado e quantas peças vêm em cada caixa.
            </span>
          </span>
        </button>
        <div
          className="flex w-full cursor-not-allowed items-start gap-3 rounded-xl px-3 py-2.5 opacity-55"
          aria-disabled="true"
        >
          <FileScan className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="block text-sm font-medium">
              Ler uma nota com IA{" "}
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold">
                em breve
              </span>
            </span>
            <span className="block text-xs text-muted-foreground">
              Envie a foto ou o PDF da nota e a IA traz os itens, quantidades e preços.
            </span>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="custom-scroll sem-arrasto-lateral min-w-0 flex-1 overflow-y-auto px-4 py-6 pb-nav md:px-6 md:py-8 lg:px-10 lg:pb-8">
        <PageHeading
          icon={Package}
          title="Estoque"
          subtitle="O que a clínica tem guardado, e o que está para acabar."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {painel?.podeEscolherUnidade && (
                <div
                  className="flex rounded-full border border-border/70 bg-card p-0.5 shadow-1"
                  role="group"
                >
                  {[{ id: "", nome: "Todas" }, ...painel.unidades].map((u) => {
                    const ativa = (unidade ?? "") === u.id;
                    return (
                      <button
                        key={u.id || "todas"}
                        type="button"
                        aria-pressed={ativa}
                        onClick={() =>
                          navigate({
                            search: (prev) => ({ ...prev, unidade: u.id || undefined }),
                            replace: true,
                          })
                        }
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                          ativa
                            ? "bg-foreground text-white"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {u.nome.replace(/^NÓS\s+/i, "")}
                      </button>
                    );
                  })}
                </div>
              )}
              {botaoAdicionar}
            </div>
          }
        />

        {consulta.isLoading || !painel ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando o estoque…</p>
        ) : (
          <>
            <div className="mt-5">
              <GrupoDeKpis>
                <KpiCard
                  label="Itens no estoque"
                  value={String(painel.resumo.itens)}
                  icon={Boxes}
                  tone="violet"
                  nota={
                    painel.categorias.length ? `${painel.categorias.length} categorias` : undefined
                  }
                  footer={
                    painel.categorias.length ? (
                      <span className="text-muted-foreground">
                        {painel.categorias.length} categorias
                      </span>
                    ) : undefined
                  }
                />
                <KpiCard
                  label="Acabando ou zerados"
                  value={String(painel.resumo.acabando)}
                  icon={AlertTriangle}
                  tone={painel.resumo.acabando > 0 ? "danger" : "success"}
                  corNoValor={painel.resumo.acabando > 0}
                  nota={
                    painel.resumo.zerados ? `${painel.resumo.zerados} zerados` : "nenhum zerado"
                  }
                  footer={
                    <button
                      type="button"
                      className="text-pink hover:underline"
                      onClick={() =>
                        mudar({ acabando: painel.resumo.acabando > 0 ? true : undefined })
                      }
                    >
                      {painel.resumo.acabando > 0 ? "ver só esses" : "tudo em dia"}
                    </button>
                  }
                />
                <KpiCard
                  label="Valor em estoque"
                  value={formatBRL(painel.resumo.valorEmEstoque)}
                  icon={Wallet}
                  tone="violet"
                  nota={
                    painel.resumo.semPreco
                      ? `${painel.resumo.semPreco} sem preço`
                      : "pelo último preço"
                  }
                  footer={
                    <span className="text-muted-foreground">
                      {painel.resumo.semPreco
                        ? `${painel.resumo.semPreco} itens ainda sem preço de compra`
                        : "saldo × último preço pago"}
                    </span>
                  }
                />
                <KpiCard
                  label="Compras no mês"
                  value={formatBRL(painel.comprasDoMes)}
                  icon={ArrowDownToLine}
                  tone="success"
                  nota="entradas com preço"
                  footer={
                    <span className="text-muted-foreground">entradas com preço neste mês</span>
                  }
                />
              </GrupoDeKpis>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 md:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q ?? ""}
                  onChange={(e) => mudar({ q: e.target.value || undefined })}
                  placeholder="Buscar item ou categoria"
                  className="h-9 rounded-full pl-9"
                />
              </div>
              <button
                type="button"
                aria-pressed={acabando === true}
                onClick={() => mudar({ acabando: acabando ? undefined : true })}
                className={cn(
                  "h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                  acabando
                    ? "border-danger bg-danger-soft text-danger"
                    : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                Só os que estão acabando
              </button>
              <Button
                variant="outline"
                className="ml-auto h-9 gap-2 rounded-full"
                onClick={() => setFolha({ tipo: "ajuste", itemId: null })}
                disabled={!painel.itens.length}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Ajustar contagem
              </Button>
            </div>

            {!painel.itens.length ? (
              <div className="mt-6 rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-1">
                <Package className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Nenhum item cadastrado ainda</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Comece cadastrando o que a clínica usa. Depois é só dar entrada quando chegar uma
                  compra, e o sistema passa a prever quanto tempo cada coisa dura.
                </p>
                <Button
                  variant="premium"
                  className="mt-4 rounded-full"
                  onClick={() => setFolha({ tipo: "item", item: null })}
                >
                  Cadastrar o primeiro item
                </Button>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-1">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-3 py-3 font-medium">Em estoque</th>
                        <th className="px-3 py-3 font-medium">Por caixa</th>
                        <th className="px-3 py-3 font-medium">Último valor</th>
                        <th className="px-3 py-3 font-medium">Consumo</th>
                        <th className="px-3 py-3 font-medium">Situação</th>
                        <th className="w-10 px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((i) => (
                        <LinhaDoItem
                          key={i.id}
                          item={i}
                          aoEditar={() => setFolha({ tipo: "item", item: i })}
                          aoEntrar={() => setFolha({ tipo: "entrada", itemId: i.id })}
                          aoSair={() => setFolha({ tipo: "saida", itemId: i.id })}
                          aoAjustar={() => setFolha({ tipo: "ajuste", itemId: i.id })}
                        />
                      ))}
                      {!visiveis.length && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-sm text-muted-foreground"
                          >
                            Nenhum item com esse filtro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
                  A previsão usa o consumo médio dos últimos 60 dias (saídas e perdas) e só aparece
                  com pelo menos uma semana de histórico. A barra enche com 30 dias de folga.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <FolhaDeEntrada
        {...base}
        aberto={folha.tipo === "entrada"}
        itemInicial={folha.tipo === "entrada" ? folha.itemId : null}
      />
      <FolhaDeSaida
        {...base}
        aberto={folha.tipo === "saida"}
        itemInicial={folha.tipo === "saida" ? folha.itemId : null}
      />
      <FolhaDeAjuste
        {...base}
        aberto={folha.tipo === "ajuste"}
        itemInicial={folha.tipo === "ajuste" ? folha.itemId : null}
      />
      <FolhaDeItem
        aberto={folha.tipo === "item"}
        aoFechar={fechar}
        item={folha.tipo === "item" ? folha.item : null}
        categorias={painel?.categorias ?? []}
      />
    </div>
  );
}

function LinhaDoItem({
  item: i,
  aoEditar,
  aoEntrar,
  aoSair,
  aoAjustar,
}: {
  item: ItemDoEstoque;
  aoEditar: () => void;
  aoEntrar: () => void;
  aoSair: () => void;
  aoAjustar: () => void;
}) {
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <p className="font-medium">{i.nome}</p>
        {i.categoria && <p className="text-xs text-muted-foreground">{i.categoria}</p>}
      </td>
      <td className="px-3 py-3">
        <p className="font-medium tabular-nums">{i.saldoEmTexto}</p>
        {i.unidadesPorEmbalagem > 1 && i.saldo > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {i.saldo.toLocaleString("pt-BR")} {i.rotuloUnidade}
            {i.saldo === 1 ? "" : "s"}
          </p>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-muted-foreground">
        {i.unidadesPorEmbalagem.toLocaleString("pt-BR")} {i.rotuloUnidade}
        {i.unidadesPorEmbalagem === 1 ? "" : "s"}
      </td>
      <td className="px-3 py-3 tabular-nums">
        {i.compra ? (
          <>
            <p>
              {moedaCurta(i.compra.custoUnitario)}
              <span className="text-xs text-muted-foreground"> / {i.rotuloUnidade}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {i.compra.custoPorEmbalagem != null && i.unidadesPorEmbalagem > 1
                ? `${formatBRL(i.compra.custoPorEmbalagem)} / ${i.rotuloEmbalagem} · `
                : ""}
              {i.compra.variacaoPct != null && i.compra.variacaoPct !== 0 && (
                <span className={i.compra.variacaoPct > 0 ? "text-danger" : "text-success"}>
                  {i.compra.variacaoPct > 0 ? "▲" : "▼"}{" "}
                  {Math.abs(i.compra.variacaoPct).toLocaleString("pt-BR")}%
                </span>
              )}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums">
        {i.consumoPorDia != null ? (
          <>
            <p>{i.consumoPorDia.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} /dia</p>
            {i.diasRestantes != null && (
              <p className="text-xs text-muted-foreground">
                {i.diasRestantes === 0
                  ? "acabou"
                  : `dura ~${i.diasRestantes} dia${i.diasRestantes === 1 ? "" : "s"}`}
              </p>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {i.diasObservados < 7 ? "poucos dados" : "sem saídas"}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-28 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`Nível de ${i.nome}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(i.nivel * 100)}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(4, Math.round(i.nivel * 100))}%`, background: i.cor }}
            />
          </div>
          <span className="whitespace-nowrap text-xs font-medium" style={{ color: i.cor }}>
            {ROTULO_DA_SITUACAO[i.situacao]}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Ações de ${i.nome}`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={aoEntrar}>
              <ArrowDownToLine className="mr-2 h-4 w-4" /> Dar entrada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={aoSair}>
              <ArrowUpFromLine className="mr-2 h-4 w-4" /> Dar saída
            </DropdownMenuItem>
            <DropdownMenuItem onClick={aoAjustar}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Ajustar contagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={aoEditar}>
              <Pencil className="mr-2 h-4 w-4" /> Editar item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
