import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MoreHorizontal, Plus } from "lucide-react";
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
  saveAutomation,
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
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: AutomacoesPage,
});

function resumoAcoes(regra: AutomationRule): string {
  if (!regra.actions.length) return "Sem ações";
  return regra.actions.map((a) => ACTION_LABEL[a.type]).join(" · ");
}

function AutomacoesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchAutomations = useServerFn(listAutomations);
  const doSave = useServerFn(saveAutomation);
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
      doSave({
        data: {
          id: regra.id,
          name: regra.name,
          active: !regra.active,
          triggerEvent: regra.triggerEvent,
          triggerConditions: regra.triggerConditions,
          actions: regra.actions,
          canvasLayout: regra.canvasLayout,
        },
      }),
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

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em]">
              <Bot className="h-5 w-5 text-pink" />
              Automação
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando algo acontece na clínica, o sistema age sozinho.
            </p>
          </div>
          <Button asChild className="gap-2 bg-gradient-primary text-white">
            <Link to="/atendimentos/automacoes/$automationId" params={{ automationId: "nova" }}>
              <Plus className="h-4 w-4" />
              Nova automação
            </Link>
          </Button>
        </header>

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
                  {resumoAcoes(regra)}
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
                <Button asChild className="mt-5 gap-2 bg-gradient-primary text-white">
                  <Link
                    to="/atendimentos/automacoes/$automationId"
                    params={{ automationId: "nova" }}
                  >
                    <Plus className="h-4 w-4" />
                    Criar automação
                  </Link>
                </Button>
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
