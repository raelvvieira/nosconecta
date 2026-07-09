import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlockedTime, Professional, Room } from "./types";

interface Props {
  open: boolean;
  defaultDate?: string;
  professionals: Professional[];
  rooms: Room[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (data: Partial<BlockedTime>) => void;
}

const REASONS = ["Almoço", "Treinamento", "Reunião", "Manutenção", "Particular", "Outro"];

export function BlockedTimeDrawer({
  open,
  defaultDate,
  professionals,
  rooms,
  isSaving,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<Partial<BlockedTime>>({
    professionalId: "",
    roomId: "",
    date: defaultDate ?? new Date().toISOString().slice(0, 10),
    startTime: "12:00",
    endTime: "13:00",
    reason: "Almoço",
  });

  const handleSave = () => {
    if (!form.professionalId) {
      toast.error("Selecione o profissional");
      return;
    }
    onSave(form);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="w-full max-w-[420px] bg-white flex flex-col overflow-hidden"
        style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.10)" }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#EEF2F7]">
          <h2 className="text-lg font-semibold text-[#111827]">Bloquear Horário</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-xl text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-[#374151]">Profissional *</Label>
            <select
              className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none"
              value={form.professionalId}
              onChange={(e) => setForm((f) => ({ ...f, professionalId: e.target.value }))}
            >
              <option value="">Selecionar...</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#374151]">Sala</Label>
            <select
              className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none"
              value={form.roomId}
              onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
            >
              <option value="">Todas as salas</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#374151]">Data</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-xl border-[#EEF2F7]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm text-[#374151]">Hora início</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="rounded-xl border-[#EEF2F7]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[#374151]">Hora fim</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="rounded-xl border-[#EEF2F7]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#374151]">Motivo</Label>
            <select
              className="w-full text-sm border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#111827] bg-white focus:outline-none"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            >
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#EEF2F7] flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-xl text-white"
            style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
          >
            {isSaving ? "Salvando..." : "Bloquear"}
          </Button>
        </div>
      </div>
    </div>
  );
}
