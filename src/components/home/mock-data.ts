import type { LucideIcon } from "lucide-react";
import { Calendar, Clock, DollarSign } from "lucide-react";

export interface HomeAppointment {
  time: string;
  initials: string;
  patient: string;
  procedure: string;
  professional: string;
  status: "Confirmado" | "Pendente";
  accentColor: string;
  avatarBg: string;
}

export const appointments: HomeAppointment[] = [
  { time: "14:00", initials: "JS", patient: "João Silva", procedure: "Clareamento Dental", professional: "Dr. Carlos", status: "Confirmado", accentColor: "#FF5F7E", avatarBg: "rgba(255,95,126,0.12)" },
  { time: "15:00", initials: "MS", patient: "Maria Souza", procedure: "Limpeza + Raspagem", professional: "Dra. Ana", status: "Pendente", accentColor: "#8B5CF6", avatarBg: "rgba(139,92,246,0.12)" },
  { time: "16:30", initials: "PL", patient: "Pedro Lima", procedure: "Avaliação Ortodôntica", professional: "Dr. Carlos", status: "Confirmado", accentColor: "#22C55E", avatarBg: "rgba(34,197,94,0.12)" },
];

export interface HomeAttentionItem {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
  highlight: string;
}

export const attentionItems: HomeAttentionItem[] = [
  { icon: DollarSign, color: "#EF4444", bg: "rgba(239,68,68,0.10)", label: "R$ 2.180 em recebimentos atrasados", highlight: "R$ 2.180" },
  { icon: Calendar, color: "#F97316", bg: "rgba(249,115,22,0.10)", label: "2 pagamentos vencem amanhã", highlight: "2 pagamentos" },
  { icon: Clock, color: "#2F80ED", bg: "rgba(47,128,237,0.10)", label: "3 horários livres hoje", highlight: "3 horários" },
];

// Mocked "Agenda de hoje" / "Confirmações pendentes" — sem backend de agenda ainda.
export const AGENDA_TODAY_COUNT = 23;
export const AGENDA_TODAY_DETAILS = ["18 confirmados", "4 pendentes", "1 falta"];
export const PENDING_CONFIRMATIONS_COUNT = 4;
