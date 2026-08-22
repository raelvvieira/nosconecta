import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownCircle,
  CalendarDays,
  ChevronRight,
  CreditCard,
  DollarSign,
  UserPlus,
  Users,
} from "lucide-react";
import { KpiCard } from "@/components/finance/KpiCard";
import { SinoDeAvisos } from "@/components/layout/SinoDeAvisos";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/finance/format";
import { useGreetingUser } from "@/components/home/use-greeting-user";
import type { HomeData } from "@/components/home/home-data";

export function DesktopHome({ dados }: { dados: HomeData }) {
  const navigate = useNavigate();
  const { firstName, greeting } = useGreetingUser();

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 min-h-[80px]">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold leading-[1.1]">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Resumo da clínica hoje</p>
        </div>
        <SinoDeAvisos className="h-11 w-11 shrink-0" />
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
        <KpiCard
          label="Agenda de hoje"
          value={String(dados.agendaHoje.total)}
          icon={CalendarDays}
          tone="violet"
          footer={
            <span className="text-muted-foreground">
              {dados.agendaHoje.detalhes.join(" · ") || "nenhum agendamento hoje"}
            </span>
          }
        />
        <KpiCard
          label="Confirmações pendentes"
          value={String(dados.confirmacoesPendentes)}
          icon={Users}
          tone="violet"
          footer={<span className="text-muted-foreground">pacientes aguardando</span>}
        />
        <KpiCard
          label="Recebido hoje"
          value={formatBRL(dados.recebidoHoje)}
          icon={DollarSign}
          tone="success"
          footer={<span className="text-muted-foreground">entrou no caixa hoje</span>}
        />
        <KpiCard
          label="Alertas"
          value={String(dados.alertas.total)}
          icon={AlertTriangle}
          tone="danger"
          footer={
            <span className="text-muted-foreground">
              {formatBRL(dados.alertas.valorEmAtraso)} em atraso
            </span>
          }
        />
      </div>

      <section className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Próximos atendimentos</h2>
          <Link to="/agenda" className="text-sm font-semibold text-primary">
            Ver todos
          </Link>
        </div>
        {dados.proximos.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Nenhum atendimento pendente para o resto de hoje.
          </p>
        ) : (
        <div className="divide-y divide-border">
          {dados.proximos.map((appt) => (
            <div key={appt.id} className="flex items-center gap-3 py-3">
              <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">{appt.time}</div>
              <div
                className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-xs font-bold"
                style={{ background: appt.avatarBg, color: appt.accentColor }}
              >
                {appt.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{appt.patient}</p>
                <p className="text-xs text-muted-foreground truncate">{appt.procedure}</p>
              </div>
              <span
                className="text-2xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                style={{
                  background: appt.confirmado ? "color-mix(in oklab, var(--success) 12%, transparent)" : "color-mix(in oklab, var(--warning) 12%, transparent)",
                  color: appt.confirmado ? "var(--success)" : "var(--warning)",
                }}
              >
                {appt.confirmado ? "Confirmado" : "Pendente"}
              </span>
            </div>
          ))}
        </div>
        )}
      </section>

      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold mb-4">Ações rápidas</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Button
            variant="premium"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/agenda" })}
          >
            <CalendarDays className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo agendamento</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/pacientes", search: { status: "all" } })}
          >
            <UserPlus className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo paciente</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/recebimentos" })}
          >
            <ArrowDownCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Registrar recebimento</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/pagamentos" })}
          >
            <CreditCard className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo pagamento</span>
          </Button>
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold mb-4">Precisa de atenção</h2>
        {dados.atencao.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nada pendente por aqui.</p>
        ) : (
        <div className="divide-y divide-border">
          {dados.atencao.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className="w-full flex items-center gap-3 py-3 text-left">
              <div className="h-9 w-9 shrink-0 rounded-full grid place-items-center" style={{ background: item.bg }}>
                <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={1.75} />
              </div>
              <span className="flex-1 text-sm text-foreground">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
