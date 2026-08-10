import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { NOTIFICATION_KINDS, NotificationRow } from "../notification-utils";
import { ConfirmCompletion } from "../ConfirmCompletion";
import { formatBRL } from "@/lib/finance/format";

interface Props {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (
    id: string,
    status: AppointmentStatus,
    actualRevenue?: number,
    retornoEm?: string | null,
    generateFinancial?: boolean,
  ) => void;
  onEdit: (appt: Appointment) => void;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-9 w-9 rounded-xl grid place-items-center bg-surface shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
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

  // "Concluir" saiu daqui: virou o bloco de confirmação no topo, que pede o
  // valor cobrado junto. Um botão de ação rápida não tem onde pedir isso.
  const actions: { label: string; icon: typeof CheckCircle2; status?: AppointmentStatus; onClick?: () => void; tone: string }[] = [
    { label: "Confirmar", icon: CheckCircle2, status: "confirmed", tone: "var(--success)" },
    { label: "Iniciar", icon: PlayCircle, status: "in_progress", tone: "var(--violet)" },
    { label: "Reagendar", icon: CalendarClock, onClick: () => { onEdit(a); onClose(); }, tone: "var(--pink)" },
    { label: "Marcar falta", icon: UserX, status: "missed", tone: "var(--danger)" },
    { label: "Cancelar", icon: XCircle, status: "cancelled", tone: "var(--muted-foreground)" },
  ];

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="border-0" style={{ background: "var(--surface)" }}>
        <DrawerTitle className="sr-only">{a.patientName}</DrawerTitle>

        <div className="p-5 space-y-4">
          {/* Patient header */}
          <div className="flex items-center gap-3">
            <div
              className="h-14 w-14 rounded-full grid place-items-center text-white text-lg font-bold shrink-0"
              style={{ background: "var(--gradient-primary)" }}
            >
              {initialsOf(a.patientName)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground truncate">{a.patientName}</h2>
              <p className="text-sm text-muted-foreground truncate">{a.procedureName}</p>
            </div>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0"
              style={{ background: s.bg, color: s.text }}
            >
              {STATUS_LABEL[a.status]}
            </span>
          </div>

          <ConfirmCompletion
            expectedRevenue={a.expectedRevenue}
            actualRevenue={a.status === "completed" ? (a.actualRevenue ?? 0) : null}
            appointmentDate={a.date}
            generateFinancial={a.generateFinancial ?? true}
            onConfirm={({ valor, retornoEm, gerarCobranca }) => {
              onStatusChange(a.id, "completed", valor, retornoEm, gerarCobranca);
              onClose();
            }}
          />

          {/* Info */}
          <div
            className="bg-white rounded-[20px] px-4 divide-y divide-surface-muted"
            style={{ border: "1px solid var(--surface-muted)", boxShadow: "var(--shadow-2)" }}
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
            className="bg-white rounded-[20px] px-4 py-1 divide-y divide-surface-muted"
            style={{ border: "1px solid var(--surface-muted)", boxShadow: "var(--shadow-2)" }}
          >
            {NOTIFICATION_KINDS.map((k) => (
              <NotificationRow
                key={k.value}
                label={k.label}
                kind={k.value}
                notifications={a.notifications}
              />
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
                style={{ border: "1px solid var(--surface-muted)" }}
              >
                <act.icon className="h-5 w-5" style={{ color: act.tone }} strokeWidth={1.75} />
                <span className="text-2xs font-medium text-foreground-secondary">{act.label}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={() => { onEdit(a); onClose(); }}
            className="w-full h-12 rounded-[14px] text-white font-semibold gap-2"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Pencil className="h-4 w-4" /> Editar agendamento
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
