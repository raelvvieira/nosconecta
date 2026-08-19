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
import { X } from "lucide-react";
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
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Automação não encontrada" notFound />,
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
  ({ ...n, data: n.data as unknown as Record<string, unknown>, deletable: n.type !== "trigger" }) as Node;

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

  const [gatilhoDialog, setGatilhoDialog] = useState(false);
  const [filtroDialog, setFiltroDialog] = useState(false);
  const [janelaDialog, setJanelaDialog] = useState(false);
  const [escolherCard, setEscolherCard] = useState<{ de: string; handle: string | null } | null>(
    null,
  );
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
  const stages = stagesQuery.data?.stages ?? [];

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

  const criarCard = useCallback(
    (tipo: "action" | "condition" | "randomizer", de: string, handle: string | null) => {
      const origem = nodes.find((n) => n.id === de);
      const id = novoId();
      const position = {
        x: (origem?.position.x ?? 0) + 340,
        y: (origem?.position.y ?? 0) + (handle === "nao" || handle === "b" ? 200 : 0),
      };
      const data: AutomationNodeData =
        tipo === "randomizer" ? { weights: { a: 50, b: 50 } } : {};
      setNodes((atual) => [...atual, paraFlow({ id, type: tipo, position, data })]);
      setEdges((atual) => [
        // Uma ligação por saída: a nova substitui a que houver no mesmo ponto.
        ...atual.filter((e) => !(e.source === de && (e.sourceHandle ?? null) === handle)),
        { id: `e${id}`, source: de, target: id, sourceHandle: handle, type: "deletavel" } as Edge,
      ]);
      // Card novo já abre a configuração — ninguém quer um card vazio.
      if (tipo === "action") setAcaoDialog({ nodeId: id });
      if (tipo === "condition") setCondicaoNoDialog({ nodeId: id });
    },
    [nodes, setNodes, setEdges],
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
      onAdicionarDe: (id, handle) => setEscolherCard({ de: id, handle }),
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
        open={!!escolherCard}
        onOpenChange={(o) => !o && setEscolherCard(null)}
        onEscolher={(tipo) => {
          if (escolherCard) criarCard(tipo, escolherCard.de, escolherCard.handle);
          setEscolherCard(null);
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
