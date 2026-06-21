import type { AppointmentStatus, AppointmentType } from "./types";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
  missed: "Faltou",
  cancelled: "Cancelado",
};

export const TYPE_LABEL: Record<AppointmentType, string> = {
  consultation: "Consulta",
  evaluation: "Avaliação",
  procedure: "Procedimento",
  return: "Retorno",
  emergency: "Emergência",
};

export function statusStyle(status: AppointmentStatus): {
  bg: string;
  border: string;
  badge: string;
  text: string;
} {
  switch (status) {
    case "confirmed":
    case "completed":
      return {
        bg: "rgba(34,197,94,0.08)",
        border: "rgba(34,197,94,0.18)",
        badge: "#22C55E",
        text: "#166534",
      };
    case "in_progress":
      return {
        bg: "rgba(139,124,255,0.10)",
        border: "rgba(139,124,255,0.20)",
        badge: "#8B7CFF",
        text: "#4B32C3",
      };
    case "pending":
      return {
        bg: "rgba(255,138,76,0.10)",
        border: "rgba(255,138,76,0.20)",
        badge: "#FF8A4C",
        text: "#92400E",
      };
    case "missed":
      return {
        bg: "rgba(239,68,68,0.08)",
        border: "rgba(239,68,68,0.18)",
        badge: "#EF4444",
        text: "#991B1B",
      };
    case "cancelled":
      return {
        bg: "rgba(148,163,184,0.08)",
        border: "rgba(148,163,184,0.18)",
        badge: "#94A3B8",
        text: "#475569",
      };
  }
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const HOUR_HEIGHT = 64;
export const START_HOUR = 7;

export function apptTop(startTime: string): number {
  return (timeToMinutes(startTime) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
}

export function apptHeight(startTime: string, endTime: string): number {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) * (HOUR_HEIGHT / 60);
}
