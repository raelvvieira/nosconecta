import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CalendarDays, DollarSign } from "lucide-react";
import type { HomeToday } from "@/lib/agenda/agenda.functions";
import type { OverviewData } from "@/lib/finance/queries.functions";
import { formatBRL } from "@/lib/finance/format";
import { localDateStr } from "@/lib/date";

// Uma única montagem para as duas telas iniciais (desktop e celular). Antes
// cada uma tinha a sua — e a do celular era inteira de mentira, com valores
// escritos no código. Derivar as duas do mesmo lugar é o que impede que
// voltem a divergir.

export interface HomeAppointment {
  id: string;
  time: string;
  initials: string;
  patient: string;
  procedure: string;
  confirmado: boolean;
  accentColor: string;
  avatarBg: string;
}

export interface HomeAttentionItem {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
  to: "/recebimentos" | "/pagamentos" | "/agenda";
}

export interface HomeData {
  agendaHoje: { total: number; detalhes: string[] };
  confirmacoesPendentes: number;
  recebidoHoje: number;
  alertas: { total: number; valorEmAtraso: number };
  proximos: HomeAppointment[];
  atencao: HomeAttentionItem[];
}

/** Mesmo trio de cores que o mock usava, agora só como enfeite rotativo. */
const ACENTOS = [
  { accentColor: "#FF5F7E", avatarBg: "rgba(255,95,126,0.12)" },
  { accentColor: "#8B5CF6", avatarBg: "rgba(139,92,246,0.12)" },
  { accentColor: "#22C55E", avatarBg: "rgba(34,197,94,0.12)" },
];

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

export function montarDadosHome(finance: OverviewData, hoje: HomeToday): HomeData {
  const detalhes: string[] = [];
  if (hoje.confirmed) detalhes.push(`${hoje.confirmed} confirmados`);
  if (hoje.pending) detalhes.push(`${hoje.pending} pendentes`);
  if (hoje.missed) detalhes.push(`${hoje.missed} ${hoje.missed === 1 ? "falta" : "faltas"}`);

  const vencemAmanha = finance.upcomingPayables.filter((p) => p.due_date === amanha());

  const atencao: HomeAttentionItem[] = [];
  if (finance.kpis.overdue.total > 0) {
    atencao.push({
      icon: DollarSign,
      color: "#EF4444",
      bg: "rgba(239,68,68,0.10)",
      label: `${formatBRL(finance.kpis.overdue.total)} em recebimentos atrasados`,
      to: "/recebimentos",
    });
  }
  if (vencemAmanha.length > 0) {
    atencao.push({
      icon: CalendarDays,
      color: "#F97316",
      bg: "rgba(249,115,22,0.10)",
      label: `${vencemAmanha.length} ${vencemAmanha.length === 1 ? "pagamento vence" : "pagamentos vencem"} amanhã`,
      to: "/pagamentos",
    });
  }
  if (hoje.pending > 0) {
    atencao.push({
      icon: AlertTriangle,
      color: "#2F80ED",
      bg: "rgba(47,128,237,0.10)",
      label: `${hoje.pending} ${hoje.pending === 1 ? "atendimento de hoje sem confirmação" : "atendimentos de hoje sem confirmação"}`,
      to: "/agenda",
    });
  }

  return {
    agendaHoje: { total: hoje.total, detalhes },
    confirmacoesPendentes: hoje.pending,
    recebidoHoje: finance.kpis.revenue.current,
    alertas: { total: atencao.length, valorEmAtraso: finance.kpis.overdue.total },
    proximos: hoje.next.map((a, i) => ({
      id: a.id,
      time: a.time,
      initials: iniciais(a.patientName),
      patient: a.patientName,
      procedure: a.procedureName,
      confirmado: a.status === "confirmed" || a.status === "in_progress",
      ...ACENTOS[i % ACENTOS.length],
    })),
    atencao,
  };
}
