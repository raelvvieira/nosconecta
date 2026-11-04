import { lazy, type ReactNode } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Percent,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { SobDemanda, nomeado } from "@/components/finance/SobDemanda";
import { cn } from "@/lib/utils";
import type { Variacao } from "@/lib/gestao/indicadores";
import type { VisaoDeGestao } from "@/lib/gestao/visao";
import { horas, inteiro, mesCurto, nomeDoMes, pct, pp, reais } from "@/lib/gestao/formato";

// O painel de Gestão: o que o administrador precisa para entender a clínica em
// poucos minutos. Uma página só, em seções, de cima para baixo na ordem da
// pergunta: como foi o mês → como evoluiu → como funciona a operação → quem são
// os pacientes → como cada unidade contribui.
//
// Sem router aqui dentro: quem muda mês e unidade é a rota (`/gestao`), e esta
// peça só desenha — o que também a deixa testável com dados fictícios.

/** Gráficos descem sob demanda: `recharts` não pode segurar a pintura. */
const EvolucaoDoResultado = lazy(
  nomeado<{ pontos: VisaoDeGestao["evolucao"]; mesAtual: string }>(
    () => import("@/components/gestao/EvolucaoDoResultado"),
    "EvolucaoDoResultado",
  ),
);

/** Subir é bom (receita) ou ruim (faltas)? Decide a cor da variação. */
function Delta({
  v,
  em,
  subirEBom = true,
}: {
  v: Variacao;
  em: "pct" | "pp";
  subirEBom?: boolean;
}) {
  const bruto = em === "pct" ? v.deltaPct : v.deltaAbs;
  if (bruto === null || Math.abs(bruto) < (em === "pct" ? 0.5 : 0.05)) return null;
  const subiu = bruto > 0;
  const bom = subirEBom ? subiu : !subiu;
  const texto =
    em === "pct" ? `${subiu ? "+" : "−"}${Math.min(999, Math.round(Math.abs(bruto)))}%` : pp(bruto);
  return <span className={cn("tabular-nums", bom ? "text-success" : "text-danger")}>{texto}</span>;
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Lista agrupada, no estilo das Configurações do iOS: linhas finas, rótulo à
 *  esquerda, valor à direita. */
function Lista({ children }: { children: ReactNode }) {
  return <div className="surface-card divide-y divide-border/70 overflow-hidden">{children}</div>;
}

function Linha({
  rotulo,
  detalhe,
  valor,
  variacao,
}: {
  rotulo: string;
  detalhe?: ReactNode;
  valor: ReactNode;
  variacao?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-5">
      <div className="min-w-0">
        <p className="text-sm">{rotulo}</p>
        {detalhe && <p className="mt-0.5 text-2xs text-muted-foreground">{detalhe}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-semibold tabular-nums">{valor}</p>
        {variacao && <p className="mt-0.5 text-2xs">{variacao}</p>}
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-8" aria-busy>
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-muted/40" />
    </div>
  );
}

export function PainelDeGestao({
  dados,
  carregando,
  erro,
  mesMaximo,
  onMes,
  onUnidade,
  acaoDoCaixa,
}: {
  /** O último resultado válido. Fica na tela enquanto o próximo carrega. */
  dados: VisaoDeGestao | null;
  carregando: boolean;
  erro?: string | null;
  /** O último mês que se pode abrir (o corrente), "AAAA-MM". */
  mesMaximo: string;
  /** Troca o mês: "AAAA-MM". */
  onMes: (mes: string) => void;
  /** Troca a unidade; `null` = todas. */
  onUnidade: (id: string | null) => void;
  /** O que fazer quando o saldo das contas não foi informado (um link). */
  acaoDoCaixa?: ReactNode;
}) {
  const mes = dados?.mes ?? mesMaximo;
  // Mês em andamento: dinheiro e pacientes são PARCIAIS, e comparar meio mês com
  // o mês anterior inteiro mostraria "−100%" no dia 1. Por isso a variação em %
  // some e o cartão diz "parcial". A ocupação fica: ela já compara só os dias
  // que passaram.
  const parcial = dados?.mesEmAndamento === true;
  const antes = parcial ? "parcial · mês anterior" : "antes";
  const somarUm = (m: string, n: number) => {
    const [a, mm] = m.split("-").map(Number);
    const d = new Date(Date.UTC(a, mm - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-9">
      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <header className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Gestão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resultado, eficiência e crescimento da clínica, em um só lugar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="Mês">
            <button
              type="button"
              onClick={() => onMes(somarUm(mes, -1))}
              aria-label="Mês anterior"
              className="press grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10.5rem] text-center text-[15px] font-semibold tracking-tight">
              {nomeDoMes(mes)}
            </span>
            <button
              type="button"
              onClick={() => onMes(somarUm(mes, 1))}
              disabled={mes >= mesMaximo}
              aria-label="Próximo mês"
              className="press grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {dados?.mesEmAndamento && (
              <span className="ml-2 rounded-full bg-warning-soft px-2.5 py-0.5 text-2xs font-medium text-warning">
                em andamento
              </span>
            )}
          </div>

          {dados && dados.unidades.length > 1 && (
            <div
              className="flex rounded-full border border-border/70 bg-card p-0.5"
              role="group"
              aria-label="Unidade"
            >
              {[{ id: null as string | null, nome: "Todas" }, ...dados.unidades].map((u) => (
                <button
                  key={u.id ?? "todas"}
                  type="button"
                  onClick={() => onUnidade(u.id)}
                  aria-pressed={dados.unidadeSelecionada === u.id}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    dados.unidadeSelecionada === u.id
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {u.nome.replace(/^NÓS\s+/i, "")}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {erro && !dados ? (
        <p className="surface-card p-5 text-sm text-danger">{erro}</p>
      ) : !dados ? (
        <Esqueleto />
      ) : (
        <div className={cn("space-y-9 transition-opacity", carregando && "opacity-60")}>
          {/* ── 1. Resumo ───────────────────────────────────────────── */}
          <Secao titulo="Resumo">
            <GrupoDeKpis colunas="xl:grid-cols-3">
              <KpiCard
                label="Receita realizada"
                value={reais(dados.resumo.receita.atual)}
                icon={DollarSign}
                tone="success"
                deltaPct={parcial ? undefined : (dados.resumo.receita.deltaPct ?? undefined)}
                footer={
                  <span className="text-muted-foreground">
                    {antes} {reais(dados.resumo.receita.anterior)}
                  </span>
                }
                nota={`${antes} ${reais(dados.resumo.receita.anterior)}`}
              />
              <KpiCard
                label="Lucro operacional"
                value={reais(dados.resumo.resultado.atual)}
                icon={TrendingUp}
                tone={(dados.resumo.resultado.atual ?? 0) < 0 ? "danger" : "success"}
                corNoValor
                deltaPct={parcial ? undefined : (dados.resumo.resultado.deltaPct ?? undefined)}
                footer={
                  <span className="text-muted-foreground">
                    {antes} {reais(dados.resumo.resultado.anterior)}
                  </span>
                }
                nota={`${antes} ${reais(dados.resumo.resultado.anterior)}`}
              />
              <KpiCard
                label="Margem operacional"
                value={pct(dados.resumo.margem.atual)}
                icon={Percent}
                tone="violet"
                footer={
                  <span className="text-muted-foreground">
                    {parcial ? (
                      "parcial"
                    ) : (
                      <>
                        <Delta v={dados.resumo.margem} em="pp" />{" "}
                        {pp(dados.resumo.margem.deltaAbs) ? "vs anterior" : ""}
                      </>
                    )}
                  </span>
                }
                nota={parcial ? "parcial" : (pp(dados.resumo.margem.deltaAbs) ?? undefined)}
              />
              <KpiCard
                label="Saldo em caixa"
                value={dados.caixa.informado ? reais(dados.caixa.total) : "—"}
                icon={Wallet}
                tone="violet"
                footer={
                  dados.caixa.informado ? (
                    <span className="text-muted-foreground">somando as contas</span>
                  ) : (
                    (acaoDoCaixa ?? <span className="text-warning">Saldo não informado</span>)
                  )
                }
                nota={dados.caixa.informado ? undefined : "saldo não informado"}
              />
              <KpiCard
                label="Novos pacientes"
                value={inteiro(dados.resumo.novosPacientes.atual)}
                icon={UserPlus}
                tone="success"
                deltaPct={parcial ? undefined : (dados.resumo.novosPacientes.deltaPct ?? undefined)}
                footer={
                  <span className="text-muted-foreground">
                    {antes} {inteiro(dados.resumo.novosPacientes.anterior)}
                  </span>
                }
              />
              <KpiCard
                label="Ocupação da agenda"
                value={pct(dados.resumo.ocupacao.atual)}
                icon={CalendarCheck}
                tone="warning"
                footer={
                  <span className="text-muted-foreground">
                    <Delta v={dados.resumo.ocupacao} em="pp" />{" "}
                    {dados.operacao.horasDisponiveis > 0
                      ? `${horas(dados.operacao.horasAgendadas)} de ${horas(dados.operacao.horasDisponiveis)}`
                      : ""}
                  </span>
                }
                nota={pp(dados.resumo.ocupacao.deltaAbs) ?? undefined}
              />
            </GrupoDeKpis>
          </Secao>

          {/* ── 2. Evolução ─────────────────────────────────────────── */}
          <Secao
            titulo="Evolução"
            descricao="Seis meses até o mês escolhido. Receita e resultado em escalas separadas: crescer não é lucrar."
          >
            <div className="surface-card space-y-5 p-5 md:p-6">
              <SobDemanda altura={210}>
                <EvolucaoDoResultado pontos={dados.evolucao} mesAtual={dados.mes} />
              </SobDemanda>
              {/* A versão em números do mesmo gráfico. */}
              <details className="group border-t border-border/70 pt-3">
                <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
                  Ver os números
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs tabular-nums">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Mês</th>
                        <th className="pb-2 text-right font-medium">Receita</th>
                        <th className="pb-2 text-right font-medium">Resultado</th>
                        <th className="pb-2 text-right font-medium">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {dados.evolucao.map((p) => (
                        <tr key={p.mes}>
                          <td className="py-1.5 capitalize">{mesCurto(p.mes)}</td>
                          <td className="py-1.5 text-right">{reais(p.receita)}</td>
                          <td className={cn("py-1.5 text-right", p.resultado < 0 && "text-danger")}>
                            {reais(p.resultado)}
                          </td>
                          <td className="py-1.5 text-right">{pct(p.margem)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </Secao>

          {/* ── 3. Operação ─────────────────────────────────────────── */}
          <Secao
            titulo="Operação"
            descricao="Quanto a estrutura produz. A ocupação é horas agendadas sobre horas de funcionamento vezes cadeiras das unidades."
          >
            <Lista>
              <Linha
                rotulo="Atendimentos concluídos"
                valor={inteiro(dados.operacao.atendimentos.atual)}
                variacao={<Delta v={dados.operacao.atendimentos} em="pct" />}
              />
              <Linha
                rotulo="Ticket médio"
                detalhe="Receita por atendimento concluído"
                valor={reais(dados.operacao.ticketMedio.atual)}
                variacao={<Delta v={dados.operacao.ticketMedio} em="pct" />}
              />
              <Linha
                rotulo="Faltas e cancelamentos"
                detalhe="Dos atendimentos que já deviam ter acontecido"
                valor={pct(dados.operacao.perdidos.atual)}
                variacao={<Delta v={dados.operacao.perdidos} em="pp" subirEBom={false} />}
              />
              <Linha
                rotulo="Horas agendadas"
                detalhe={
                  dados.operacao.horasDisponiveis > 0
                    ? `de ${horas(dados.operacao.horasDisponiveis)} oferecidas`
                    : "Cadastre o horário de funcionamento para medir"
                }
                valor={horas(dados.operacao.horasAgendadas)}
              />
            </Lista>
          </Secao>

          {/* ── 4. Pacientes ────────────────────────────────────────── */}
          <Secao
            titulo="Pacientes"
            descricao="Novo é quem fez o primeiro atendimento concluído neste mês; recorrente, quem já tinha vindo antes."
          >
            <Lista>
              <Linha rotulo="Novos no mês" valor={inteiro(dados.pacientes.novos)} />
              <Linha rotulo="Recorrentes" valor={inteiro(dados.pacientes.recorrentes)} />
              <Linha
                rotulo="Receita de novos pacientes"
                valor={reais(dados.pacientes.receitaNovos)}
                detalhe={
                  dados.pacientes.receitaNovos + dados.pacientes.receitaRecorrentes > 0
                    ? `${pct((dados.pacientes.receitaNovos / (dados.pacientes.receitaNovos + dados.pacientes.receitaRecorrentes)) * 100)} do atendido no mês`
                    : undefined
                }
              />
              <Linha
                rotulo="Receita de pacientes recorrentes"
                valor={reais(dados.pacientes.receitaRecorrentes)}
              />
              {dados.pacientes.club && (
                <Linha
                  rotulo="Indicações do NÓS Club"
                  detalhe="Indicadas no mês · confirmadas com consulta feita"
                  valor={`${dados.pacientes.club.indicadas} · ${dados.pacientes.club.confirmadas}`}
                />
              )}
            </Lista>
          </Secao>

          {/* ── 5. Por unidade ──────────────────────────────────────── */}
          {dados.porUnidade.length > 0 && (
            <Secao
              titulo="Por unidade"
              descricao="Custos, produtividade e rentabilidade de cada local."
            >
              {/* Celular: um bloco por unidade. A tabela de seis colunas não cabe
                  em 390px, e rolar para o lado esconderia justamente o resultado. */}
              <div className="surface-card divide-y divide-border/70 md:hidden">
                {dados.porUnidade.map((u) => (
                  <div key={u.id} className="space-y-3 px-4 py-3.5">
                    <p className="text-sm font-medium">{u.nome.replace(/^NÓS\s+/i, "")}</p>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-xs tabular-nums">
                      {[
                        ["Receita", reais(u.receita)],
                        ["Resultado", reais(u.resultado)],
                        ["Atendimentos", inteiro(u.atendimentos)],
                        ["Ticket", reais(u.ticketMedio)],
                        ["Ocupação", pct(u.ocupacao)],
                      ].map(([rotulo, valor]) => (
                        <div key={rotulo}>
                          <dt className="text-2xs text-muted-foreground">{rotulo}</dt>
                          <dd
                            className={cn(
                              "mt-0.5 text-[13px] font-semibold",
                              rotulo === "Resultado" && u.resultado < 0 && "text-danger",
                            )}
                          >
                            {valor}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              <div className="surface-card hidden overflow-x-auto md:block">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-2xs text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Unidade</th>
                      <th className="px-3 py-3 text-right font-medium">Receita</th>
                      <th className="px-3 py-3 text-right font-medium">Resultado</th>
                      <th className="px-3 py-3 text-right font-medium">Atend.</th>
                      <th className="px-3 py-3 text-right font-medium">Ticket</th>
                      <th className="px-5 py-3 text-right font-medium">Ocupação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {dados.porUnidade.map((u) => (
                      <tr key={u.id}>
                        <td className="px-5 py-3 font-medium">{u.nome.replace(/^NÓS\s+/i, "")}</td>
                        <td className="px-3 py-3 text-right">{reais(u.receita)}</td>
                        <td
                          className={cn("px-3 py-3 text-right", u.resultado < 0 && "text-danger")}
                        >
                          {reais(u.resultado)}
                        </td>
                        <td className="px-3 py-3 text-right">{inteiro(u.atendimentos)}</td>
                        <td className="px-3 py-3 text-right">{reais(u.ticketMedio)}</td>
                        <td className="px-5 py-3 text-right">{pct(u.ocupacao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          )}

          {dados.avisos.length > 0 && (
            <ul className="space-y-1.5 text-2xs leading-4 text-muted-foreground">
              {dados.avisos.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
