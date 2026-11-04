import { lazy, type ReactNode } from "react";
import { CalendarCheck, Clock, MessageCircle, Timer, UserPlus } from "lucide-react";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { SobDemanda, nomeado } from "@/components/finance/SobDemanda";
import { FunilPorEtapa } from "@/components/atendimentos/painel/FunilPorEtapa";
import { PicoDaSemana } from "@/components/atendimentos/painel/PicoDaSemana";
import { duracao, esperaEmMin } from "@/lib/atendimentos/painel/formato";
import type { FiltroDePeriodo } from "@/lib/atendimentos/painel/metricas";
import type { PainelDoAtendimento as Dados } from "@/lib/atendimentos/painel.functions";
import type { PicoDaSemana as Pico } from "@/lib/atendimentos/painel/metricas";
import type { FunilDeLeads } from "@/lib/atendimentos/funis.functions";
import type { Publico } from "@/lib/atendimentos/publico";
import { inteiro, pct, pp } from "@/lib/gestao/formato";
import { cn } from "@/lib/utils";

// O painel de Atendimento: o que quem cuida do WhatsApp precisa ver de relance.
// Sem router aqui dentro — a rota escolhe período e funil, esta peça só desenha.

const MovimentoPorHora = lazy(
  nomeado<{ porHora: number[]; horaAtual: number | null }>(
    () => import("@/components/atendimentos/painel/MovimentoPorHora"),
    "MovimentoPorHora",
  ),
);

const FILTROS: { value: FiltroDePeriodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "90d", label: "90 dias" },
];

