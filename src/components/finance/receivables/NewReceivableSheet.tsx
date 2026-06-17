import { useState } from "react";
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
import { FINANCIAL_ACCOUNTS } from "@/lib/finance/receivables-mock";
import { formatBRL } from "@/lib/finance/format";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function NewReceivableSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [patient, setPatient] = useState("");
  const [procedure, setProcedure] = useState("");
  const [professional, setProfessional] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("pix");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(todayStr());
  const [receivedDate, setReceivedDate] = useState("");
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [downPayment, setDownPayment] = useState("");
  const [installments, setInstallments] = useState(2);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [notes, setNotes] = useState("");

  const amountNum = Number((amount || "0").replace(",", "."));
  const downNum = Number((downPayment || "0").replace(",", "."));
  const perInstallment = installmentsOn && installments > 0
    ? Math.max(0, (amountNum - downNum) / installments)
    : 0;

  const reset = () => {
    setPatient(""); setProcedure(""); setProfessional(""); setAmount("");
    setAccountId(""); setMethod("pix"); setIssueDate(todayStr()); setDueDate(todayStr());
    setReceivedDate(""); setInstallmentsOn(false); setDownPayment(""); setInstallments(2);
    setRecurring(false); setRecurrenceType("monthly"); setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Recebimento criado (mock)");
    reset();
    onOpenChange(false);
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
              <Label>Paciente *</Label>
              <Input placeholder="Buscar paciente..." value={patient} onChange={(e) => setPatient(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Procedimento *</Label>
              <Input placeholder="Ex: Implante unitário" value={procedure} onChange={(e) => setProcedure(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Profissional responsável *</Label>
              <Select value={professional} onValueChange={setProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr. João Santos">Dr. João Santos</SelectItem>
                  <SelectItem value="Dra. Ana Paula">Dra. Ana Paula</SelectItem>
                  <SelectItem value="Dr. Carlos Mendes">Dr. Carlos Mendes</SelectItem>
                  <SelectItem value="Dra. Fernanda Lima">Dra. Fernanda Lima</SelectItem>
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
              <Label>Conta financeira *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {FINANCIAL_ACCOUNTS.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Emissão *</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Vencimento *</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data de recebimento</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Entrada</Label>
                    <Input inputMode="decimal" placeholder="R$ 0,00" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Qtd. parcelas</Label>
                    <Input type="number" min={2} max={60} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
                  </div>
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
            <Button type="submit" className="flex-1">Salvar recebimento</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
