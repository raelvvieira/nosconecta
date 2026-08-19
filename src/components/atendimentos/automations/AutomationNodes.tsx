import { Handle, Position } from "@xyflow/react";
import { Bot, GitBranch, Plus, Sliders, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SystemEvent } from "@/lib/integrations/meta-capi.functions";
import type {
  AutomationAction,
  AutomationScheduleWindow,
} from "@/lib/atendimentos/automations.functions";
import type { PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  ACTION_LABEL,
  APPOINTMENT_STATUSES,
  DEAL_STATUSES,
  DIAS_SEMANA,
  TRIGGER_LABEL_SHORT,
  duracaoTexto,
} from "./automationLabels";

/** Casca comum dos três nós — mesmo vocabulário visual dos cards do resto do
 *  app (surface-card, badge de ícone arredondado, título em text-sm). */
function NodeShell({
  icon,
  title,
  tone,
  children,
  hasTarget,
  hasSource,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "violet" | "warning" | "success";
  children: React.ReactNode;
  hasTarget?: boolean;
  hasSource?: boolean;
}) {
  const toneClass =
    tone === "violet"
      ? "bg-violet-soft text-violet"
      : tone === "warning"
        ? "bg-warning-soft text-warning"
        : "bg-success-soft text-success";
  return (
    <div className="w-[280px] rounded-2xl border border-border bg-white shadow-soft">
      {hasTarget && <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-coral" />}
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-xl", toneClass)}>
          {icon}
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="space-y-2 p-3.5">{children}</div>
      {hasSource && <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-coral" />}
    </div>
  );
}

export interface AcionamentoNodeData {
  triggerEvent: SystemEvent | null;
  onEscolher: () => void;
  [key: string]: unknown;
}

export function AcionamentoNode({ data }: { data: AcionamentoNodeData }) {
  return (
    <NodeShell icon={<Zap className="h-3.5 w-3.5" />} title="Acionamento" tone="violet" hasSource>
      {data.triggerEvent ? (
        <button
          type="button"
          onClick={data.onEscolher}
          className="w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
        >
          <p className="text-sm font-medium">{TRIGGER_LABEL_SHORT[data.triggerEvent]}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">Toque para trocar</p>
        </button>
      ) : (
        <Button
          size="sm"
          className="w-full gap-1.5 bg-gradient-primary text-white"
          onClick={data.onEscolher}
        >
          <Plus className="h-3.5 w-3.5" />
          Escolher gatilho
        </Button>
      )}
    </NodeShell>
  );
}

export interface ConfiguracoesNodeData {
  triggerEvent: SystemEvent | null;
  conditions: { stageId?: string; status?: string; dealStatus?: string };
  stages: PipelineStage[];
  scheduleWindow: AutomationScheduleWindow;
  onEditar: () => void;
  onEditarJanela: () => void;
  [key: string]: unknown;
}

/** Texto do filtro em uso — mesmo vocabulário do MetaTriggerSheet. */
function condicaoTexto(data: ConfiguracoesNodeData): string | null {
  if (data.triggerEvent === "pipeline.stage_changed" && data.conditions.stageId) {
    const stage = data.stages.find((s) => s.id === data.conditions.stageId);
    return stage ? `Só na etapa "${stage.name}"` : "Só numa etapa específica";
  }
  if (data.triggerEvent === "appointment.status_changed" && data.conditions.status) {
    const status = APPOINTMENT_STATUSES.find((s) => s.value === data.conditions.status);
    return status ? `Só quando "${status.label}"` : null;
  }
  if (data.triggerEvent === "deal.status_changed" && data.conditions.dealStatus) {
    const status = DEAL_STATUSES.find((s) => s.value === data.conditions.dealStatus);
    return status ? `Só quando "${status.label}"` : null;
  }
  return null;
}

/** "Seg–Sex, 08:00–18:00" — resumo da janela pro card. Dias contíguos viram
 *  faixa; o resto é listado. */
function janelaTexto(w: AutomationScheduleWindow): string | null {
  if (!w?.enabled || !w.days?.length) return null;
  const dias = [...w.days].sort((a, b) => a - b);
  const curto = (v: number) => DIAS_SEMANA.find((d) => d.valor === v)?.curto ?? "";
  const contiguo = dias.every((v, i) => i === 0 || v === dias[i - 1] + 1);
  const rotulo =
    dias.length === 7
      ? "Todo dia"
      : contiguo && dias.length > 2
        ? `${curto(dias[0])}–${curto(dias[dias.length - 1])}`
        : dias.map(curto).join(", ");
  return `${rotulo}, ${w.start ?? "00:00"}–${w.end ?? "23:59"}`;
}

const TEM_CONDICAO: SystemEvent[] = [
  "pipeline.stage_changed",
  "appointment.status_changed",
  "deal.status_changed",
];

export function ConfiguracoesNode({ data }: { data: ConfiguracoesNodeData }) {
  const texto = condicaoTexto(data);
  const aceitaCondicao = data.triggerEvent && TEM_CONDICAO.includes(data.triggerEvent);

  return (
    <NodeShell
      icon={<Sliders className="h-3.5 w-3.5" />}
      title="Configurações"
      tone="warning"
      hasTarget
      hasSource
    >
      {!data.triggerEvent && (
        <p className="text-2xs text-muted-foreground">Escolha um gatilho primeiro.</p>
      )}
      {data.triggerEvent && !aceitaCondicao && (
        <p className="text-2xs text-muted-foreground">
          Este gatilho não tem filtro — dispara sempre que acontecer.
        </p>
      )}
      {aceitaCondicao && (
        <button
          type="button"
          onClick={data.onEditar}
          className="w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
        >
          <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground">Filtro</p>
          <p className="mt-0.5 text-sm font-medium">{texto ?? "Sem filtro — dispara sempre"}</p>
        </button>
      )}
      {data.triggerEvent && (
        <button
          type="button"
          onClick={data.onEditarJanela}
          className="w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
        >
          <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground">Janela</p>
          <p className="mt-0.5 text-sm font-medium">
            {janelaTexto(data.scheduleWindow) ?? "A qualquer hora"}
          </p>
        </button>
      )}
    </NodeShell>
  );
}

export interface AcoesNodeData {
  actions: AutomationAction[];
  stages: PipelineStage[];
  onAdicionar: () => void;
  onRemover: (index: number) => void;
  [key: string]: unknown;
}

function acaoResumo(action: AutomationAction, stages: PipelineStage[]): string {
  switch (action.type) {
    case "send_whatsapp":
      return action.message?.trim() || "(sem texto)";
    case "move_pipeline_stage": {
      const stage = stages.find((s) => s.id === action.stageId);
      return stage ? stage.name : "(etapa não encontrada)";
    }
    case "add_deal_note":
      return action.noteBody?.trim() || "(sem texto)";
    case "send_push":
      return action.pushTitle?.trim() || "(sem título)";
    case "webhook":
      return action.webhookUrl?.trim() || "(sem URL)";
    case "wait":
      return duracaoTexto(Number(action.waitMinutes ?? 0));
  }
}

export function AcoesNode({ data }: { data: AcoesNodeData }) {
  return (
    <NodeShell icon={<GitBranch className="h-3.5 w-3.5" />} title="Ações" tone="success" hasTarget>
      {data.actions.map((action, index) => (
        <div
          key={index}
          className="flex items-start gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2.5"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
            <Bot className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{ACTION_LABEL[action.type]}</p>
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {acaoResumo(action, data.stages)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remover ação"
            onClick={() => data.onRemover(index)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant={data.actions.length ? "outline" : "default"}
        className={cn("w-full gap-1.5", !data.actions.length && "bg-gradient-primary text-white")}
        onClick={data.onAdicionar}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar ação
      </Button>
    </NodeShell>
  );
}