export function FiltroDoPeriodo({
  valor,
  onChange,
}: {
  valor: FiltroDePeriodo;
  onChange: (f: FiltroDePeriodo) => void;
}) {
  return (
    <div className="custom-scroll -mx-4 flex max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">
      <div className="inline-flex shrink-0 rounded-full bg-muted/60 p-0.5" role="tablist">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={f.value === valor}
            onClick={() => onChange(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition-all",
              f.value === valor
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Cartao({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card p-5 md:p-6", className)}>
      <h2 className="mb-4 text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h2>
      {children}
    </section>
  );
}

function Conversao({ dados }: { dados: Dados | null }) {
  if (!dados) return <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />;
  const { novas, agendaram, pct: taxa } = dados.conversao;
  const anterior = dados.conversaoAnterior.pct;
  const mudanca = taxa !== null && anterior !== null ? pp(taxa - anterior) : null;
  const subiu = taxa !== null && anterior !== null && taxa > anterior;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <p className="text-4xl font-semibold leading-none tracking-tight tabular-nums">
          {pct(taxa)}
        </p>
        {mudanca && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums",
              subiu ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {mudanca}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        das pessoas que chamaram pela primeira vez já agendaram
      </p>
      <div className="mt-5 grid gap-3">
        {[
          { rotulo: "Chamaram", n: novas, largura: 100, opacidade: 0.3 },
          {
            rotulo: "Agendaram",
            n: agendaram,
            largura: novas ? (agendaram / novas) * 100 : 0,
            opacidade: 1,
          },
        ].map((l) => (
          <div key={l.rotulo} className="grid grid-cols-[4.75rem_1fr_2rem] items-center gap-3">
            <span className="text-sm">{l.rotulo}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted/60">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${l.largura}%`,
                  minWidth: l.n > 0 ? "6px" : 0,
                  background: "var(--chart-1)",
                  opacity: l.opacidade,
                }}
              />
            </span>
            <span className="text-right text-sm font-medium tabular-nums">{inteiro(l.n)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const delta = (v: { deltaPct: number | null }) =>
  v.deltaPct === null ? undefined : Math.round(v.deltaPct);

export function PainelDoAtendimento({
  dados,
  pico,
  funil,
  publico,
  onPublico,
  atualizando = false,
  lateral,
}: {
  dados: Dados | null;
  pico: Pico | null;
  funil: FunilDeLeads | null;
  publico: Publico;
  onPublico: (p: Publico) => void;
  /** Buscando outro período: o painel antigo fica na tela, esmaecido. */
  atualizando?: boolean;
  /** O cartão da conexão do WhatsApp. */
  lateral?: ReactNode;
}) {
  const carregando = !dados;
  const vazio = "—";
  const horaAtual =
    dados?.filtro === "hoje"
      ? Number(
          new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            hour12: false,
            timeZone: "America/Sao_Paulo",
          }).format(new Date()),
        ) % 24
      : null;

  return (
    <div
      className={cn(
        "space-y-5 transition-opacity duration-200",
        carregando && "animate-pulse",
        atualizando && !carregando && "pointer-events-none opacity-50",
      )}
      aria-busy={atualizando}
    >
      <GrupoDeKpis>
        <KpiCard
          label="Novas conversas"
          value={dados && dados.novasDisponiveis ? inteiro(dados.novas.atual) : vazio}
          icon={UserPlus}
          tone="violet"
          deltaPct={dados?.novasDisponiveis ? delta(dados.novas) : undefined}
          footer="pessoas que chamaram pela primeira vez"
          nota="primeiro contato"
        />
        <KpiCard
          label="Atendidas"
          value={dados ? inteiro(dados.atendidas.atual.total) : vazio}
          icon={MessageCircle}
          tone="success"
          deltaPct={dados ? delta(dados.atendidas.variacao) : undefined}
          footer={
            dados
              ? `Luna ${dados.atendidas.atual.luna} · Equipe ${dados.atendidas.atual.equipe}`
              : undefined
          }
          nota={
            dados
              ? `Luna ${dados.atendidas.atual.luna} · Equipe ${dados.atendidas.atual.equipe}`
              : undefined
          }
        />
        <KpiCard
          label="Viraram agendamento"
          value={dados ? pct(dados.conversao.pct) : vazio}
          icon={CalendarCheck}
          tone="warning"
          footer={
            dados
              ? `${dados.conversao.agendaram} de ${dados.conversao.novas} que chamaram`
              : undefined
          }
          nota={dados ? `${dados.conversao.agendaram} de ${dados.conversao.novas}` : undefined}
        />
        <KpiCard
          label="Tempo de resposta"
          value={dados ? duracao(dados.resposta.atual.medianaMs) : vazio}
          icon={Timer}
          tone="danger"
          footer={
            dados?.resposta.atual.ate5minPct != null
              ? `${pct(dados.resposta.atual.ate5minPct)} em até 5 min`
              : "mediana"
          }
          nota="mediana"
        />
      </GrupoDeKpis>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <Cartao titulo="Movimento por hora">
          <SobDemanda altura={176}>
            <MovimentoPorHora porHora={dados?.porHora ?? Array(24).fill(0)} horaAtual={horaAtual} />
          </SobDemanda>
        </Cartao>

        <Cartao titulo="Do contato ao agendamento">
          <Conversao dados={dados} />
        </Cartao>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Cartao titulo="Aguardando resposta">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl",
                dados && dados.aguardando.total > 0
                  ? "bg-warning-soft text-warning"
                  : "bg-success-soft text-success",
              )}
            >
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
                {dados ? dados.aguardando.total : vazio}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {dados?.aguardando.maisAntigaMin != null
                  ? `a mais antiga há ${esperaEmMin(dados.aguardando.maisAntigaMin)}`
                  : "tudo respondido"}
              </p>
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Quem responde mais rápido">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {dados ? duracao(dados.resposta.atual.medianaLunaMs) : vazio}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Luna</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {dados ? duracao(dados.resposta.atual.medianaEquipeMs) : vazio}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Equipe</p>
            </div>
          </div>
        </Cartao>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Cartao titulo="Funil">
          <FunilPorEtapa publico={publico} onPublico={onPublico} funil={funil} />
        </Cartao>
        <Cartao titulo="Horários de pico da semana">
          {pico ? (
            <PicoDaSemana pico={pico} />
          ) : (
            <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
          )}
        </Cartao>
      </section>

      {lateral && <div className="max-w-md">{lateral}</div>}
    </div>
  );
}
