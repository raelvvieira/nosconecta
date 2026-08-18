import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
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
  AcionamentoNode,
  AcoesNode,
  ConfiguracoesNode,
} from "@/components/atendimentos/automations/AutomationNodes";
import {
  AdicionarAcaoDialog,
  EditarCondicaoDialog,
  EscolherGatilhoDialog,
} from "@/components/atendimentos/automations/AutomationDialogs";
import {
  getAutomation,
  saveAutomation,
  type AutomationAction,
  type AutomationCanvasLayout,
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

// Topologia fixa em v1: sempre Acionamento -> Configurações -> Ações. As
// arestas não são editáveis (nada de conectar/desconectar) — só o conteúdo de
// cada nó é configurável, e a posição é livre pra clínica organizar como
// preferir (salva em canvas_layout).
const POSICOES_PADRAO: Required<AutomationCanvasLayout> = {
  acionamento: { x: 0, y: 40 },
  configuracoes: { x: 360, y: 40 },
  acoes: { x: 720, y: 40 },
};

const EDGES_FIXAS = [
  {
    id: "e1",
    source: "acionamento",
    target: "configuracoes",
    animated: true,
    style: { stroke: "#f0668a", strokeDasharray: "4 4" },
  },
  {
    id: "e2",
    source: "configuracoes",
    target: "acoes",
    animated: true,
    style: { stroke: "#f0668a", strokeDasharray: "4 4" },
  },
];

const nodeTypes: NodeTypes = {
  acionamento: AcionamentoNode,
  configuracoes: ConfiguracoesNode,
  acoes: AcoesNode,
};

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
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [layout, setLayout] = useState<Required<AutomationCanvasLayout>>(POSICOES_PADRAO);

  const [gatilhoDialog, setGatilhoDialog] = useState(false);
  const [condicaoDialog, setCondicaoDialog] = useState(false);
  const [acaoDialog, setAcaoDialog] = useState(false);

  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchStages(),
    staleTime: 60_000,
  });
  const stages = stagesQuery.data?.stages ?? [];

  const automationQuery = useQuery({
    queryKey: ["automation", automationId],
    queryFn: () => fetchAutomation({ data: { id: automationId } }),
    enabled: !ehNova,
    staleTime: 0,
  });

  // Carrega o estado salvo uma vez, quando a automação existente chega.
  useEffect(() => {
    const regra = automationQuery.data;
    if (!regra) return;
    setNome(regra.name);
    setAtiva(regra.active);
    setTriggerEvent(regra.triggerEvent);
    setConditions(regra.triggerConditions ?? {});
    setActions(regra.actions ?? []);
    setLayout({
      acionamento: regra.canvasLayout?.acionamento ?? POSICOES_PADRAO.acionamento,
      configuracoes: regra.canvasLayout?.configuracoes ?? POSICOES_PADRAO.configuracoes,
      acoes: regra.canvasLayout?.acoes ?? POSICOES_PADRAO.acoes,
    });
  }, [automationQuery.data]);

  // Trocar de gatilho invalida a condição antiga (era de outro evento) e
  // qualquer ação de mover etapa, se o novo gatilho for o de mudança de etapa
  // (guardrail de loop — o servidor recusaria de qualquer forma).
  const escolherGatilho = useCallback((event: SystemEvent) => {
    setTriggerEvent((anterior) => {
      if (anterior !== event) setConditions({});
      return event;
    });
    if (event === "pipeline.stage_changed") {
      setActions((atual) => atual.filter((a) => a.type !== "move_pipeline_stage"));
    }
  }, []);

  const removerAcao = useCallback((index: number) => {
    setActions((atual) => atual.filter((_, i) => i !== index));
  }, []);

  const nodesIniciais: Node[] = useMemo(
    () => [
      {
        id: "acionamento",
        type: "acionamento",
        position: layout.acionamento,
        data: { triggerEvent, onEscolher: () => setGatilhoDialog(true) },
      },
      {
        id: "configuracoes",
        type: "configuracoes",
        position: layout.configuracoes,
        data: { triggerEvent, conditions, stages, onEditar: () => setCondicaoDialog(true) },
      },
      {
        id: "acoes",
        type: "acoes",
        position: layout.acoes,
        data: {
          actions,
          stages,
          onAdicionar: () => setAcaoDialog(true),
          onRemover: removerAcao,
        },
      },
    ],
    // `layout` de propósito fora: reposicionar durante o arraste recriaria o
    // nó no meio do gesto. A posição só volta pro estado ao salvar (onNodeDragStop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [triggerEvent, conditions, actions, stages, removerAcao],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(nodesIniciais);
  const [edges, , onEdgesChange] = useEdgesState(EDGES_FIXAS);

  // Conteúdo dos nós muda (gatilho escolhido, ação adicionada) sem mexer na
  // posição que a clínica já arrastou.
  useEffect(() => {
    setNodes((atuais) =>
      nodesIniciais.map((novo) => {
        const existente = atuais.find((n) => n.id === novo.id);
        return existente ? { ...novo, position: existente.position } : novo;
      }),
    );
  }, [nodesIniciais, setNodes]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const posicoes = nodes.reduce<AutomationCanvasLayout>((acc, node) => {
        if (node.id === "acionamento") acc.acionamento = node.position;
        if (node.id === "configuracoes") acc.configuracoes = node.position;
        if (node.id === "acoes") acc.acoes = node.position;
        return acc;
      }, {});
      return doSave({
        data: {
          id: ehNova ? undefined : automationId,
          name: nome,
          active: ativa,
          triggerEvent,
          triggerConditions: conditions,
          actions,
          canvasLayout: posicoes,
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          // Topologia fixa: sem criar/apagar conexão nem deletar nó.
          nodesConnectable={false}
          deleteKeyCode={null}
          className="bg-surface-subtle"
        >
          <Background gap={18} size={1.5} color="#d9d9de" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <EscolherGatilhoDialog
        open={gatilhoDialog}
        onOpenChange={setGatilhoDialog}
        onEscolher={escolherGatilho}
      />
      <EditarCondicaoDialog
        open={condicaoDialog}
        onOpenChange={setCondicaoDialog}
        triggerEvent={triggerEvent}
        conditions={conditions}
        stages={stages}
        onSalvar={setConditions}
      />
      <AdicionarAcaoDialog
        open={acaoDialog}
        onOpenChange={setAcaoDialog}
        triggerEvent={triggerEvent}
        stages={stages}
        onAdicionar={(action) => setActions((atual) => [...atual, action])}
      />
    </div>
  );
}
