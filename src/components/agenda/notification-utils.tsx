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

export function statusFor(
  notifications: AppointmentNotification[] | undefined,
  kind: NotificationKind,
  channel: NotificationChannel,
): NotificationStatus | "not_sent" {
  return notifications?.find((n) => n.kind === kind && n.channel === channel)?.status ?? "not_sent";
}

export function NotificationBadge({
  label,
  status,
}: {
  label: string;
  status: NotificationStatus | "not_sent";
}) {
  const style =
    status === "sent"
      ? { bg: "rgba(34,197,94,0.12)", color: "#16A34A", text: "Enviado" }
      : status === "failed"
        ? { bg: "rgba(239,68,68,0.12)", color: "#EF4444", text: "Falhou" }
        : status === "skipped"
          ? { bg: "rgba(148,163,184,0.15)", color: "#64748B", text: "Sem contato" }
          : { bg: "rgba(148,163,184,0.12)", color: "#94A3B8", text: "Pendente" };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
      title={`${label}: ${style.text}`}
    >
      {label} · {style.text}
    </span>
  );
}
