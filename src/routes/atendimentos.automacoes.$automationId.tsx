import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { History, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ActionNode,
  ConditionNode,
  EditorAcoesProvider,
  RandomizerNode,
  TriggerNode,
  type EditorAcoes,
} from "@/components/atendimentos/automations/AutomationNodes";
import { DeletableEdge } from "@/components/atendimentos/automations/AutomationEdge";
import {
  AdicionarAcaoDialog,
  EditarCondicaoDialog,
  EditarCondicaoNoDialog,
  EditarJanelaDialog,
  EditarRandomizadorDialog,
  EscolherCardDialog,
  EscolherGatilhoDialog,
} from "@/components/atendimentos/automations/AutomationDialogs";
import { PainelExecucoes } from "@/components/atendimentos/automations/PainelExecucoes";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getAutomation,
  saveAutomation,
  type AutomationAction,
  type AutomationEdge as RegraEdge,
  type AutomationNode as RegraNode,
  type AutomationNodeData,
  type AutomationScheduleWindow,
} from "@/lib/atendimentos/automations.functions";
import type { SystemEvent } from "@/lib/integrations/meta-capi.functions";
import { getPipelineStages } from "@/lib/atendimentos/pipeline.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/automacoes/$automationId")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Editar automação · Atendimentos · NÓS Conecta" }],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar a automação"
      description="Houve uma falha ao buscar esta automação. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Automação não encontrada" notFound
  semSidebar
/>,
  component: EditorPage,
});

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  randomizer: RandomizerNode,
};

const edgeTypes: EdgeTypes = { deletavel: DeletableEdge };

const GRAFO_NOVO: { nodes: RegraNode[]; edges: RegraEdge[] } = {
  nodes: [{ id: "trigger", type: "trigger", position: { x: 0, y: 60 }, data: {} }],
  edges: [],
};

let contador = 0;
const novoId = () => `n${Date.now().toString(36)}${(contador++).toString(36)}`;

/** O React Flow tipa `node.data` como `Record<string, unknown>`; o nosso tipo
 *  é um objeto de campos conhecidos. A conversão fica só nesta fronteira, em
 *  vez de afrouxar `AutomationNodeData` com um index signature — que quebraria
 *  a checagem de serialização das server functions. */
const paraFlow = (n: RegraNode): Node =>
  ({
    ...n,
    // Última linha de defesa: o React Flow lê `position.x` sem checar, e um nó
    // sem posição derruba o canvas inteiro. O saneamento de verdade é no
    // `sintetizarNodes`; isto aqui é para nenhum caminho novo conseguir passar
    // um nó torto adiante.
    position: {
      x: Number.isFinite(n.position?.x) ? n.position.x : 0,
      y: Number.isFinite(n.position?.y) ? n.position.y : 0,
    },
    data: n.data as unknown as Record<string, unknown>,
    deletable: n.type !== "trigger",
  }) as Node;

const dadosDoNo = (n: Node | undefined): AutomationNodeData =>
  (n?.data ?? {}) as unknown as AutomationNodeData;

function EditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

