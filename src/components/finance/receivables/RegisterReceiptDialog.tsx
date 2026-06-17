import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { markReceivableReceived } from "@/lib/finance/receivables.functions";

const todayStr = () => new Date().toISOString().slice(0, 10);

type Opt = { id: string; name: string };

export function RegisterReceiptDialog({
  open, onOpenChange, transactionId, accounts = [], onConfirmed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transactionId?: string | null;
  accounts?: Opt[];
  onConfirmed?: () => void;
}) {
  const mark = useServerFn(markReceivableReceived);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("pix");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAccountId(""); setMethod("pix"); setDate(todayStr()); setNotes("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!transactionId) throw new Error("Selecione um recebimento.");
      return mark({
        data: { id: transactionId, paid_date: date, account_id: accountId || null, payment_method: method },
      });
    },
    onSuccess: () => {
      toast.success("Recebimento registrado");
      onOpenChange(false);
      onConfirmed?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao registrar"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId) {
      toast.info("Selecione um recebimento da tabela para registrar.");
      onOpenChange(false);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
          <DialogDescription>
            {transactionId ? "Confirme os dados do recebimento abaixo." : "Selecione um recebimento na tabela e use a ação \"Registrar recebimento\"."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Conta financeira</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={200} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Confirmar recebimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
