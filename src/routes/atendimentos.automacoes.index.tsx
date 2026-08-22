import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Sparkles, MoreHorizontal, Plus } from "lucide-react";
import {
  MODELOS,
  type ModeloDeAutomacao,
} from "@/components/atendimentos/automations/automationTemplates";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  deleteAutomation,
  listAutomations,
  setAutomationActive,
  type AutomationActionType,
  type AutomationRule,
} from "@/lib/atendimentos/automations.functions";
import { ACTION_LABEL, TRIGGER_LABEL_SHORT } from "@/components/atendimentos/automations/automationLabels";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/automacoes/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Automação · Atendimentos · NÓS Conecta" },
      {
        name: "description",
        content: "Fluxos automáticos: quando algo acontece, o sistema age sozinho.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as automações"
      description="Houve uma falha ao buscar as automações. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: AutomacoesPage,
});

/** Resumo da FORMA do fluxo, não da lista de ações.
 *
 *  Era `actions.map(ACTION_LABEL).join(" · ")`, que num fluxo com ramos
 *  produzia "Enviar mensagem de WhatsApp · Enviar mensagem de WhatsApp ·
 *  Enviar mensagem de WhatsApp" — três vezes a mesma frase, sem dizer que
 *  existem caminhos diferentes. Lê de `nodes` (que `mapRule` já devolve na
 *  lista) porque é lá que moram as condições; `actions` é só o espelho achatado.
 */
function resumoDoFluxo(regra: AutomationRule): string {
  const nodes = regra.nodes ?? [];
  const condicoes = nodes.filter((n) => n.type === "condition").length;
  const sorteios = nodes.filter((n) => n.type === "randomizer").length;

  // Ação repetida vira "3×" em vez de aparecer três vezes. Map preserva a
  // ordem de inserção, então a leitura segue a ordem do fluxo.
  const porTipo = new Map<AutomationActionType, number>();
  for (const n of nodes) {
    const tipo = n.type === "action" ? n.data?.action?.type : null;
    if (!tipo) continue;
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }

  const partes: string[] = [];
  if (condicoes) partes.push(`${condicoes} ${condicoes === 1 ? "condição" : "condições"}`);
  if (sorteios) partes.push(`${sorteios} ${sorteios === 1 ? "sorteio" : "sorteios"}`);
  for (const [tipo, n] of porTipo) {
    partes.push(n > 1 ? `${n}× ${ACTION_LABEL[tipo]}` : ACTION_LABEL[tipo]);
  }
  return partes.length ? partes.join(" · ") : "Sem ações";
}

function AutomacoesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchAutomations = useServerFn(listAutomations);
  const doSetActive = useServerFn(setAutomationActive);
  const doDelete = useServerFn(deleteAutomation);

  const [excluirId, setExcluirId] = useState<string | null>(null);

  const automacoesQuery = useQuery({
    queryKey: ["automations"],
    queryFn: () => fetchAutomations(),
    staleTime: 10_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["automations"] });

  const toggleMutation = useMutation({
    mutationFn: (regra: AutomationRule) =>
      doSetActive({ data: { id: regra.id, active: !regra.active } }),
    onSuccess: () => {
      toast.success("Automação atualizada");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Automação excluída");
      setExcluirId(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lista = automacoesQuery.data ?? [];

  // Um modelo já foi usado quando existe automação com o MESMO gatilho. É
  // heurística, não vínculo: o modelo é semente, e depois de criada a
  // automação não é "gerenciada" por ele. Serve só para não oferecer de novo
  // algo que a clínica já tem — e para a seção inteira sumir quando não
  // houver mais nada a oferecer.
  const automacaoDoModelo = (m: ModeloDeAutomacao) =>
    lista.find((a) => a.triggerEvent === m.triggerEvent) ?? null;
  const modelosPendentes = MODELOS.filter((m) => !automacaoDoModelo(m));

  return (
    <>
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
              <Bot className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
              Automação
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando algo acontece na clínica, o sistema age sozinho.
            </p>
          </div>
          <Button asChild variant="premium" className="gap-2">
            <Link to="/atendimentos/automacoes/$automationId" params={{ automationId: "nova" }}>
              <Plus className="h-4 w-4" />
              Nova automação
            </Link>
          </Button>
        </header>

        {/* Modelos.
            Estavam atrás de `!lista.length`, com o raciocínio de que quem já
            tem automação quer editar, não recomeçar. Errado no caso que
            importa: um modelo NOVO é capacidade que a clínica ainda não tem, e
            escondê-lo deixou os dois fluxos da última rodada sem caminho
            nenhum para serem criados. Some sozinho quando todos já existem —
            aí sim não há o que oferecer. */}
        {modelosPendentes.length > 0 && (
          <section className="mt-5">
            <h2 className="px-1 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {lista.length ? "Modelos prontos" : "Comece por um modelo"}
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {MODELOS.map((m) => {
                const jaCriada = automacaoDoModelo(m);
                if (jaCriada) {
                  return (
                    <Link
                      key={m.id}
                      to="/atendimentos/automacoes/$automationId"
                      params={{ automationId: jaCriada.id }}
                      className="press surface-card flex items-start gap-3 p-4 text-left opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{m.nome}</span>
                        <span className="mt-1 block text-2xs leading-snug text-muted-foreground">
                          Já criada — abrir "{jaCriada.name}"
                        </span>
                      </span>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={m.id}
                    to="/atendimentos/automacoes/$automationId"
                    params={{ automationId: "nova" }}
                    search={{ modelo: m.id }}
                    className="press surface-card flex items-start gap-3 p-4 text-left transition-colors hover:border-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-white">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{m.nome}</span>
                      <span className="mt-1 block text-2xs leading-snug text-muted-foreground">
                        {m.descricao}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="surface-card mt-5 divide-y divide-border overflow-hidden">
          {lista.map((regra) => (
            <div
              key={regra.id}
              className="flex min-h-[92px] items-center gap-3 px-4 py-4 sm:px-5"
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                  regra.active ? "bg-gradient-primary text-white" : "bg-muted text-muted-foreground",
                )}
              >
                <Bot className="h-5 w-5" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  navigate({
                    to: "/atendimentos/automacoes/$automationId",
                    params: { automationId: regra.id },
                  })
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{regra.name}</p>
                  {!regra.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-semibold text-muted-foreground">
                      Pausada
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {regra.triggerEvent ? TRIGGER_LABEL_SHORT[regra.triggerEvent] : "Sem gatilho"}
                </p>
                <p className="mt-1 truncate text-2xs text-muted-foreground/80">
                  {resumoDoFluxo(regra)}
                </p>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Ações de ${regra.name}`}>
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({
                        to: "/atendimentos/automacoes/$automationId",
                        params: { automationId: regra.id },
                      })
                    }
                  >
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleMutation.mutate(regra)}>
                    {regra.active ? "Pausar" : "Ativar"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onClick={() => setExcluirId(regra.id)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {!automacoesQuery.isLoading && !lista.length && (
            <div className="grid min-h-72 place-items-center px-6 py-10 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                  <Bot className="h-5 w-5" />
                </span>
                <h4 className="mt-4 font-semibold">Nenhuma automação ainda</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ex.: quando um paciente é cadastrado, mandar uma mensagem de boas-vindas.
                </p>
                {/* Sem botão aqui: "Nova automação", no cabeçalho, faz a mesma
                    coisa — dois caminhos para a mesma ação só dividem a atenção. */}
                <p className="mt-4 text-xs text-muted-foreground">
                  Comece pelo botão <span className="font-medium text-foreground">Nova automação</span>,
                  no topo da página.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      <AlertDialog open={!!excluirId} onOpenChange={(open) => !open && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta automação?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela para de rodar imediatamente. O histórico de execuções continua guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => excluirId && deleteMutation.mutate(excluirId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
