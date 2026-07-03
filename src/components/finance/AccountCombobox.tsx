import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Combobox } from "@/components/finance/Combobox";
import { createAccount, deleteAccount } from "@/lib/finance/accounts.functions";

type Account = { id: string; name: string; type?: string };

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

  const create = useMutation({
    mutationFn: (name: string) => createFn({ data: { name } }),
    onSuccess: (row) => {
      toast.success("Conta criada");
      onChanged();
      if (row?.id) onChange(row.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar conta"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      toast.success("Conta removida");
      if (value === id) onChange("");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover conta"),
  });

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={accounts.map((a) => ({ value: a.id, label: a.name }))}
      placeholder={placeholder}
      searchPlaceholder="Buscar ou criar conta..."
      emptyText="Nenhuma conta"
      createLabelPrefix="Criar conta"
      onCreate={(name) => create.mutate(name)}
      onDelete={(id) => remove.mutate(id)}
    />
  );
}
