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
import { inteiro, pct } from "@/lib/gestao/formato";
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
];

export function FiltroDoPeriodo({
  valor,
  onChange,
}: {
  valor: FiltroDePeriodo;
  onChange: (f: FiltroDePeriodo) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-muted/60 p-0.5" role="tablist">
      {FILTROS.map((f) => (
        <button
          key={f.value}
          type="button"
          role="tab"
          aria-selected={f.value === valor}
          onClick={() => onChange(f.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs transition-all",
            f.value === valor
              ? "bg-background font-semibold text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
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

const delta = (v: { deltaPct: number | null }) =>
  v.deltaPct === null ? undefined : Math.round(v.deltaPct);

export function PainelDoAtendimento({
  dados,
  pico,
  funil,
  publico,
  onPublico,
  lateral,
}: {
  dados: Dados | null;
  pico: Pico | null;
  funil: FunilDeLeads | null;
  publico: Publico;
  onPublico: (p: Publico) => void;
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
    <div className={cn("space-y-5", carregando && "animate-pulse")}>
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
            dados ? `${dados.conversao.agendaram} de ${dados.conversao.novas} novas` : undefined
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

        <div className="space-y-5">
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
        </div>
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
