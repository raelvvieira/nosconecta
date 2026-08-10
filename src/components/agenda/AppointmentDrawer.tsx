import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { Combobox } from "@/components/finance/Combobox";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Professional,
  Procedure,
  Room,
} from "./types";
import {
  professionals as fallbackProfessionals,
  procedures as fallbackProcedures,
  rooms as fallbackRooms,
} from "./mock-data";
import { STATUS_LABEL, TYPE_LABEL } from "./appointment-utils";
import { NOTIFICATION_KINDS, NotificationBadge, statusFor } from "./notification-utils";
import { formatBRL } from "@/lib/finance/format";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";

interface Props {
  open: boolean;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultPatient?: { id: string; name: string } | null;
  catalog?: { professionals: Professional[]; procedures: Procedure[]; rooms: Room[] };
  isSaving?: boolean;
  /** Aviso de contexto quando aberto fora da Agenda (ex.: a partir do chat). */
  origin?: string;
  /**
   * Contato de origem, quando o agendamento nasce de uma conversa de WhatsApp.
   *
   * Muda a seção Paciente: o nome vira campo editável (o do WhatsApp costuma
   * ser apelido, emoji ou o próprio número) e o telefone aparece para
   * conferência. Sem isto o formulário se comporta exatamente como na Agenda.
   */
  contact?: { name: string | null; phone: string | null; crmContactId: string | null } | null;
  onClose: () => void;
  onSave: (data: Partial<Appointment>) => void;
}

const STATUS_OPTIONS: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
];
const TYPE_OPTIONS: AppointmentType[] = [
  "consultation",
  "evaluation",
  "procedure",
  "return",
  "emergency",
];

