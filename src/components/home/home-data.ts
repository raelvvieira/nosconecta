import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BellRing, CalendarDays, DollarSign } from "lucide-react";
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

/** Enfeite rotativo dos avatares da lista de hoje, em token — eram três hex
 *  soltos, herdados dos dados de exemplo, que não acompanhavam a paleta. */
const ACENTOS = [
  { accentColor: "var(--pink)", avatarBg: "var(--pink-soft)" },
  { accentColor: "var(--violet)", avatarBg: "var(--violet-soft)" },
  { accentColor: "var(--success)", avatarBg: "var(--success-soft)" },
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

export function montarDadosHome(
  finance: OverviewData,
  hoje: HomeToday,
  /** Avisos não lidos da caixa da clínica (paciente pediu remarcar, etc.).
   *  Opcional para as chamadas que ainda não passam esse dado não quebrarem. */
  avisosEmAberto = 0,
): HomeData {
  const detalhes: string[] = [];
  if (hoje.confirmed) detalhes.push(`${hoje.confirmed} confirmados`);
  if (hoje.pending) detalhes.push(`${hoje.pending} pendentes`);
  if (hoje.missed) detalhes.push(`${hoje.missed} ${hoje.missed === 1 ? "falta" : "faltas"}`);

  const vencemAmanha = finance.upcomingPayables.filter((p) => p.due_date === amanha());

  const atencao: HomeAttentionItem[] = [];
  if (finance.kpis.overdue.total > 0) {
    atencao.push({
      icon: DollarSign,
      color: "var(--danger)",
      bg: "var(--danger-soft)",
      label: `${formatBRL(finance.kpis.overdue.total)} em recebimentos atrasados`,
      to: "/recebimentos",
    });
  }
  if (vencemAmanha.length > 0) {
    atencao.push({
      icon: CalendarDays,
      color: "var(--warning)",
      bg: "var(--warning-soft)",
      label: `${vencemAmanha.length} ${vencemAmanha.length === 1 ? "pagamento vence" : "pagamentos vencem"} amanhã`,
      to: "/pagamentos",
    });
  }
  if (hoje.pending > 0) {
    atencao.push({
      icon: AlertTriangle,
      color: "var(--info)",
      bg: "var(--info-soft)",
      label: `${hoje.pending} ${hoje.pending === 1 ? "atendimento de hoje sem confirmação" : "atendimentos de hoje sem confirmação"}`,
      to: "/agenda",
    });
  }

  if (avisosEmAberto > 0) {
    atencao.push({
      icon: BellRing,
      color: "var(--coral)",
      bg: "var(--coral-soft)",
      label: `${avisosEmAberto} ${avisosEmAberto === 1 ? "aviso da equipe em aberto" : "avisos da equipe em aberto"}`,
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
