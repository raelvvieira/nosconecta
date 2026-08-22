import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Sparkles, MoreHorizontal, Plus, Users, UserX } from "lucide-react";
import { getRegrasDosFunis } from "@/lib/atendimentos/funis.functions";
import {
  REGRAS_CLIENTES_PADRAO,
  REGRAS_PERDIDOS_PADRAO,
} from "@/lib/atendimentos/funnelRules";
import {
  MODELOS,
  type ModeloDeAutomacao,
} from "@/components/atendimentos/automations/automationTemplates";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  saveAutomation,
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
  const doSave = useServerFn(saveAutomation);
  const buscarRegras = useServerFn(getRegrasDosFunis);

  const [excluirId, setExcluirId] = useState<string | null>(null);
  // Confirmação só ao DESLIGAR. Ligar é reversível e imediato; desligar é o
  // lado que faz mensagem deixar de sair sem ninguém perceber.
  const [desligar, setDesligar] = useState<AutomationRule | null>(null);

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
      setDesligar(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Criar a partir do modelo grava JÁ, e pausada.
  //
  // Antes o clique só abria o editor com o fluxo semeado, e a automação só
  // existia depois de alguém clicar em Salvar. Abrir e fechar não criava nada e
  // não avisava — e enquanto isso os lembretes simplesmente não existiam.
  //
  // Pausada porque o modelo vem com textos de exemplo: a clínica precisa
  // revisar a mensagem antes de ela sair para paciente.
  const criarDoModelo = useMutation({
    mutationFn: (m: ModeloDeAutomacao) =>
      doSave({
        data: {
          name: m.nome,
          active: false,
          triggerEvent: m.triggerEvent,
          nodes: m.nodes,
          edges: m.edges,
        },
      }),
    onSuccess: (r: { id: string }) => {
      toast.success("Automação criada — revise os textos e ligue quando quiser");
      refresh();
      navigate({
        to: "/atendimentos/automacoes/$automationId",
        params: { automationId: r.id },
      });
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

  // Contagem real das etapas de cada funil, para a linha não mentir quando a
  // clínica adicionar ou remover uma.
  const regrasQuery = useQuery({
    queryKey: ["regras-dos-funis"],
    queryFn: () => buscarRegras(),
    staleTime: 5 * 60_000,
  });
  const FUNIS_EDITAVEIS = [
    {
      funil: "clientes" as const,
      titulo: "Movimentação do funil de Clientes",
      entrada: "Todo paciente da base",
      icone: Users,
      etapas: (regrasQuery.data?.clientes ?? REGRAS_CLIENTES_PADRAO).filter((r) => r.ativa).length,
    },
    {
      funil: "perdidos" as const,
      titulo: "Movimentação do funil de Perdidos",
      entrada: "Toda negociação marcada como perdida",
      icone: UserX,
      etapas: (regrasQuery.data?.perdidos ?? REGRAS_PERDIDOS_PADRAO).filter((r) => r.ativa).length,
    },
  ];

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

        {/* Modelos e automações compartilham a MESMA linha de lista.
            Antes os modelos eram cartões numa grade de duas colunas e as
            automações eram linhas cheias — duas formas para coisas que se leem
            do mesmo jeito, e a página parecia dois módulos colados.

            A seção some quando todos os modelos já viraram automação: aí não há
            mais nada a oferecer. */}
        {modelosPendentes.length > 0 && (
          <section className="mt-5">
            <h2 className="px-1 pb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {lista.length ? "Modelos prontos" : "Comece por um modelo"}
            </h2>
            <div className="surface-card divide-y divide-border overflow-hidden">
              {modelosPendentes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={criarDoModelo.isPending}
                  onClick={() => criarDoModelo.mutate(m)}
                  className="press flex min-h-[92px] w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:opacity-60 sm:px-5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-white">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.nome}</span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                      {m.descricao}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-coral-soft px-3 py-1 text-2xs font-semibold text-coral">
                    Criar
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Movimentação dos funis.
            Aparecem aqui porque é aqui que se procura "o que o sistema faz
            sozinho", mas NÃO são linhas de `automation_rules`: o motor de
            automações é orientado a evento e nunca executaria uma
            classificação de funil. Editar leva a `clinic_funnel_rules`, que é
            o que o Pipeline realmente lê. */}
        <section className="mt-6">
          <h2 className="px-1 pb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Movimentação dos funis
          </h2>
          <div className="surface-card divide-y divide-border overflow-hidden">
            {FUNIS_EDITAVEIS.map((f) => (
              <Link
                key={f.funil}
                to="/atendimentos/automacoes/funil/$funil"
                params={{ funil: f.funil }}
                className="press flex min-h-[92px] items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-soft text-violet">
                  <f.icone className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{f.titulo}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{f.entrada}</span>
                  <span className="mt-1 block text-2xs text-muted-foreground/80">
                    {f.etapas} etapas · decide em que coluna cada pessoa aparece
                  </span>
                </span>
                {/* Selo em vez de chave: desligar a movimentação inteira
                    deixaria todo card sem coluna. O que se desliga é uma
                    ETAPA, lá dentro. */}
                <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 text-2xs font-semibold text-success">
                  Automático
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="surface-card mt-6 divide-y divide-border overflow-hidden">
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
              {/* A chave na própria linha: ligar/desligar era a ação mais
                  frequente e estava escondida atrás dos três pontinhos, com o
                  rótulo mudando de "Pausar" para "Ativar" — dá para errar sem
                  perceber. A chave mostra o estado e muda o estado no mesmo
                  gesto. */}
              <Switch
                checked={regra.active}
                aria-label={`${regra.active ? "Desligar" : "Ligar"} ${regra.name}`}
                disabled={toggleMutation.isPending}
                onCheckedChange={(ligar) => {
                  // Ligar é imediato: é reversível e o efeito aparece na hora.
                  // Desligar pede confirmação porque o efeito é invisível — as
                  // mensagens simplesmente param de sair, sem nada na tela.
                  if (ligar) toggleMutation.mutate(regra);
                  else setDesligar(regra);
                }}
              />
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

      <AlertDialog open={!!desligar} onOpenChange={(open) => !open && setDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar "{desligar?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela para de rodar imediatamente e as mensagens deixam de sair — sem nenhum aviso
              na tela quando isso acontecer. O fluxo e o histórico ficam guardados, e é só
              ligar de novo para voltar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, manter ligada</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => desligar && toggleMutation.mutate(desligar)}
            >
              Sim, desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
