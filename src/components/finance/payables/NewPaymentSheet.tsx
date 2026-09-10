import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { Combobox } from "@/components/finance/Combobox";
import { AccountCombobox } from "@/components/finance/AccountCombobox";
import { createPayable } from "@/lib/finance/payables.functions";
import { createCardPurchase } from "@/lib/finance/invoices.functions";
import { listCards } from "@/lib/finance/cards.functions";
import { faturasDasParcelas, valorDasParcelas } from "@/lib/finance/fatura";
import { listSuppliers } from "@/lib/finance/suppliers.functions";
import { cn } from "@/lib/utils";
import { formatBRL, parseBRLInput } from "@/lib/finance/format";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { localDateStr } from "@/lib/date";

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
  const { selectedUnitId, units, isAdmin } = useUnitSelection();
  // Lançamento pertence a uma unidade, e o servidor recusa sem saber qual. O
  // seletor global do menu começa em "todas as unidades", então sem este campo
  // o admin batia em "Selecione a unidade." num formulário que não tinha onde
  // selecionar. Defeito anterior ao cartão; o atalho da Visão Geral só o
  // deixou mais fácil de encontrar.
  const precisaUnidade = isAdmin && units.length > 1;
  const [unidade, setUnidade] = useState(selectedUnitId ?? "");
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
  const [dueDate, setDueDate] = useState<string>(localDateStr());
  const [paidDate, setPaidDate] = useState<string>("");
  const [markPaid, setMarkPaid] = useState(false);
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installments, setInstallments] = useState<number>(12);
  const [downPayment, setDownPayment] = useState<string>("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"monthly" | "weekly" | "yearly">("monthly");
  const [notes, setNotes] = useState("");
  // À vista ou no crédito. É a bifurcação que muda o significado das datas:
  // à vista você informa QUANDO PAGA; no crédito, quando COMPROU — e quem
  // decide o pagamento é o ciclo do cartão.
  const [forma, setForma] = useState<"vista" | "credito">("vista");
  const [cardId, setCardId] = useState<string>("");

  const buscarCartoes = useServerFn(listCards);
  const cartoes = useQuery({
    queryKey: ["credit-cards", selectedUnitId],
    queryFn: () => buscarCartoes({ data: { unitId: selectedUnitId ?? undefined } }),
    enabled: open,
    staleTime: 60_000,
  });
  const cartao = (cartoes.data ?? []).find((c) => c.id === cardId) ?? null;

  const reset = () => {
    setSupplier("");
    setDescription("");
    setCategoryId("");
    setAmount("");
    setAccountId("");
    setMethod("pix");
    setDueDate(localDateStr());
    setPaidDate("");
    setMarkPaid(false);
    setInstallmentsOn(false);
    setInstallments(12);
    setDownPayment("");
    setRecurring(false);
    setRecurrenceType("monthly");
    setNotes("");
    setForma("vista");
    setCardId("");
  };

  const amountNum = parseBRLInput(amount) || 0;
  const downNum = parseBRLInput(downPayment) || 0;
  const remainingNum = Math.max(0, amountNum - downNum);
  const perInstallment = installments > 0 ? remainingNum / installments : 0;

  const criarCompra = useServerFn(createCardPurchase);

  const mutation = useMutation({
    mutationFn: () => {
      if (precisaUnidade && !unidade) throw new Error("Selecione a unidade.");
      if (forma === "credito") {
        if (!cardId) throw new Error("Escolha o cartão.");
        return criarCompra({
          data: {
            cardId,
            description,
            amount: amountNum,
            // No crédito o campo de data é a DATA DA COMPRA. O vencimento não
            // é escolha: sai do ciclo do cartão.
            purchaseDate: dueDate,
            installments: installmentsOn ? installments : 1,
            category_id: categoryId || null,
            supplier_name: supplier || null,
            notes: notes || null,
            unitId: unidade || selectedUnitId || undefined,
          },
        });
      }
      return create({
        data: {
          description,
          amount: amountNum,
          due_date: dueDate,
          category_id: categoryId || null,
          account_id: accountId || null,
          supplier_name: supplier || null,
          payment_method: method,
          notes: notes || null,
          markPaidNow: markPaid,
          paid_date: paidDate || null,
          installments: installmentsOn ? installments : 1,
          downPayment: installmentsOn ? downNum : 0,
          isRecurring: recurring && !installmentsOn,
          recurrenceType,
          unitId: unidade || selectedUnitId || undefined,
        },
      });
    },
    onSuccess: (r: any) => {
      if (forma === "credito") {
        const quando = String(r.primeiroVencimento ?? "")
          .split("-")
          .reverse()
          .join("/");
        toast.success(
          r.count > 1
            ? `${r.count} parcelas lançadas no cartão. A primeira entra na fatura que vence em ${quando}.`
            : `Compra lançada no cartão. Entra na fatura que vence em ${quando}.`,
        );
      } else {
        toast.success(r.count > 1 ? `${r.count} parcelas criadas` : "Pagamento criado");
      }
      qc.invalidateQueries({ queryKey: ["credit-cards"] });
      qc.invalidateQueries({ queryKey: ["finance", "suppliers"] });
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
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
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
              <Input
                placeholder="Ex: Cadeira odontológica"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
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
            {precisaUnidade && (
              <div className="space-y-2">
                <Label>Unidade *</Label>
                <Select value={unidade} onValueChange={setUnidade}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            {/* Dois botões, não mais um item "Cartão" perdido no meio do
                select. À vista e crédito não são duas formas de pagar a mesma
                coisa: são dois momentos diferentes de o dinheiro sair. */}
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["vista", "credito"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForma(f)}
                    aria-pressed={forma === f}
                    className={cn(
                      "press h-11 rounded-xl border text-sm font-medium transition-colors",
                      forma === f
                        ? "border-transparent bg-foreground text-white"
                        : "border-border bg-white text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f === "vista" ? "À vista" : "Crédito"}
                  </button>
                ))}
              </div>
            </div>

            {forma === "vista" ? (
              <>
                <div className="space-y-2">
                  <Label>Método de pagamento *</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="ted">TED</SelectItem>
                      <SelectItem value="debito">Cartão de débito</SelectItem>
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
              </>
            ) : (
              <div className="space-y-2">
                <Label>Cartão *</Label>
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cartoes.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.lastDigits ? ` · ••${c.lastDigits}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(cartoes.data ?? []).length === 0 && !cartoes.isPending && (
                  <p className="text-2xs text-muted-foreground">
                    Nenhum cartão cadastrado. Cadastre em Visão Geral → Gerenciar contas.
                  </p>
                )}
                {/* A conta não é escolha aqui: quem paga a fatura é a conta do
                    cartão, definida no cadastro dele. */}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Datas</h3>
            <div className="space-y-2">
              <Label>{forma === "credito" ? "Data da compra *" : "Vencimento *"}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            {/* No crédito não existe "data de pagamento": a compra é paga na
                fatura, e mostrar o campo convidaria a mentir para o próprio
                fluxo de caixa. */}
            {forma === "vista" && (
              <div className="space-y-2">
                <Label>Data de pagamento</Label>
                <Input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  placeholder="Selecione a data"
                />
                <p className="text-2xs text-muted-foreground">
                  Se preenchida, o pagamento já é registrado como pago nessa data.
                </p>
              </div>
            )}

            {forma === "credito" && (
              <PreviaDaCompra
                cartao={cartao}
                dataDaCompra={dueDate}
                parcelas={installmentsOn ? installments : 1}
                total={amountNum}
              />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Opções</h3>
            {/* Nenhum dos dois faz sentido no crédito: a compra é paga na
                fatura, e "recorrente" duplicaria o que o parcelamento já faz. */}
            {forma === "vista" && (
              <div className="flex items-center justify-between">
                <Label htmlFor="markPaid" className="font-normal">
                  Marcar como pago agora
                </Label>
                <Switch id="markPaid" checked={markPaid} onCheckedChange={setMarkPaid} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="inst" className="font-normal">
                {forma === "credito" ? "Parcelar no cartão" : "Parcelar despesa"}
              </Label>
              <Switch
                id="inst"
                checked={installmentsOn}
                onCheckedChange={(v) => {
                  setInstallmentsOn(v);
                  if (v) setRecurring(false);
                }}
              />
            </div>
            {installmentsOn && (
              <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                <div className="space-y-2">
                  <Label>Entrada (opcional)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                  />
                  <p className="text-2xs text-muted-foreground">
                    Valor pago à vista; o restante é dividido nas parcelas.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de parcelas</Label>
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={installments}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                  />
                </div>
                <div className="rounded-lg bg-background p-3 text-sm">
                  <p className="text-muted-foreground text-xs">Resumo</p>
                  <p className="mt-1">
                    {downNum > 0 && (
                      <>
                        Entrada{" "}
                        <span className="font-semibold tabular-nums">{formatBRL(downNum)}</span>{" "}
                        +{" "}
                      </>
                    )}
                    {installments}x de{" "}
                    <span className="font-semibold tabular-nums">{formatBRL(perInstallment)}</span>
                  </p>
                </div>
              </div>
            )}
            {forma === "vista" && (
              <>
                <div className="flex items-center justify-between">
                  <Label htmlFor="rec" className="font-normal">
                    Pagamento recorrente
                  </Label>
                  <Switch
                    id="rec"
                    checked={recurring}
                    onCheckedChange={(v) => {
                      setRecurring(v);
                      if (v) setInstallmentsOn(false);
                    }}
                  />
                </div>
                {recurring && (
                  <div className="space-y-2">
                    <Label>Recorrência</Label>
                    <Select
                      value={recurrenceType}
                      onValueChange={(v) => setRecurrenceType(v as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
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
            <p className="text-2xs text-muted-foreground text-right">{notes.length}/200</p>
          </section>

          <div className="flex items-center gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar pagamento"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Em qual fatura esta compra vai cair, dito com os números que a pessoa
 * acabou de digitar.
 *
 * É a mesma ideia da prévia do cadastro do cartão, e pelo mesmo motivo: a
 * regra do ciclo é sutil (comprou depois do fechamento? vai para o mês que
 * vem), e ninguém confere uma regra — as pessoas conferem uma data. Quem lança
 * uma compra achando que ela sai do caixa este mês vê aqui que sai no mês que
 * vem, e ajusta o planejamento em vez de descobrir na fatura.
 */
function PreviaDaCompra({
  cartao,
  dataDaCompra,
  parcelas,
  total,
}: {
  cartao: { closingDay: number; dueDay: number } | null;
  dataDaCompra: string;
  parcelas: number;
  total: number;
}) {
  if (!cartao || !dataDaCompra) {
    return (
      <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-2xs text-muted-foreground">
        Escolha o cartão e a data da compra para ver em qual fatura ela entra.
      </p>
    );
  }

  const ciclos = faturasDasParcelas(dataDaCompra, cartao.closingDay, cartao.dueDay, parcelas);
  const valores = valorDasParcelas(total, parcelas);
  const dia = (d: string) => d.split("-").reverse().join("/");
  const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="rounded-xl bg-coral-soft/60 px-3 py-2.5 text-xs leading-relaxed">
      {parcelas > 1 ? (
        <>
          1ª parcela na fatura que vence em <strong>{dia(ciclos[0].vencimento)}</strong>, última em{" "}
          <strong>{dia(ciclos[parcelas - 1].vencimento)}</strong>.
          {total > 0 && (
            <span className="mt-1 block text-muted-foreground">
              {parcelas}× de {real(valores[0])}
              {valores[parcelas - 1] !== valores[0] &&
                ` (a última, ${real(valores[parcelas - 1])})`}
            </span>
          )}
        </>
      ) : (
        <>
          Entra na fatura que vence em <strong>{dia(ciclos[0].vencimento)}</strong>.
          <span className="mt-1 block text-muted-foreground">
            Não sai do caixa hoje — sai nessa data, junto com o resto da fatura.
          </span>
        </>
      )}
    </div>
  );
}
