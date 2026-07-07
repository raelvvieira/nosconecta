import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
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
import { formatBRL } from "@/lib/finance/format";

interface Props {
  open: boolean;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultPatient?: { id: string; name: string } | null;
  catalog?: { professionals: Professional[]; procedures: Procedure[]; rooms: Room[] };
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
  onClose,
  onSave,
}: Props) {
  const isEdit = !!appointment;
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

  useEffect(() => {
    if (!open) return;
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
    toast.success(isEdit ? "Agendamento atualizado" : "Agendamento criado");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div
        className="w-full max-w-[480px] bg-white flex flex-col overflow-hidden"
        style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.10)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-[#EEF2F7]"
          style={{
            background:
              "linear-gradient(135deg,rgba(255,111,167,0.06) 0%,rgba(255,138,76,0.04) 100%)",
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">
              {isEdit ? "Detalhes do Agendamento" : "Novo Agendamento"}
            </h2>
            {isEdit && <p className="text-sm text-[#6B7280] mt-0.5">{appointment?.patientName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-xl text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Dados do paciente */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              Paciente
            </h3>
            <div className="space-y-2">
              <Label htmlFor="patient" className="text-sm text-[#374151]">
                Nome do paciente *
              </Label>
              <PatientCombobox
                value={form.patientName ?? ""}
                patientId={form.patientId}
                onChange={({ id, name }) =>
                  setForm((f) => ({ ...f, patientId: id, patientName: name }))
                }
                className="rounded-xl border-[#EEF2F7]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes_patient" className="text-sm text-[#374151]">
                Observações
              </Label>
              <Textarea
                id="notes_patient"
                placeholder="Observações sobre o paciente..."
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="rounded-xl border-[#EEF2F7] resize-none"
              />
            </div>
          </section>

          {/* Dados do atendimento */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              Atendimento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Procedimento</Label>
                <select
                  className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6FA7]/30"
                  value={form.procedureName}
                  onChange={(e) => handleProcedure(e.target.value)}
                >
                  <option value="">Selecionar...</option>
                  {procedures.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Tipo</Label>
                <select
                  className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6FA7]/30"
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
                <Label className="text-sm text-[#374151]">Profissional</Label>
                <select
                  className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6FA7]/30"
                  value={form.professionalId}
                  onChange={(e) => handleProfessional(e.target.value)}
                >
                  <option value="">Selecionar...</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Sala</Label>
                <select
                  className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6FA7]/30"
                  value={form.roomId}
                  onChange={(e) => handleRoom(e.target.value)}
                >
                  <option value="">Selecionar...</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Data e horário */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              Data e Horário
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-2">
                <Label className="text-sm text-[#374151]">Data</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="rounded-xl border-[#EEF2F7]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Início</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="rounded-xl border-[#EEF2F7]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Fim</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="rounded-xl border-[#EEF2F7]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#374151]">Status</Label>
                <select
                  className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none"
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              Financeiro
            </h3>
            <div className="space-y-2">
              <Label className="text-sm text-[#374151]">Valor previsto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">
                  R$
                </span>
                <Input
                  type="number"
                  value={form.expectedRevenue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expectedRevenue: Number(e.target.value) }))
                  }
                  className="rounded-xl border-[#EEF2F7] pl-9"
                />
              </div>
              {(form.expectedRevenue ?? 0) > 0 && (
                <p className="text-xs text-[#6B7280]">
                  Valor formatado:{" "}
                  <span className="font-medium text-[#111827]">
                    {formatBRL(form.expectedRevenue ?? 0)}
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-[#F8F8FA]">
              <div>
                <p className="text-sm font-medium text-[#111827]">Gerar cobrança ao concluir</p>
                <p className="text-xs text-[#6B7280]">
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
        <div className="px-6 py-4 border-t border-[#EEF2F7] flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 rounded-xl text-white font-semibold"
            style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
          >
            {isEdit ? "Salvar alterações" : "Salvar Agendamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