export function AppointmentDrawer({
  open,
  appointment,
  defaultDate,
  defaultPatient,
  catalog,
  isSaving,
  origin,
  contact,
  onClose,
  onSave,
}: Props) {
  const isEdit = !!appointment;

  // Quem clicou em "vincular a um paciente existente" quer o combobox de volta,
  // mesmo sem ter escolhido ninguém ainda.
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);

  const professionals = catalog?.professionals ?? fallbackProfessionals;
  const procedures = catalog?.procedures ?? fallbackProcedures;
  const rooms = catalog?.rooms ?? fallbackRooms;

  const [form, setForm] = useState<Partial<Appointment>>({
    patientId: appointment?.patientId ?? defaultPatient?.id,
    patientName: appointment?.patientName ?? defaultPatient?.name ?? "",
    procedureName: appointment?.procedureName ?? "",
    professionalId: appointment?.professionalId ?? "",
    professionalName: appointment?.professionalName ?? "",
    roomId: appointment?.roomId ?? "",
    roomName: appointment?.roomName ?? "",
    date: appointment?.date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    startTime: appointment?.startTime ?? "09:00",
    endTime: appointment?.endTime ?? "10:00",
    status: appointment?.status ?? "pending",
    type: appointment?.type ?? "consultation",
    expectedRevenue: appointment?.expectedRevenue ?? 0,
    notes: appointment?.notes ?? "",
    generateFinancial: appointment?.generateFinancial ?? true,
  });

  // Nome editável quando o agendamento nasce de uma conversa e ainda não há
  // paciente de verdade por trás. Vinculando um paciente existente, ou editando
  // um agendamento já salvo, o campo volta a ser o combobox de sempre.
  const modoContato = Boolean(contact) && !isEdit && !form.patientId && !buscandoPaciente;

  useEffect(() => {
    if (!open) return;
    setBuscandoPaciente(false);
    setForm({
      patientId: appointment?.patientId ?? defaultPatient?.id,
      patientName: appointment?.patientName ?? defaultPatient?.name ?? "",
      procedureName: appointment?.procedureName ?? "",
      professionalId: appointment?.professionalId ?? "",
      professionalName: appointment?.professionalName ?? "",
      roomId: appointment?.roomId ?? "",
      roomName: appointment?.roomName ?? "",
      date: appointment?.date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
      startTime: appointment?.startTime ?? "09:00",
      endTime: appointment?.endTime ?? "10:00",
      status: appointment?.status ?? "pending",
      type: appointment?.type ?? "consultation",
      expectedRevenue: appointment?.expectedRevenue ?? 0,
      notes: appointment?.notes ?? "",
      generateFinancial: appointment?.generateFinancial ?? true,
    });
  }, [open, appointment, defaultDate, defaultPatient?.id, defaultPatient?.name]);

  const handleProcedure = (name: string) => {
    const proc = procedures.find((p) => p.name === name);
    if (proc) {
      const startMins = form.startTime
        ? Number(form.startTime.split(":")[0]) * 60 + Number(form.startTime.split(":")[1])
        : 9 * 60;
      const endMins = startMins + proc.duration;
      const endTime = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
      setForm((f) => ({ ...f, procedureName: name, expectedRevenue: proc.price, endTime }));
    } else {
      setForm((f) => ({ ...f, procedureName: name }));
    }
  };

  const handleProfessional = (id: string) => {
    const prof = professionals.find((p) => p.id === id);
    setForm((f) => ({ ...f, professionalId: id, professionalName: prof?.name ?? "" }));
  };

  const handleRoom = (id: string) => {
    const room = rooms.find((r) => r.id === id);
    setForm((f) => ({ ...f, roomId: id, roomName: room?.name ?? "" }));
  };

  const handleSave = () => {
    if (!form.patientName?.trim()) {
      toast.error("Informe o nome do paciente");
      return;
    }
    onSave(form);
  };

  if (!open) return null;

  return (
    // Pop-up centralizado (antes era gaveta lateral): mesmo formulário é
    // aberto tanto pela Agenda quanto pelo chat, e no chat uma gaveta
    // lateral cobriria a conversa que se está lendo pra agendar.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[24px] bg-white"
        style={{ boxShadow: "var(--shadow-4)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-surface-muted"
          style={{
            background:
              "linear-gradient(135deg,color-mix(in oklab, var(--pink) 6%, transparent) 0%,color-mix(in oklab, var(--coral) 4%, transparent) 100%)",
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isEdit ? "Detalhes do Agendamento" : "Novo Agendamento"}
            </h2>
            {isEdit && <p className="text-sm text-muted-foreground mt-0.5">{appointment?.patientName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-xl text-muted-foreground hover:bg-surface transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {origin && (
            <p className="rounded-xl bg-coral-soft px-3 py-2 text-xs leading-5 text-coral">{origin}</p>
          )}

          {/* Dados do paciente */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Paciente
            </h3>
            <div className="space-y-2">
              <Label htmlFor="patient" className="text-sm text-foreground-secondary">
                Nome do paciente *
              </Label>
              {modoContato ? (
                <>
                  {/* Campo de texto comum, não o combobox: o nome que veio do
                      WhatsApp quase nunca é o nome da pessoa, e o que se quer
                      aqui é corrigir o que está escrito — não procurar alguém. */}
                  <Input
                    id="patient"
                    value={form.patientName ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                    placeholder="Nome completo do paciente"
                    className="rounded-xl border-surface-muted"
                  />
                  {/* `relative tap-44` porque o texto sozinho dá 16px de alvo,
                      bem abaixo do mínimo que o resto do app já respeita. */}
                  <button
                    type="button"
                    onClick={() => setBuscandoPaciente(true)}
                    className="relative tap-44 text-xs text-coral underline-offset-2 hover:underline"
                  >
                    Vincular a um paciente existente
                  </button>
                </>
              ) : (
                <PatientCombobox
                  value={form.patientName ?? ""}
                  patientId={form.patientId}
                  onChange={({ id, name }) =>
                    setForm((f) => ({ ...f, patientId: id, patientName: name }))
                  }
                  className="rounded-xl border-surface-muted"
                />
              )}
            </div>

            {/* Telefone do WhatsApp, só leitura. É o número da própria conversa,
                então já está correto — aparece para conferência porque é ele que
                vai para a Meta, e um número errado ali é um match perdido. */}
            {!isEdit && contact?.phone && (
              <div className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Telefone do WhatsApp
                </p>
                <p className="font-mono text-sm text-foreground">
                  {formatWhatsappNumber(contact.phone)}
                </p>
                <p className="text-2xs leading-4 text-muted-foreground">
                  Confira antes de salvar: é este número que será enviado à Meta.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes_patient" className="text-sm text-foreground-secondary">
                Observações
              </Label>
              <Textarea
                id="notes_patient"
                placeholder="Observações sobre o paciente..."
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="rounded-xl border-surface-muted resize-none"
              />
            </div>
          </section>

          {/* Confirmação e lembretes (Brevo) */}
          {isEdit && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirmação e Lembretes
              </h3>
              <div className="rounded-xl border border-surface-muted divide-y divide-surface-muted">
                {NOTIFICATION_KINDS.map((k) => (
                  <div key={k.value} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="text-sm text-foreground-secondary shrink-0">{k.label}</span>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <NotificationBadge
                        label="E-mail"
                        status={statusFor(appointment?.notifications, k.value, "email")}
                      />
                      <NotificationBadge
                        label="SMS"
                        status={statusFor(appointment?.notifications, k.value, "sms")}
                      />
                      <NotificationBadge
                        label="WhatsApp"
                        status={statusFor(appointment?.notifications, k.value, "whatsapp")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Dados do atendimento */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Atendimento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Procedimento</Label>
                <Combobox
                  value={form.procedureName ?? ""}
                  onChange={handleProcedure}
                  options={procedures.map((p) => ({ value: p.name, label: p.name }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar procedimento..."
                  emptyText="Nenhum procedimento encontrado"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Tipo</Label>
                <select
                  className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-pink/30"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as AppointmentType }))
                  }
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Profissional</Label>
                <Combobox
                  value={form.professionalId ?? ""}
                  onChange={handleProfessional}
                  options={professionals.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar profissional..."
                  emptyText="Nenhum profissional encontrado"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Sala</Label>
                <Combobox
                  value={form.roomId ?? ""}
                  onChange={handleRoom}
                  options={rooms.map((r) => ({ value: r.id, label: r.name }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar sala..."
                  emptyText="Nenhuma sala encontrada"
                />
              </div>
            </div>
          </section>

          {/* Data e horário */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Data e Horário
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-2">
                <Label className="text-sm text-foreground-secondary">Data</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="rounded-xl border-surface-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Início</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="rounded-xl border-surface-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Fim</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="rounded-xl border-surface-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Status</Label>
                <select
                  className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as AppointmentStatus }))
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Financeiro */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Financeiro
            </h3>
            <div className="space-y-2">
              <Label className="text-sm text-foreground-secondary">Valor previsto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  type="number"
                  value={form.expectedRevenue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expectedRevenue: Number(e.target.value) }))
                  }
                  className="rounded-xl border-surface-muted pl-9"
                />
              </div>
              {(form.expectedRevenue ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Valor formatado:{" "}
                  <span className="font-medium text-foreground">
                    {formatBRL(form.expectedRevenue ?? 0)}
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-surface">
              <div>
                <p className="text-sm font-medium text-foreground">Gerar cobrança ao concluir</p>
                <p className="text-xs text-muted-foreground">
                  Cria recebimento automaticamente ao concluir o atendimento
                </p>
              </div>
              <Switch
                checked={form.generateFinancial ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, generateFinancial: v }))}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-muted flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-xl text-white font-semibold"
            style={{ background: "var(--gradient-primary)" }}
          >
            {isSaving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar Agendamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
