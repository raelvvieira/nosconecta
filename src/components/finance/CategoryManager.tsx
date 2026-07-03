import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createCategory, updateCategory, deleteCategory, listCategories,
} from "@/lib/finance/categories.functions";

type Category = { id: string; name: string };

/**
 * Seletor de categoria com gerenciamento inline (criar / renomear / excluir).
 * Usado nos sheets de novo pagamento (expense) e novo recebimento (income).
 */
export function CategoryManager({
  type,
  categories,
  value,
  onChange,
  onChanged,
  label = "Categoria",
  placeholder = "Selecione a categoria",
}: {
  type: "income" | "expense";
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onChanged: () => void;
  label?: string;
  placeholder?: string;
}) {
  const createFn = useServerFn(createCategory);
  const updateFn = useServerFn(updateCategory);
  const deleteFn = useServerFn(deleteCategory);
  const listFn = useServerFn(listCategories);
  const qc = useQueryClient();

  const catKey = ["finance", "categories", type];

  // Leitura autenticada da lista salva (consistente com a escrita).
  // Cai para as `categories` recebidas por prop enquanto carrega.
  const { data: fetched } = useQuery({
    queryKey: catKey,
    queryFn: () => listFn({ data: { type } }),
    staleTime: 30_000,
  });
  const base = (fetched as Category[] | undefined) ?? categories;
  const refresh = () => qc.invalidateQueries({ queryKey: catKey });

  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Mescla localmente itens criados/renomeados/removidos, para refletir na hora.
  const [extra, setExtra] = useState<Category[]>([]);
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const merged = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of base) map.set(c.id, c);
    for (const c of extra) map.set(c.id, c);
    return Array.from(map.values())
      .filter((c) => !removed.has(c.id))
      .map((c) => (renamed[c.id] ? { ...c, name: renamed[c.id] } : c));
  }, [base, extra, renamed, removed]);

  const create = useMutation({
    mutationFn: (name: string) => createFn({ data: { name, type } }),
    onSuccess: (row) => {
      toast.success("Categoria criada");
      setNewName("");
      if (row?.id) {
        setExtra((prev) => [...prev, { id: row.id, name: row.name }]);
        onChange(row.id);
      }
      refresh();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar categoria"),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; name: string }) => updateFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success("Categoria atualizada");
      setRenamed((prev) => ({ ...prev, [v.id]: v.name }));
      setEditingId(null);
      setEditingName("");
      refresh();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar categoria"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      toast.success("Categoria excluída");
      setRemoved((prev) => new Set(prev).add(id));
      if (value === id) onChange("");
      refresh();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir categoria"),
  });

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(name);
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditingName(c.name);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    update.mutate({ id: editingId, name });
  };

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => setManaging((m) => !m)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {managing ? "Fechar" : "Gerenciar"}
        </button>
      </div>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {merged.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma categoria</div>
          ) : (
            merged.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
          )}
        </SelectContent>
      </Select>

      {managing && (
        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          {/* Nova categoria */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nova categoria</Label>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Materiais odontológicos"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitNew(); }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="shrink-0"
                onClick={submitNew}
                disabled={busy || !newName.trim()}
                aria-label="Adicionar categoria"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Lista de categorias */}
          {merged.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categorias existentes</Label>
              <div className="max-h-52 overflow-y-auto custom-scroll space-y-1 pr-1">
                {merged.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg bg-background border px-2 py-1.5"
                  >
                    {editingId === c.id ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={60}
                          autoFocus
                          className="h-8"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); submitEdit(); }
                            if (e.key === "Escape") { setEditingId(null); }
                          }}
                        />
                        <button
                          type="button"
                          onClick={submitEdit}
                          disabled={busy || !editingName.trim()}
                          className="shrink-0 text-success hover:opacity-80 disabled:opacity-40"
                          aria-label="Salvar"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 truncate text-sm">{c.name}</span>
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Editar ${c.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove.mutate(c.id)}
                          disabled={busy}
                          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                          aria-label={`Excluir ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
