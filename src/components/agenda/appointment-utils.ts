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

/**
 * Cor do bloco de agendamento por situação.
 *
 * Era uma paleta paralela em hex e rgba — verde `#22C55E`, roxo `#8B7CFF`,
 * laranja `#FF8A4C` — que não é a do resto do app: a agenda ficava com um
 * verde e um roxo próprios, ao lado de telas usando `--success` e `--violet`.
 * Agora sai tudo dos mesmos tokens de status.
 *
 * `color-mix` no fundo e na borda em vez de rgba fixo: assim, mexer no token
 * de status acerta o bloco da agenda junto, em vez de deixá-lo para trás.
 */
export function statusStyle(status: AppointmentStatus): {
  bg: string;
  border: string;
  badge: string;
  text: string;
} {
  const doToken = (token: string) => ({
    bg: `color-mix(in oklab, var(${token}) 9%, transparent)`,
    border: `color-mix(in oklab, var(${token}) 20%, transparent)`,
    badge: `var(${token})`,
    // Texto sobre o fundo claro: uma versão bem escurecida do próprio status,
    // porque o token puro sobre 9% de si mesmo não alcança contraste de leitura.
    text: `color-mix(in oklab, var(${token}) 72%, var(--foreground))`,
  });

  switch (status) {
    case "confirmed":
    case "completed":
      return doToken("--success");
    case "in_progress":
      return doToken("--violet");
    case "pending":
      return doToken("--warning");
    case "missed":
      return doToken("--danger");
    case "cancelled":
      return {
        bg: "var(--surface-muted)",
        border: "var(--divider)",
        badge: "var(--foreground-subtle)",
        text: "var(--muted-foreground)",
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
