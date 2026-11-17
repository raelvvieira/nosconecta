import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaFilters } from "./types";

type Opcao = { value: string; label: string };

const TIPOS: Opcao[] = [
  { value: "consultation", label: "Consulta" },
  { value: "evaluation", label: "Avaliação" },
  { value: "procedure", label: "Procedimento" },
  { value: "return", label: "Retorno" },
  { value: "emergency", label: "Emergência" },
];

const STATUS: Opcao[] = [
  { value: "confirmed", label: "Confirmado" },
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluído" },
  { value: "missed", label: "Faltou" },
  { value: "cancelled", label: "Cancelado" },
];

/** Um filtro: pílula discreta que ganha cor quando está valendo. */
function Pilula({
  rotulo,
  value,
  opcoes,
  onChange,
}: {
  rotulo: string;
  value: string;
  opcoes: Opcao[];
  onChange: (v: string) => void;
}) {
  const ativo = value !== "";
  return (
    <label
      className={cn(
        "relative inline-flex items-center rounded-full text-xs transition-colors",
        ativo ? "bg-pink/10 text-pink" : "bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="sr-only">{rotulo}</span>
      <select
        aria-label={rotulo}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10.5rem] cursor-pointer appearance-none truncate rounded-full bg-transparent py-1.5 pl-3 pr-7 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-pink/30"
      >
        <option value="">{rotulo}</option>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-3 w-3 opacity-60"
        strokeWidth={2.25}
      />
    </label>
  );
}

/**
 * Todos os filtros da agenda num lugar só, dentro do card do calendário.
 * Substitui o card "Filtros" da lateral, que repetia Profissional e Sala.
 */
export function FiltrosDaAgenda({
  filters,
  professionals,
  rooms,
  onFiltersChange,
}: {
  filters: AgendaFilters;
  professionals: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  onFiltersChange: (f: AgendaFilters) => void;
}) {
  const temFiltro = Boolean(
    filters.professionalId || filters.roomId || filters.type || filters.status,
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pilula
        rotulo="Profissional"
        value={filters.professionalId}
        opcoes={professionals.map((p) => ({ value: p.id, label: p.name }))}
        onChange={(v) => onFiltersChange({ ...filters, professionalId: v })}
      />
      <Pilula
        rotulo="Sala"
        value={filters.roomId}
        opcoes={rooms.map((r) => ({ value: r.id, label: r.name }))}
        onChange={(v) => onFiltersChange({ ...filters, roomId: v })}
      />
      <Pilula
        rotulo="Tipo"
        value={filters.type}
        opcoes={TIPOS}
        onChange={(v) => onFiltersChange({ ...filters, type: v })}
      />
      <Pilula
        rotulo="Status"
        value={filters.status}
        opcoes={STATUS}
        onChange={(v) => onFiltersChange({ ...filters, status: v })}
      />
      {temFiltro && (
        <button
          type="button"
          onClick={() => onFiltersChange({ professionalId: "", roomId: "", type: "", status: "" })}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-pink"
        >
          <X className="h-3 w-3" strokeWidth={2.25} />
          Limpar
        </button>
      )}
    </div>
  );
}
