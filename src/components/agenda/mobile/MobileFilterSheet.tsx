import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AgendaFilters, Professional, Room } from "../types";

interface Props {
  open: boolean;
  filters: AgendaFilters;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onApply: (f: AgendaFilters) => void;
}

const selectCls =
  "w-full text-sm border border-[#EEF2F7] rounded-[14px] px-3 py-3 text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6FA7]/30";

export function MobileFilterSheet({ open, filters, professionals, rooms, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<AgendaFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const clear = () => setDraft({ professionalId: "", roomId: "", type: "", status: "" });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] border-0 p-0"
        style={{ background: "#F8F8FA" }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#E2E8F0]" />
        <div className="p-5 space-y-4">
          <h2 className="text-lg font-semibold text-[#111827]">Filtros</h2>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-[#374151]">Profissional</Label>
              <select
                className={selectCls}
                value={draft.professionalId}
                onChange={(e) => setDraft((d) => ({ ...d, professionalId: e.target.value }))}
              >
                <option value="">Todos os profissionais</option>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-[#374151]">Sala</Label>
              <select
                className={selectCls}
                value={draft.roomId}
                onChange={(e) => setDraft((d) => ({ ...d, roomId: e.target.value }))}
              >
                <option value="">Todas as salas</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-[#374151]">Status</Label>
              <select
                className={selectCls}
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              >
                <option value="">Todos os status</option>
                <option value="confirmed">Confirmado</option>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="completed">Concluído</option>
                <option value="missed">Faltou</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-[#374151]">Tipo</Label>
              <select
                className={selectCls}
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
              >
                <option value="">Todos os tipos</option>
                <option value="consultation">Consulta</option>
                <option value="evaluation">Avaliação</option>
                <option value="procedure">Procedimento</option>
                <option value="return">Retorno</option>
                <option value="emergency">Emergência</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={clear} className="flex-1 h-12 rounded-[14px] border-[#EEF2F7]">
              Limpar filtros
            </Button>
            <Button
              onClick={() => { onApply(draft); onClose(); }}
              className="flex-1 h-12 rounded-[14px] text-white font-semibold"
              style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
            >
              Aplicar filtros
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
