import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { searchPatients, type PatientSearchResult } from "@/lib/patients/patients.functions";

/**
 * Busca de paciente com autocomplete: digita e filtra pacientes já
 * cadastrados; se não encontrar, permite seguir com o nome digitado
 * (fica sem patientId vinculado).
 */
export function PatientCombobox({
  value,
  patientId,
  onChange,
  placeholder = "Buscar paciente...",
  disabled,
  className,
}: {
  value: string;
  patientId?: string;
  onChange: (patient: { id?: string; name: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fetchPatients = useServerFn(searchPatients);

  const { data: results = [] } = useQuery({
    queryKey: ["patients-search", query],
    queryFn: () => fetchPatients({ data: { q: query } }) as Promise<PatientSearchResult[]>,
    enabled: open,
    staleTime: 15_000,
  });

  const pick = (patient: PatientSearchResult) => {
    onChange({ id: patient.id, name: patient.name });
    setOpen(false);
    setQuery("");
  };

  const useTyped = () => {
    onChange({ id: undefined, name: query.trim() });
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Nome do paciente..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup>
              {results.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => pick(p)}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn("h-4 w-4 shrink-0", patientId === p.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  {p.phone && <span className="shrink-0 text-xs text-muted-foreground">{p.phone}</span>}
                </CommandItem>
              ))}

              {query.trim().length > 0 && (
                <CommandItem
                  value={`__free__${query}`}
                  onSelect={useTyped}
                  className="flex items-center gap-2 text-primary"
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span className="truncate">Usar “{query.trim()}” (paciente novo)</span>
                </CommandItem>
              )}

              {results.length === 0 && !query.trim() && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Digite para buscar um paciente
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
