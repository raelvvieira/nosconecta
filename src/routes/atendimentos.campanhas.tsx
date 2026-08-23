import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewCampaignSheet } from "@/components/atendimentos/campaigns/NewCampaignSheet";
import { cn } from "@/lib/utils";
import {
  getDailySendUsage,
  setDailySendLimit,
} from "@/lib/atendimentos/campaigns.functions";
import { cancelarDisparo, listarDisparos } from "@/lib/atendimentos/broadcast.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/campanhas")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Campanhas · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Disparo de mensagens em massa pelo WhatsApp." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar as campanhas"
      description="Houve uma falha ao buscar as campanhas. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: CampanhasPage,
});

const DISPARO_STATUS_LABEL: Record<string, string> = {
  running: "Em andamento",
  done: "Concluído",
  cancelled: "Cancelado",
};


function CampanhasPage() {
  const queryClient = useQueryClient();
  const fetchUsage = useServerFn(getDailySendUsage);
  const doSetLimit = useServerFn(setDailySendLimit);
  const fetchDisparos = useServerFn(listarDisparos);
  const doCancelarDisparo = useServerFn(cancelarDisparo);

  const usageQuery = useQuery({ queryKey: ["campaigns-usage"], queryFn: () => fetchUsage(), staleTime: 15_000 });
  // Os disparos segmentados (via "Selecionar contatos") não são campanha do
  // Wavy — vivem nas nossas próprias tabelas, lidos direto por RLS.
  const disparosQuery = useQuery({ queryKey: ["disparos"], queryFn: () => fetchDisparos(), staleTime: 10_000 });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    queryClient.invalidateQueries({ queryKey: ["disparos"] });
  };

  const [limitInput, setLimitInput] = useState("");
  const limitMutation = useMutation({
    mutationFn: () => doSetLimit({ data: { limit: Number(limitInput) } }),
    onSuccess: () => {
      toast.success("Limite atualizado");
      setLimitInput("");
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [cancelarDisparoId, setCancelarDisparoId] = useState<string | null>(null);

  const cancelarDisparoMutation = useMutation({
    mutationFn: (broadcastId: string) => doCancelarDisparo({ data: { broadcastId } }),
    onSuccess: () => {
      toast.success("Disparo cancelado — o que já saiu não volta.");
      setCancelarDisparoId(null);
      queryClient.invalidateQueries({ queryKey: ["disparos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };
  const usagePct = usage.limit > 0 ? Math.min(100, Math.round((usage.usedToday / usage.limit) * 100)) : 0;

  return (
    <>
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
            <Megaphone className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
            Campanhas
          </h1>
          <div className="flex items-center gap-2.5">
            <WhatsappStatusBadge />
            <Button variant="premium" className="gap-2" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          </div>
        </header>

        <section className="surface-card mt-5 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Limite diário de disparo</span>
            <span className="text-muted-foreground">
              {usage.usedToday}/{usage.limit} contatos hoje
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", usagePct >= 100 ? "bg-danger" : "bg-gradient-primary")}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value.replace(/\D/g, ""))}
              placeholder={`Novo limite (atual: ${usage.limit})`}
              className="h-9 max-w-[220px] rounded-xl"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!limitInput || limitMutation.isPending}
              onClick={() => limitMutation.mutate()}
            >
              Salvar limite
            </Button>
          </div>
        </section>

        {/* Havia uma segunda seção aqui, do motor de campanhas do CRM. Ela
            saiu: aquele motor nunca enviou nada (confirmado pelo time do CRM em
            18/08 — 5 campanhas criadas, 0 executadas), e mostrar dois caminhos
            sendo que um não entrega é pior do que mostrar um só. */}
        <h2 className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Send className="h-3.5 w-3.5" />
          Disparos enviados
        </h2>
        <section className="surface-card mt-2.5 divide-y divide-border overflow-hidden">
          {(disparosQuery.data ?? []).length === 0 && (
            <div className="grid min-h-32 place-items-center px-6 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum disparo para uma seleção de contatos ainda. Em "Nova campanha",
                escolha "Selecionar contatos" para filtrar por nome, número ou DDD.
              </p>
            </div>
          )}
          {(disparosQuery.data ?? []).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.message}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{DISPARO_STATUS_LABEL[d.status] ?? d.status}</span>
                  <span>
                    · {d.enviados}/{d.total} enviados
                    {d.falhas > 0 ? `, ${d.falhas} falharam` : ""}
                  </span>
                </p>
              </div>
              {d.status === "running" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-danger"
                  onClick={() => setCancelarDisparoId(d.id)}
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
            </div>
          ))}
        </section>
      </main>

      <NewCampaignSheet open={formOpen} onOpenChange={setFormOpen} onCreated={refresh} />


      <AlertDialog open={Boolean(cancelarDisparoId)} onOpenChange={(o) => !o && setCancelarDisparoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este disparo?</AlertDialogTitle>
            <AlertDialogDescription>
              O que já foi enviado não volta. Os contatos ainda pendentes na fila
              deixam de receber a mensagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelarDisparoMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={cancelarDisparoMutation.isPending}
              onClick={() => cancelarDisparoId && cancelarDisparoMutation.mutate(cancelarDisparoId)}
            >
              Cancelar disparo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
