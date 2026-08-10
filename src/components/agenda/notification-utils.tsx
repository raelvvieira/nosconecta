import type {
  AppointmentNotification,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
} from "./types";

export const NOTIFICATION_KINDS: { value: NotificationKind; label: string }[] = [
  { value: "confirmation", label: "Confirmação" },
  { value: "reminder_day_before", label: "1 dia antes" },
  { value: "reminder_day_of", label: "No dia" },
];

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
];

export type EstadoEnvio = NotificationStatus | "not_sent";

export function statusFor(
  notifications: AppointmentNotification[] | undefined,
  kind: NotificationKind,
  channel: NotificationChannel,
): EstadoEnvio {
  return notifications?.find((n) => n.kind === kind && n.channel === channel)?.status ?? "not_sent";
}

// Cinco estados, não quatro. "pending" e "not_sent" caíam no mesmo rótulo
// "Pendente", mas são coisas diferentes: um é "a linha existe e está na fila",
// o outro é "nunca foi nem agendado". Quem olha para saber se o paciente foi
// avisado precisa distinguir os dois.
const ESTADOS: Record<EstadoEnvio, { cor: string; texto: string }> = {
  sent: { cor: "var(--success)", texto: "enviado" },
  failed: { cor: "var(--danger)", texto: "falhou" },
  // "Sem contato" cobre quatro causas na origem (sem e-mail, sem telefone,
  // WhatsApp não configurado, já enviado antes) — por isso o texto é vago de
  // propósito: prometer a causa exata seria mentir.
  skipped: { cor: "var(--foreground-subtle)", texto: "sem contato" },
  pending: { cor: "var(--warning)", texto: "na fila" },
  not_sent: { cor: "var(--divider)", texto: "não agendado" },
};

/**
 * Uma linha por momento, com uma bolinha por canal.
 *
 * Antes eram nove selos de texto (3 momentos × 3 canais), que ocupavam mais
 * espaço que todo o resto do formulário junto e ainda assim eram difíceis de
 * ler de relance. A informação é a mesma; o que muda é que agora ela cabe num
 * olhar, e o texto ao lado resume só o que foge do esperado.
 */
export function NotificationRow({
  label,
  notifications,
  kind,
}: {
  label: string;
  notifications: AppointmentNotification[] | undefined;
  kind: NotificationKind;
}) {
  const porCanal = CHANNELS.map((c) => ({ ...c, estado: statusFor(notifications, kind, c.value) }));

  const enviados = porCanal.filter((c) => c.estado === "sent");
  const falhas = porCanal.filter((c) => c.estado === "failed");

  // O resumo conta o que interessa: quem chegou, e o que deu errado. Se nada
  // saiu ainda, uma palavra basta.
  const resumo = enviados.length
    ? `Enviado por ${enviados.map((c) => c.label).join(", ")}${
        falhas.length ? ` · ${falhas.map((c) => c.label).join(", ")} falhou` : ""
      }`
    : falhas.length
      ? `Falhou em ${falhas.map((c) => c.label).join(", ")}`
      : porCanal.every((c) => c.estado === "skipped")
        ? "Sem contato cadastrado"
        : "Ainda não enviado";

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-sm text-foreground-secondary">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-2xs text-muted-foreground">{resumo}</span>
        <span className="flex shrink-0 items-center gap-1">
          {porCanal.map((c) => (
            <span
              key={c.value}
              className="h-2 w-2 rounded-full"
              style={{ background: ESTADOS[c.estado].cor }}
              title={`${c.label}: ${ESTADOS[c.estado].texto}`}
              aria-label={`${c.label}: ${ESTADOS[c.estado].texto}`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
