import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Combobox } from "@/components/finance/Combobox";
import { createAccount, deleteAccount, listAccounts } from "@/lib/finance/accounts.functions";

type Account = { id: string; name: string; type?: string };
const ACCOUNTS_KEY = ["finance", "accounts"];

/**
 * Seletor de conta financeira com autocomplete, criação e remoção.
 * Contas novas são criadas com tipo padrão "bank".
 */
export function AccountCombobox({
  accounts,
  value,
  onChange,
  onChanged,
  placeholder = "Selecione a conta",
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  onChanged: () => void;
  placeholder?: string;
}) {
  const createFn = useServerFn(createAccount);
  const deleteFn = useServerFn(deleteAccount);
  const listFn = useServerFn(listAccounts);
  const qc = useQueryClient();

  // Leitura autenticada da lista salva (consistente com a escrita).
  // Cai para os `accounts` recebidos por prop enquanto carrega.
  const { data: fetched } = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });
  const base = (fetched as Account[] | undefined) ?? accounts;

  const refresh = () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });

  // Mescla localmente itens criados/removidos, para refletir na hora.
  const [extra, setExtra] = useState<Account[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const merged = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of base) map.set(a.id, a);
    for (const a of extra) map.set(a.id, a);
    return Array.from(map.values()).filter((a) => !removed.has(a.id));
  }, [base, extra, removed]);

  const create = useMutation({
    mutationFn: (name: string) => createFn({ data: { name } }),
    onSuccess: (row) => {
      toast.success("Conta criada");
      if (row?.id) {
        setExtra((prev) => [...prev, { id: row.id, name: row.name, type: (row as any).type }]);
        onChange(row.id);
      }
      refresh();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar conta"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      toast.success("Conta removida");
      setRemoved((prev) => new Set(prev).add(id));
      if (value === id) onChange("");
      refresh();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover conta"),
  });

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={merged.map((a) => ({ value: a.id, label: a.name }))}
      placeholder={placeholder}
      searchPlaceholder="Buscar ou criar conta..."
      emptyText="Nenhuma conta"
      createLabelPrefix="Criar conta"
      onCreate={(name) => create.mutate(name)}
      onDelete={(id) => remove.mutate(id)}
    />
  );
}
