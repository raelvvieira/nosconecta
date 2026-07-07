import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { Combobox } from "@/components/finance/Combobox";
import { AccountCombobox } from "@/components/finance/AccountCombobox";
import { updatePayable, type PayableRow } from "@/lib/finance/payables.functions";
import { listSuppliers } from "@/lib/finance/suppliers.functions";
import { parseBRLInput } from "@/lib/finance/format";

const todayStr = () => new Date().toISOString().slice(0, 10);

type Status = "pending" | "paid" | "overdue" | "cancelled";

export function EditPaymentSheet({
  open,
  payment,
  onOpenChange,
  categories,
  accounts,
  suppliers = [],
  onSaved,
  onCategoriesChanged,
  onAccountsChanged,
}: {
  open: boolean;
  payment: PayableRow | null;
  onOpenChange: (o: boolean) => void;
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string; type: string }[];
  suppliers?: string[];
  onSaved: () => void;
  onCategoriesChanged?: () => void;
  onAccountsChanged?: () => void;
}) {
  const update = useServerFn(updatePayable);
  const qc = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const { data: fetchedSuppliers } = useQuery({
    queryKey: ["finance", "suppliers"],
    queryFn: () => fetchSuppliers({ data: {} }),
    staleTime: 30_000,
  });
  const supplierOptions = (fetchedSuppliers as string[] | undefined) ?? suppliers;

  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [method, setMethod] = useState<string>("pix");
  const [dueDate, setDueDate] = useState<string>(todayStr());
  const [status, setStatus] = useState<Status>("pending");
  const [paidDate, setPaidDate] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !payment) return;
    setSupplier(payment.supplier_name ?? "");
    setDescription(payment.description);
    setCategoryId(payment.category_id ?? "");
    setAmount(String(payment.amount).replace(".", ","));
    setAccountId(payment.account_id ?? "");
    setMethod(payment.payment_method ?? "pix");
    setDueDate(payment.due_date);
    setStatus(payment.status);
    setPaidDate(payment.paid_date ?? "");
    setNotes(payment.notes ?? "");
  }, [open, payment]);

  const amountNum = parseBRLInput(amount) || 0;

  const mutation = useMutation({
    mutationFn: () => {
      if (!payment) throw new Error("Pagamento inválido");
      return update({
        data: {
          id: payment.id,
          description,
          amount: amountNum,
          due_date: dueDate,
          category_id: categoryId || null,
          account_id: accountId || null,
          supplier_name: supplier || null,
          payment_method: method,
          notes: notes || null,
          status,
          paid_date: status === "paid" ? paidDate || todayStr() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pagamento atualizado");
      qc.invalidateQueries({ queryKey: ["finance", "suppliers"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar pagamento"),
  });

  if (!payment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-lg font-semibold">Editar Pagamento</SheetTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <form
          className="mt-4 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Informações básicas</h3>
            <div className="space-y-2">
              <Label>Descrição / Nome do item *</Label>
              <Input placeholder="Ex: Cadeira odontológica" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Combobox
                value={supplier}
                onChange={setSupplier}
                options={supplierOptions.map((s) => ({ value: s, label: s }))}
                placeholder="Selecione o fornecedor"
                searchPlaceholder="Buscar ou digitar fornecedor..."
                emptyText="Nenhum fornecedor salvo"
                createLabelPrefix="Usar"
                onCreate={(name) => setSupplier(name)}
              />
            </div>
            <CategoryManager
              type="expense"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onChanged={() => onCategoriesChanged?.()}
              label="Categoria"
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Financeiro</h3>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Método de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="ted">TED</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Banco / Conta financeira</Label>
              <AccountCombobox
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                onChanged={() => onAccountsChanged?.()}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Status e datas</h3>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "paid" && (
              <div className="space-y-2">
                <Label>Data de pagamento</Label>
                <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Observações</h3>
            <Textarea
              placeholder="Adicione observações (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground text-right">{notes.length}/200</p>
          </section>

          <div className="flex items-center gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
