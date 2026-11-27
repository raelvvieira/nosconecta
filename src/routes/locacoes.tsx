import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sidebar } from "@/components/finance/Sidebar";
import { PageHeading } from "@/components/layout/PageHeading";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelarLocacaoDaEquipe,
  concluirLocacao,
  decidirLocacao,
  listarLocacoes,
  type LocacaoDaEquipe,
} from "@/lib/locacao/locacao.functions";
import { horasEntre, totalDaLocacao } from "@/lib/locacao/regras";
import { formatBRL } from "@/lib/finance/format";

export const Route = createFileRoute("/locacoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Locações · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar as locações" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: Locacoes,
});

const ROTULO: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
  completed: "Concluída",
};
const dataBr = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

function Locacoes() {
  const qc = useQueryClient();
  const listar = useServerFn(listarLocacoes);
  const decidir = useServerFn(decidirLocacao);
  const concluir = useServerFn(concluirLocacao);
  const cancelar = useServerFn(cancelarLocacaoDaEquipe);
  const q = useQuery({ queryKey: ["locacoes-equipe"], queryFn: () => listar(), retry: false });
  const [fechando, setFechando] = useState<LocacaoDaEquipe | null>(null);
  const [horas, setHoras] = useState("");
  const [valor, setValor] = useState("");

  const recarregar = () => qc.invalidateQueries({ queryKey: ["locacoes-equipe"] });
  const aoErro = (e: Error) => toast.error(e.message);

  const decide = useMutation({
    mutationFn: (v: { id: string; aprovar: boolean }) => decidir({ data: v }),
    onSuccess: recarregar,
    onError: aoErro,
  });
  const cancela = useMutation({
    mutationFn: (id: string) => cancelar({ data: { id } }),
    onSuccess: recarregar,
    onError: aoErro,
  });
  const fecha = useMutation({
    mutationFn: () =>
      concluir({
        data: {
          id: fechando!.id,
          horasReais: Number(horas.replace(",", ".")),
          valorHora: Number(valor.replace(",", ".")),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Locação confirmada: ${formatBRL(r.total)} lançados no financeiro.`);
      setFechando(null);
      recarregar();
    },
    onError: aoErro,
  });

  function abrirConfirmacao(l: LocacaoDaEquipe) {
    setFechando(l);
    setHoras(String(horasEntre(l.inicio, l.fim)).replace(".", ","));
    setValor(String(l.valorHoraPadrao).replace(".", ","));
  }
  const total = totalDaLocacao(Number(horas.replace(",", ".")), Number(valor.replace(",", ".")));

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="custom-scroll min-w-0 flex-1 overflow-y-auto px-4 py-6 pb-nav md:px-6 md:py-8 lg:px-10 lg:pb-8">
        <PageHeading
          title="Locações"
          subtitle="Pedidos de sala dos locatários. Aprove, e depois confirme as horas que de fato foram usadas."
        />
        <div className="mt-6 space-y-2">
          {q.isPending && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma locação ainda. Convide um locatário em Configurações › Pessoal.
            </p>
          )}
          {q.data?.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {l.locatario || "Locatário"} · {l.sala}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dataBr(l.inicio)} · {l.inicio.slice(11)} às {l.fim.slice(11)} ·{" "}
                  {ROTULO[l.status]}
                  {l.status === "completed" && l.total != null
                    ? ` · ${l.horasReais}h × ${formatBRL(l.valorHora ?? 0)} = ${formatBRL(l.total)}`
                    : ""}
                </p>
                {l.observacao && <p className="text-xs text-muted-foreground">“{l.observacao}”</p>}
              </div>
              <div className="flex gap-2">
                {l.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="premium"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: l.id, aprovar: true })}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: l.id, aprovar: false })}
                    >
                      Recusar
                    </Button>
                  </>
                )}
                {l.status === "approved" && (
                  <>
                    <Button size="sm" variant="premium" onClick={() => abrirConfirmacao(l)}>
                      Confirmar locação
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancela.isPending}
                      onClick={() => cancela.mutate(l.id)}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={!!fechando} onOpenChange={(o) => !o && setFechando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar locação</DialogTitle>
              <DialogDescription>
                Informe quantas horas o locatário realmente usou e quanto pagou por hora. O valor
                entra no financeiro como receita de Locação.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="loc-horas">Horas usadas</Label>
                <Input
                  id="loc-horas"
                  inputMode="decimal"
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="loc-valor">Valor da hora (R$)</Label>
                <Input
                  id="loc-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-sm">
              Total: <strong>{formatBRL(total)}</strong>
            </p>
            <Button
              variant="premium"
              disabled={fecha.isPending || !(total >= 0)}
              onClick={() => fecha.mutate()}
            >
              {fecha.isPending ? "Confirmando…" : "Confirmar e lançar"}
            </Button>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
