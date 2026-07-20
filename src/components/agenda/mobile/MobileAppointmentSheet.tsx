import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  PlayCircle,
  CheckCheck,
  CalendarClock,
  UserX,
  XCircle,
  Pencil,
  Clock,
  User,
  DoorOpen,
  Stethoscope,
  DollarSign,
} from "lucide-react";
import type { Appointment, AppointmentStatus } from "../types";
import { statusStyle, STATUS_LABEL, TYPE_LABEL } from "../appointment-utils";
import { NOTIFICATION_KINDS, NotificationBadge, statusFor } from "../notification-utils";
import { formatBRL } from "@/lib/finance/format";

interface Props {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onEdit: (appt: Appointment) => void;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#F8F8FA] shrink-0">
        <Icon className="h-4 w-4 text-[#6B7280]" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-[#6B7280]">{label}</p>
        <p className="text-sm font-medium text-[#111827] truncate">{value}</p>
      </div>
    </div>
  );
}

export function MobileAppointmentSheet({ appointment, open, onClose, onStatusChange, onEdit }: Props) {
  if (!appointment) return null;
  const a = appointment;
  const s = statusStyle(a.status);

  const setStatus = (status: AppointmentStatus) => {
    onStatusChange(a.id, status);
    onClose();
  };

  const actions: { label: string; icon: typeof CheckCircle2; status?: AppointmentStatus; onClick?: () => void; tone: string }[] = [
    { label: "Confirmar", icon: CheckCircle2, status: "confirmed", tone: "#22C55E" },
    { label: "Iniciar", icon: PlayCircle, status: "in_progress", tone: "#8B7CFF" },
    { label: "Concluir", icon: CheckCheck, status: "completed", tone: "#16A34A" },
    { label: "Reagendar", icon: CalendarClock, onClick: () => { onEdit(a); onClose(); }, tone: "#FF6FA7" },
    { label: "Marcar falta", icon: UserX, status: "missed", tone: "#EF4444" },
    { label: "Cancelar", icon: XCircle, status: "cancelled", tone: "#64748B" },
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] border-0 p-0 max-h-[88vh] overflow-y-auto"
        style={{ background: "#F8F8FA" }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#E2E8F0]" />

        <div className="p-5 space-y-4">
          {/* Patient header */}
          <div className="flex items-center gap-3">
            <div
              className="h-14 w-14 rounded-full grid place-items-center text-white text-lg font-bold shrink-0"
              style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
            >
              {initialsOf(a.patientName)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-[#111827] truncate">{a.patientName}</h2>
              <p className="text-sm text-[#6B7280] truncate">{a.procedureName}</p>
            </div>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0"
              style={{ background: s.bg, color: s.text }}
            >
              {STATUS_LABEL[a.status]}
            </span>
          </div>

          {/* Info */}
          <div
            className="bg-white rounded-[20px] px-4 divide-y divide-[#F1F5F9]"
            style={{ border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}
          >
            <InfoRow icon={Clock} label="Data e horário" value={`${a.date.split("-").reverse().join("/")} · ${a.startTime} – ${a.endTime}`} />
            <InfoRow icon={Stethoscope} label="Tipo" value={TYPE_LABEL[a.type]} />
            <InfoRow icon={User} label="Profissional" value={a.professionalName || "—"} />
            <InfoRow icon={DoorOpen} label="Sala" value={a.roomName || "—"} />
            <InfoRow icon={DollarSign} label="Valor previsto" value={formatBRL(a.expectedRevenue)} />
            {a.notes && <InfoRow icon={Pencil} label="Observações" value={a.notes} />}
          </div>

          {/* Confirmação e lembretes (Brevo) */}
          <div
            className="bg-white rounded-[20px] px-4 py-1 divide-y divide-[#F1F5F9]"
            style={{ border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}
          >
            {NOTIFICATION_KINDS.map((k) => (
              <div key={k.value} className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-sm text-[#374151] shrink-0">{k.label}</span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <NotificationBadge label="E-mail" status={statusFor(a.notifications, k.value, "email")} />
                  <NotificationBadge label="SMS" status={statusFor(a.notifications, k.value, "sms")} />
                  <NotificationBadge label="WhatsApp" status={statusFor(a.notifications, k.value, "whatsapp")} />
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            {actions.map((act) => (
              <button
                key={act.label}
                type="button"
                onClick={() => (act.onClick ? act.onClick() : act.status && setStatus(act.status))}
                className="bg-white rounded-[16px] py-3 flex flex-col items-center gap-1.5 active:scale-[0.97] transition-transform"
                style={{ border: "1px solid #EEF2F7" }}
              >
                <act.icon className="h-5 w-5" style={{ color: act.tone }} strokeWidth={1.75} />
                <span className="text-[11px] font-medium text-[#374151]">{act.label}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={() => { onEdit(a); onClose(); }}
            className="w-full h-12 rounded-[14px] text-white font-semibold gap-2"
            style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
          >
            <Pencil className="h-4 w-4" /> Editar agendamento
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
