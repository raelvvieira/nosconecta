import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export type ComboOption = { value: string; label: string };

/**
 * Combobox com autocomplete: digita e filtra as opções salvas, escolhe pelo
 * dropdown, cria novas (onCreate) e remove existentes (onDelete).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar ou digitar...",
  emptyText = "Nenhuma opção",
  onCreate,
  onDelete,
  createLabelPrefix = "Adicionar",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: (label: string) => void;
  onDelete?: (value: string) => void;
  createLabelPrefix?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? (value || "");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;
  const exactMatch = options.some((o) => o.label.trim().toLowerCase() === q);
  const canCreate = !!onCreate && q.length > 0 && !exactMatch;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const create = () => {
    if (!onCreate) return;
    onCreate(query.trim());
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
            "flex h-11 w-full items-center justify-between rounded-2xl border border-input bg-background px-4 py-2 text-sm",
            "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); }
            }}
          />
          <CommandList>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => pick(o.value)}
                  className="flex items-center gap-2"
                >
                  <Check className={cn("h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(o.value); }}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remover ${o.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </CommandItem>
              ))}

              {canCreate && (
                <CommandItem value={`__create__${query}`} onSelect={create} className="flex items-center gap-2 text-primary">
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">{createLabelPrefix} “{query.trim()}”</span>
                </CommandItem>
              )}

              {filtered.length === 0 && !canCreate && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyText}</div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
