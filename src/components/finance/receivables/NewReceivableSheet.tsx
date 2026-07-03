import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

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
import { AccountCombobox } from "@/components/finance/AccountCombobox";
import { createReceivable } from "@/lib/finance/receivables.functions";
import { formatBRL } from "@/lib/finance/format";

const todayStr = () => new Date().toISOString().slice(0, 10);

type Opt = { id: string; name: string };

export function NewReceivableSheet({
  open, onOpenChange, patients, professionals, categories, accounts, initialPatientId, onCreated, onCategoriesChanged, onAccountsChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patients: Opt[];
  initialPatientId?: string;
  professionals: Opt[];
  categories: Opt[];
  accounts: Opt[];
  onCreated?: () => void;
  onCategoriesChanged?: () => void;
  onAccountsChanged?: () => void;
}) {
  const create = useServerFn(createReceivable);

  const [patientId, setPatientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("pix");
  const [dueDate, setDueDate] = useState(todayStr());
  const [markReceivedNow, setMarkReceivedNow] = useState(false);
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && initialPatientId) setPatientId(initialPatientId);
  }, [open, initialPatientId]);

  const amountNum = Number((amount || "0").replace(",", "."));
  const perInstallment = installmentsOn && installments > 0 ? amountNum / installments : 0;

  const reset = () => {
    setPatientId(""); setCategoryId(""); setDescription(""); setProfessionalId(""); setAmount("");
    setAccountId(""); setMethod("pix"); setDueDate(todayStr()); setMarkReceivedNow(false);
    setInstallmentsOn(false); setInstallments(2); setRecurring(false);
    setRecurrenceType("monthly"); setNotes("");
  };

  const mutation = useMutation({
    mutationFn: () => create({
      data: {
        description: description.trim() || categories.find(c => c.id === categoryId)?.name || "Recebimento",
        amount: amountNum,
        due_date: dueDate,
        patient_id: patientId || null,
        professional_id: professionalId || null,
        category_id: categoryId || null,
        account_id: accountId || null,
        payment_method: method,
        notes: notes || null,
        markReceivedNow,
        installments: installmentsOn ? installments : 1,
        isRecurring: recurring,
        recurrenceType,
      },
    }),
    onSuccess: () => {
      toast.success("Recebimento criado");
      reset();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar recebimento"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountNum || amountNum <= 0) return toast.error("Informe um valor válido");
    if (!dueDate) return toast.error("Informe a data de vencimento");
    mutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-lg font-semibold">Novo Recebimento</SheetTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Paciente</h3>
            <div className="space-y-2">
              <Label>Paciente</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <CategoryManager
              type="income"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onChanged={() => onCategoriesChanged?.()}
              label="Procedimento / Categoria"
              placeholder="Categoria"
            />
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input placeholder="Ex: Implante unitário" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Profissional responsável</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Financeiro</h3>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Conta financeira</Label>
              <AccountCombobox
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                onChanged={() => onAccountsChanged?.()}
              />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit">Cartão de Crédito</SelectItem>
                  <SelectItem value="debit">Cartão de Débito</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Datas</h3>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="now" className="font-normal">Já recebido</Label>
              <Switch id="now" checked={markReceivedNow} onCheckedChange={setMarkReceivedNow} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Parcelamento</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="inst" className="font-normal">Pagamento parcelado</Label>
              <Switch id="inst" checked={installmentsOn} onCheckedChange={(v) => { setInstallmentsOn(v); if (v) setRecurring(false); }} />
            </div>
            {installmentsOn && (
              <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                <div className="space-y-2">
                  <Label>Qtd. parcelas</Label>
                  <Input type="number" min={2} max={60} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
                </div>
                <div className="rounded-lg bg-background p-3 text-sm">
                  <p className="text-muted-foreground text-xs">Resumo</p>
                  <p className="mt-1">
                    {installments}x de <span className="font-semibold tabular-nums">{formatBRL(perInstallment)}</span>
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Recorrência</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="rec" className="font-normal">Recebimento recorrente</Label>
              <Switch id="rec" checked={recurring} onCheckedChange={(v) => { setRecurring(v); if (v) setInstallmentsOn(false); }} />
            </div>
            {recurring && (
              <div className="space-y-2">
                <Label>Periodicidade</Label>
                <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Observações</h3>
            <Textarea placeholder="Adicione observações (opcional)" value={notes}
              onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={3} />
            <p className="text-[11px] text-muted-foreground text-right">{notes.length}/200</p>
          </section>

          <div className="flex items-center gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar recebimento"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
