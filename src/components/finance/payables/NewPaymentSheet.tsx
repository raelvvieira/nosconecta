import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { Combobox } from "@/components/finance/Combobox";
import { AccountCombobox } from "@/components/finance/AccountCombobox";
import { createPayable } from "@/lib/finance/payables.functions";
import { listSuppliers } from "@/lib/finance/suppliers.functions";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function NewPaymentSheet({
  open,
  onOpenChange,
  categories,
  accounts,
  suppliers = [],
  onCreated,
  onCategoriesChanged,
  onAccountsChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string; type: string }[];
  suppliers?: string[];
  onCreated: () => void;
  onCategoriesChanged?: () => void;
  onAccountsChanged?: () => void;
}) {
  const create = useServerFn(createPayable);
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
  const [paidDate, setPaidDate] = useState<string>("");
  const [markPaid, setMarkPaid] = useState(false);
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installments, setInstallments] = useState<number>(12);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"monthly" | "weekly" | "yearly">("monthly");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSupplier(""); setDescription(""); setCategoryId(""); setAmount("");
    setAccountId(""); setMethod("pix"); setDueDate(todayStr()); setPaidDate("");
    setMarkPaid(false); setInstallmentsOn(false); setInstallments(12);
    setRecurring(false); setRecurrenceType("monthly"); setNotes("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          description,
          amount: Number(amount.replace(",", ".")),
          due_date: dueDate,
          category_id: categoryId || null,
          account_id: accountId || null,
          supplier_name: supplier || null,
          payment_method: method,
          notes: notes || null,
          markPaidNow: markPaid,
          paid_date: paidDate || null,
          installments: installmentsOn ? installments : 1,
          isRecurring: recurring && !installmentsOn,
          recurrenceType,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.count > 1 ? `${r.count} parcelas criadas` : "Pagamento criado");
      onCreated();
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar pagamento"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-lg font-semibold">Novo Pagamento</SheetTitle>
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
              <Label>Fornecedor *</Label>
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
              label="Categoria *"
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Financeiro</h3>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Método de pagamento *</Label>
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
              <Label>Banco / Conta financeira *</Label>
              <AccountCombobox
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                onChanged={() => onAccountsChanged?.()}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Datas</h3>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Data de pagamento</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} placeholder="Selecione a data" />
              <p className="text-[11px] text-muted-foreground">Se preenchida, o pagamento já é registrado como pago nessa data.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Opções</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="markPaid" className="font-normal">Marcar como pago agora</Label>
              <Switch id="markPaid" checked={markPaid} onCheckedChange={setMarkPaid} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inst" className="font-normal">Parcelar despesa</Label>
              <Switch id="inst" checked={installmentsOn} onCheckedChange={(v) => { setInstallmentsOn(v); if (v) setRecurring(false); }} />
            </div>
            {installmentsOn && (
              <div className="space-y-2">
                <Label>Quantidade de parcelas</Label>
                <Input type="number" min={2} max={60} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="rec" className="font-normal">Pagamento recorrente</Label>
              <Switch id="rec" checked={recurring} onCheckedChange={(v) => { setRecurring(v); if (v) setInstallmentsOn(false); }} />
            </div>
            {recurring && (
              <div className="space-y-2">
                <Label>Recorrência</Label>
                <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
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
              {mutation.isPending ? "Salvando..." : "Salvar pagamento"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
