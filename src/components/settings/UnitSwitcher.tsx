import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnitSelection } from "@/lib/settings/unit-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Só aparece para admin com mais de uma unidade cadastrada — quem não
 * administra nunca escolhe (o servidor carimba a unidade da própria conta
 * sozinho) e com uma unidade só não há o que trocar. A escolha aqui é só
 * preferência de UI (fica no localStorage): os formulários de criação usam
 * ela como sugestão, o servidor sempre confirma a unidade de verdade.
 */
export function UnitSwitcher({ collapsed }: { collapsed: boolean }) {
  const { isAdmin, units, selectedUnitId, setSelectedUnitId } = useUnitSelection();

  if (!isAdmin || units.length < 2) return null;

  const current = units.find((u) => u.id === selectedUnitId);
  const label = current?.name ?? "Todas as unidades";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-2xl text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition-colors",
            collapsed ? "h-10 w-10 justify-center" : "h-11 w-full px-3 gap-3",
          )}
          aria-label={`Unidade: ${label}`}
        >
          <Building2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          {!collapsed && <span className="truncate text-sm font-medium">{label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => setSelectedUnitId(null)} className={cn(!selectedUnitId && "font-semibold")}>
          Todas as unidades
        </DropdownMenuItem>
        {units.map((unit) => (
          <DropdownMenuItem
            key={unit.id}
            onClick={() => setSelectedUnitId(unit.id)}
            className={cn(selectedUnitId === unit.id && "font-semibold")}
          >
            {unit.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
