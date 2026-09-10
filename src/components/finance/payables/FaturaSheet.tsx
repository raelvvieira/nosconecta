import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getCardInvoiceDetail, payCardInvoice } from "@/lib/finance/invoices.functions";
import { formatBRL, formatDateBRFull } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/**
 * A fatura por dentro.
 *
 * ── Por que uma linha só em Pagamentos ───────────────────────────────────
 *
 * Porque é assim que o dinheiro se comporta: chega um débito único no extrato,
 * não quarenta. Espalhar as compras pela lista faria a pessoa somar de cabeça
 * o que vai sair no dia 5, que é justamente a conta que o sistema existe para
 * fazer.
 *
 * As compras não somem — elas moram aqui dentro, com categoria e "3/12", que é
 * onde se procura por elas quando a dúvida é "o que eu comprei mesmo?".
 *
 * ── O estado é derivado, não guardado ────────────────────────────────────
 *
 * Aberta, fechada ou paga sai da data de fechamento e do pagamento da linha.
 * Uma coluna de status precisaria de alguém para virá-la de aberta para
 * fechada todo mês, e não há cron neste projeto: ela nasceria mentindo.
 */
export function FaturaSheet({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getCardInvoiceDetail);
  const pagar = useServerFn(payCardInvoice);

  const fatura = useQuery({
    queryKey: ["card-invoice", invoiceId],
    queryFn: () => buscar({ data: { invoiceId: invoiceId! } }),
    enabled: Boolean(invoiceId),
  });

  const pagamento = useMutation({
    mutationFn: () => pagar({ data: { invoiceId: invoiceId! } }),
    onSuccess: (r) => {
      toast.success(`Fatura de ${formatBRL(r.amount)} paga`);
      queryClient.invalidateQueries({ queryKey: ["payables-overview"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["planning-overview"] });
      queryClient.invalidateQueries({ queryKey: ["card-invoice", invoiceId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = fatura.data;

  return (
    <Sheet open={Boolean(invoiceId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-5 text-left">
          <SheetTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 shrink-0 text-coral" />
            {f ? `Fatura ${f.cardName}` : "Fatura"}
          </SheetTitle>
        </SheetHeader>

        {fatura.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        )}

        {f && (
          <div className="grid gap-5">
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">Total da fatura</span>
                <Selo estado={f.estado} />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(f.total)}</p>

              <dl className="mt-4 grid gap-1.5 border-t border-border/60 pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {f.estado === "aberta" ? "Fecha em" : "Fechou em"}
                  </dt>
                  <dd className="tabular-nums">{formatDateBRFull(f.closingDate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vence em</dt>
                  <dd className="font-medium tabular-nums">{formatDateBRFull(f.dueDate)}</dd>
                </div>
                {f.paidDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Paga em</dt>
                    <dd className="tabular-nums text-success">{formatDateBRFull(f.paidDate)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Fatura aberta ainda aceita compra: pagar agora deixaria de fora
                o que entrar até o fechamento. É informação, não dívida
                exigível — por isso o aviso no lugar do botão. */}
            {f.estado === "aberta" && (
              <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Este ciclo ainda está aberto — novas compras entram aqui até{" "}
                {formatDateBRFull(f.closingDate)}.
              </p>
            )}

            {f.estado === "fechada" && f.total > 0 && (
              <Button
                onClick={() => pagamento.mutate()}
                disabled={pagamento.isPending}
                className="w-full"
              >
                {pagamento.isPending ? "Pagando…" : `Pagar fatura · ${formatBRL(f.total)}`}
              </Button>
            )}

            <section className="grid gap-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {f.compras.length} {f.compras.length === 1 ? "compra" : "compras"}
              </h3>

              {f.compras.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">
                  Nenhuma compra neste ciclo ainda.
                </p>
              ) : (
                <ul className="grid gap-1">
                  {f.compras.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{c.description}</p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {[
                            c.purchaseDate ? formatDateBRFull(c.purchaseDate) : null,
                            c.categoryName,
                            c.supplierName,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatBRL(c.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Selo({ estado }: { estado: "aberta" | "fechada" | "paga" }) {
  const estilo = {
    aberta: "bg-info-soft text-info",
    fechada: "bg-warning-soft text-warning",
    paga: "bg-success-soft text-success",
  }[estado];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", estilo)}>
      {estado === "aberta" ? "Em aberto" : estado === "fechada" ? "Fechada" : "Paga"}
    </span>
  );
}