function Editor() {
  const { automationId } = useParams({ from: "/atendimentos/automacoes/$automationId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ehNova = automationId === "nova";

  const fetchAutomation = useServerFn(getAutomation);
  const fetchStages = useServerFn(getPipelineStages);
  const doSave = useServerFn(saveAutomation);

  const [nome, setNome] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [triggerEvent, setTriggerEvent] = useState<SystemEvent | null>(null);
  const [conditions, setConditions] = useState<{
    stageId?: string;
    status?: string;
    dealStatus?: string;
  }>({});
  const [scheduleWindow, setScheduleWindow] = useState<AutomationScheduleWindow>({});

  // `nodes`/`edges` do React Flow são a FONTE DE VERDADE do fluxo — não há
  // mais um `useState` paralelo com a lista de ações espelhada em nós.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(GRAFO_NOVO.nodes.map(paraFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [execucoes, setExecucoes] = useState(false);
  const [gatilhoDialog, setGatilhoDialog] = useState(false);
  const [filtroDialog, setFiltroDialog] = useState(false);
  const [janelaDialog, setJanelaDialog] = useState(false);
  const [escolherCard, setEscolherCard] = useState(false);
  const [acaoDialog, setAcaoDialog] = useState<{ nodeId: string } | null>(null);
  const [condicaoNoDialog, setCondicaoNoDialog] = useState<{ nodeId: string } | null>(null);
  const [randomDialog, setRandomDialog] = useState<{ nodeId: string } | null>(null);

  const detalheQuery = useQuery({
    queryKey: ["automation", automationId],
    queryFn: () => fetchAutomation({ data: { id: automationId } }),
    enabled: !ehNova,
    // Hidratar uma vez só: com refetch no foco da janela, trocar de aba
    // apagava o fluxo não salvo.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchStages(),
    staleTime: 60_000,
  });
  // Memoizado, e não `stagesQuery.data?.stages ?? []` solto: enquanto a
  // consulta não responde, o `?? []` devolve um array NOVO a cada render, que
  // invalida toda dependência de hook que o toque. Foi exatamente isso que
  // travou o editor da versão anterior — lá o array instável chegava num
  // `useEffect` que chamava `setNodes`, e o ciclo não fechava nunca
  // ("Maximum update depth exceeded"). Aqui não há mais esse efeito, mas o
  // array instável ainda re-renderizaria todos os cards a cada render.
  const stages = useMemo(() => stagesQuery.data?.stages ?? [], [stagesQuery.data]);

  const hidratado = useRef(false);
  useEffect(() => {
    if (ehNova || hidratado.current) return;
    const regra = detalheQuery.data;
    if (!regra) return;
    hidratado.current = true;
    setNome(regra.name);
    setAtiva(regra.active);
    setTriggerEvent(regra.triggerEvent);
    setConditions(regra.triggerConditions ?? {});
    setScheduleWindow(regra.scheduleWindow ?? {});
    setNodes((regra.nodes.length ? regra.nodes : GRAFO_NOVO.nodes).map(paraFlow));
    setEdges(regra.edges.map((e) => ({ ...e, type: "deletavel" })) as Edge[]);
  }, [ehNova, detalheQuery.data, setNodes, setEdges]);

  const removerNo = useCallback(
    (id: string) => {
      setNodes((atual) => atual.filter((n) => n.id !== id));
      // Sem isto sobram ligações apontando pro vazio — que o save recusa.
      setEdges((atual) => atual.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  const removerLigacao = useCallback(
    (id: string) => setEdges((atual) => atual.filter((e) => e.id !== id)),
    [setEdges],
  );

  /** Card novo entra SOLTO no canvas — ligar é arrastar do ponto de saída de um
   *  card até a entrada do outro. Nasce à direita e abaixo do que já existe,
   *  para não cair em cima de nenhum. */
  const criarCard = useCallback(
    (tipo: "action" | "condition" | "randomizer") => {
      const id = novoId();
      setNodes((atual) => {
        const maisAbaixo = atual.reduce((m, n) => Math.max(m, n.position.y), 0);
        const position = { x: 360, y: atual.length <= 1 ? 60 : maisAbaixo + 220 };
        const data: AutomationNodeData =
          tipo === "randomizer" ? { weights: { a: 50, b: 50 } } : {};
        return [...atual, paraFlow({ id, type: tipo, position, data })];
      });
      // Card novo já abre a configuração — ninguém quer um card vazio.
      if (tipo === "action") setAcaoDialog({ nodeId: id });
      if (tipo === "condition") setCondicaoNoDialog({ nodeId: id });
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.target === "trigger" || c.source === c.target) return;
      setEdges((atual) => {
        const limpo = atual.filter(
          (e) =>
            !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)) &&
            e.target !== c.target,
        );
        return addEdge({ ...c, type: "deletavel" }, limpo);
      });
    },
    [setEdges],
  );

  const atualizarNo = useCallback(
    (id: string, data: AutomationNodeData) =>
      setNodes((atual) =>
        atual.map((n) =>
          n.id === id ? { ...n, data: data as unknown as Record<string, unknown> } : n,
        ),
      ),
    [setNodes],
  );

  const editorAcoes: EditorAcoes = useMemo(
    () => ({
      triggerEvent,
      conditions,
      scheduleWindow,
      stages,
      onEditarGatilho: () => setGatilhoDialog(true),
      onEditarFiltro: () => setFiltroDialog(true),
      onEditarJanela: () => setJanelaDialog(true),
      onEditarNo: (id) => {
        const node = nodes.find((n) => n.id === id);
        if (node?.type === "action") setAcaoDialog({ nodeId: id });
        if (node?.type === "condition") setCondicaoNoDialog({ nodeId: id });
        if (node?.type === "randomizer") setRandomDialog({ nodeId: id });
      },
      onRemoverNo: removerNo,
    }),
    [triggerEvent, conditions, scheduleWindow, stages, nodes, removerNo],
  );

  // O botão de excluir mora na aresta, então o callback viaja em `edge.data`
  // — que, ao contrário de `node.data`, é descartado no save.
  const edgesComAcao = useMemo(
    () => edges.map((e) => ({ ...e, data: { ...e.data, onDelete: removerLigacao } })),
    [edges, removerLigacao],
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      // Sanitiza: só o que é config. `node.data` vai inteiro pro banco, e o
      // React Flow enfia `measured`, `selected`, `dragging`, `width`… ali.
      const nodesLimpos: RegraNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type as RegraNode["type"],
        position: n.position,
        data: dadosDoNo(n),
      }));
      const edgesLimpas: RegraEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      }));
      return doSave({
        data: {
          id: ehNova ? undefined : automationId,
          name: nome,
          active: ativa,
          triggerEvent,
          triggerConditions: conditions,
          scheduleWindow,
          nodes: nodesLimpos,
          edges: edgesLimpas,
        },
      });
    },
    onSuccess: () => {
      toast.success(ehNova ? "Automação criada" : "Automação salva");
      // Card solto salva, mas nunca roda: agora que card novo nasce
      // desconectado, esquecer de ligar é fácil demais para passar calado. É
      // aviso, não bloqueio — montar o fluxo aos poucos é legítimo.
      const alcancados = new Set<string>();
      const fila = nodes.filter((n) => n.type === "trigger").map((n) => n.id);
      while (fila.length) {
        const atual = fila.shift()!;
        if (alcancados.has(atual)) continue;
        alcancados.add(atual);
        for (const e of edges) if (e.source === atual) fila.push(e.target);
      }
      const soltos = nodes.filter((n) => !alcancados.has(n.id)).length;
      if (soltos > 0) {
        toast.warning(
          soltos === 1
            ? "Há 1 card sem ligação com o acionamento — ele não vai rodar."
            : `Há ${soltos} cards sem ligação com o acionamento — eles não vão rodar.`,
          { duration: 7000 },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automation", automationId] });
      navigate({ to: "/atendimentos/automacoes" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const acaoAtual = acaoDialog
    ? (dadosDoNo(nodes.find((n) => n.id === acaoDialog.nodeId)).action ?? null)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-subtle">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fechar editor"
          onClick={() => navigate({ to: "/atendimentos/automacoes" })}
        >
          <X className="h-5 w-5" />
        </Button>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Digite um título"
          className="h-9 max-w-[320px] rounded-xl"
        />
        <label className="ml-auto flex items-center gap-2 text-xs font-medium">
          <Switch checked={ativa} onCheckedChange={setAtiva} />
          <span className="hidden sm:inline">{ativa ? "Ativa" : "Pausada"}</span>
        </label>
        {/* "Por que não mandou?" precisava de banco até agora. O executor já
            registrava o motivo de cada tentativa; faltava onde ler. Só existe
            para automação salva — a nova ainda não rodou nenhuma vez. */}
        {!ehNova && (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setExecucoes(true)}
            aria-label="Ver execuções desta automação"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Execuções</span>
          </Button>
        )}
        {/* Criar card é daqui, não de dentro dos cards: lá o "+" era o ponto de
            saída da linha, e as duas coisas no mesmo lugar confundiam. */}
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => setEscolherCard(true)}
          aria-label="Adicionar card ao fluxo"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Card</span>
        </Button>
        <Button
          className="gap-1.5 bg-gradient-primary text-white"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </header>

      {/* Altura explícita: canvas com altura auto renderiza em branco. */}
      <div className="min-h-0 flex-1">
        <EditorAcoesProvider value={editorAcoes}>
          <ReactFlow
            nodes={nodes}
            edges={edgesComAcao}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            // Ligar é arrastar do ponto de saída até a entrada do outro card.
            // O raio generoso existe pro toque: soltar o dedo exatamente em
            // cima de um alvo pequeno é o que mais falha no celular. O React
            // Flow também aceita tocar numa saída e depois na entrada, sem
            // arrastar — que é o caminho mais confiável no telefone.
            connectionRadius={44}
            proOptions={{ hideAttribution: true }}
            // O gatilho é a entrada do fluxo: `deletable: false` nele, e o
            // veto aqui como segunda linha.
            onBeforeDelete={async ({ nodes: aExcluir }) =>
              !aExcluir.some((n) => n.id === "trigger" || n.type === "trigger")
            }
            className="bg-surface-subtle"
          >
            <Background gap={18} size={1.5} color="#d9d9de" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </EditorAcoesProvider>
      </div>

      <Sheet open={execucoes} onOpenChange={setExecucoes}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Execuções</SheetTitle>
            <SheetDescription>
              O que aconteceu a cada vez que o gatilho desta automação disparou.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <PainelExecucoes ruleId={automationId} />
          </div>
        </SheetContent>
      </Sheet>

      <EscolherGatilhoDialog
        open={gatilhoDialog}
        onOpenChange={setGatilhoDialog}
        onEscolher={(evento) => {
          setTriggerEvent(evento);
          setConditions({});
          // Guardrail de loop: mover etapa não pode sobreviver a uma troca
          // para o gatilho de mudança de etapa (o servidor também recusa).
          if (evento === "pipeline.stage_changed") {
            setNodes((atual) =>
              atual.filter((n) => dadosDoNo(n).action?.type !== "move_pipeline_stage"),
            );
          }
        }}
      />
      <EditarCondicaoDialog
        open={filtroDialog}
        onOpenChange={setFiltroDialog}
        triggerEvent={triggerEvent}
        conditions={conditions}
        stages={stages}
        onSalvar={setConditions}
      />
      <EditarJanelaDialog
        open={janelaDialog}
        onOpenChange={setJanelaDialog}
        janela={scheduleWindow}
        onSalvar={setScheduleWindow}
      />
      <EscolherCardDialog
        open={escolherCard}
        onOpenChange={setEscolherCard}
        onEscolher={(tipo) => {
          criarCard(tipo);
          setEscolherCard(false);
        }}
      />
      <AdicionarAcaoDialog
        open={!!acaoDialog}
        onOpenChange={(o) => !o && setAcaoDialog(null)}
        triggerEvent={triggerEvent}
        stages={stages}
        acaoAtual={acaoAtual}
        onAdicionar={(action: AutomationAction) => {
          if (acaoDialog) atualizarNo(acaoDialog.nodeId, { action });
          setAcaoDialog(null);
        }}
      />
      <EditarCondicaoNoDialog
        open={!!condicaoNoDialog}
        onOpenChange={(o) => !o && setCondicaoNoDialog(null)}
        data={dadosDoNo(nodes.find((n) => n.id === condicaoNoDialog?.nodeId))}
        stages={stages}
        onSalvar={(data) => {
          if (condicaoNoDialog) atualizarNo(condicaoNoDialog.nodeId, data);
          setCondicaoNoDialog(null);
        }}
      />
      <EditarRandomizadorDialog
        open={!!randomDialog}
        onOpenChange={(o) => !o && setRandomDialog(null)}
        data={dadosDoNo(nodes.find((n) => n.id === randomDialog?.nodeId))}
        onSalvar={(data) => {
          if (randomDialog) atualizarNo(randomDialog.nodeId, data);
          setRandomDialog(null);
        }}
      />
    </div>
  );
}
