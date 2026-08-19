import { createContext, useContext } from "react";
import { Handle, Position } from "@xyflow/react";
import { Bot, Clock, Dices, Plus, Split, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemEvent } from "@/lib/integrations/meta-capi.functions";
import type {
  AutomationNodeData,
  AutomationScheduleWindow,
} from "@/lib/atendimentos/automations.functions";
import type { PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  ACTION_ESCOPO,
  ACTION_LABEL,
  APPOINTMENT_STATUSES,
  CONDITION_FIELD_LABEL,
  CONDITION_OPERATOR_LABEL,
  DEAL_STATUSES,
  DIAS_SEMANA,
  ESCOPO_LABEL,
  TRIGGER_LABEL_SHORT,
  duracaoTexto,
} from "./automationLabels";

/** Os callbacks do editor vêm por contexto, e NUNCA por `node.data`: `data` é
 *  gravado no banco inteiro, e uma função vira `undefined` no JSON.stringify
 *  sem avisar ninguém. */
export interface EditorAcoes {
  triggerEvent: SystemEvent | null;
  conditions: { stageId?: string; status?: string; dealStatus?: string };
  scheduleWindow: AutomationScheduleWindow;
  stages: PipelineStage[];
  onEditarGatilho: () => void;
  onEditarFiltro: () => void;
  onEditarJanela: () => void;
  onEditarNo: (id: string) => void;
  onRemoverNo: (id: string) => void;
  /** Cria um card novo já ligado nesta saída — é o "+" do handle. No celular
   *  arrastar de um ponto de 8px a outro simplesmente não funciona. */
  onAdicionarDe: (id: string, handle: string | null) => void;
}

const EditorCtx = createContext<EditorAcoes | null>(null);
export const EditorAcoesProvider = EditorCtx.Provider;

function useEditor(): EditorAcoes {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error("Nó de automação fora do EditorAcoesProvider.");
  return ctx;
}

/** Botão "+" colado no ponto de saída. */
function BotaoSaida({ onClick, titulo }: { onClick: () => void; titulo: string }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className="nodrag grid h-6 w-6 place-items-center rounded-full bg-gradient-primary text-white shadow-soft transition-transform hover:scale-110"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function NodeShell({
  icon,
  title,
  tone,
  children,
  hasTarget,
  onRemover,
  rodape,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "violet" | "warning" | "success" | "info";
  children: React.ReactNode;
  hasTarget?: boolean;
  onRemover?: () => void;
  rodape?: React.ReactNode;
}) {
  const toneClass = {
    violet: "bg-violet-soft text-violet",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <div className="w-[280px] rounded-2xl border border-border bg-white shadow-soft">
      {hasTarget && <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-coral" />}
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className={cn("grid h-6 w-6 place-items-center rounded-lg", toneClass)}>{icon}</span>
        <p className="flex-1 text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </p>
        {onRemover && (
          <button
            type="button"
            aria-label={`Excluir card de ${title.toLowerCase()}`}
            onClick={onRemover}
            className="nodrag grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2 p-3.5">{children}</div>
      {rodape}
    </div>
  );
}

/** Linha clicável de configuração dentro de um card. */
function LinhaConfig({
  rotulo,
  valor,
  onClick,
}: {
  rotulo: string;
  valor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nodrag w-full rounded-xl border border-border bg-surface-subtle px-3 py-2 text-left transition-colors hover:border-coral"
    >
      <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-sm font-medium">{valor}</p>
    </button>
  );
}

function condicaoDoGatilhoTexto(e: EditorAcoes): string {
  if (e.triggerEvent === "pipeline.stage_changed" && e.conditions.stageId) {
    const s = e.stages.find((x) => x.id === e.conditions.stageId);
    return s ? `Só na etapa "${s.name}"` : "Só numa etapa específica";
  }
  if (e.triggerEvent === "appointment.status_changed" && e.conditions.status) {
    return APPOINTMENT_STATUSES.find((s) => s.value === e.conditions.status)?.label ?? "Sem filtro";
  }
  if (e.triggerEvent === "deal.status_changed" && e.conditions.dealStatus) {
    return DEAL_STATUSES.find((s) => s.value === e.conditions.dealStatus)?.label ?? "Sem filtro";
  }
  return "Dispara sempre";
}

function janelaTexto(w: AutomationScheduleWindow): string {
  if (!w?.enabled || !w.days?.length) return "A qualquer hora";
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

const TEM_FILTRO: SystemEvent[] = [
  "pipeline.stage_changed",
  "appointment.status_changed",
  "deal.status_changed",
];

/** Card de entrada do fluxo: qual evento, com que filtro e em que janela.
 *  Não é deletável — automação sem entrada não roda. */
export function TriggerNode({ id }: { id: string }) {
  const e = useEditor();
  return (
    <NodeShell
      icon={<Zap className="h-3.5 w-3.5" />}
      title="Acionamento"
      tone="violet"
      rodape={
        <div className="flex items-center justify-end gap-2 border-t border-border px-3.5 py-2">
          <span className="text-2xs text-muted-foreground">Próximo passo</span>
          <BotaoSaida onClick={() => e.onAdicionarDe(id, null)} titulo="Adicionar próximo card" />
        </div>
      }
    >
      <button
        type="button"
        onClick={e.onEditarGatilho}
        className="nodrag w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
      >
        <p className="text-sm font-medium">
          {e.triggerEvent ? TRIGGER_LABEL_SHORT[e.triggerEvent] : "Escolher gatilho"}
        </p>
      </button>
      {/* Responde "esse gatilho é pra quem?" — a dúvida que a topologia antiga
          deixava no ar. */}
      {e.triggerEvent && (
        <p className="rounded-xl bg-violet-soft/60 px-3 py-2 text-2xs leading-4 text-foreground/75">
          Roda uma vez por acontecimento, tratando só da pessoa daquele evento — nunca da base
          inteira.
        </p>
      )}
      {e.triggerEvent && TEM_FILTRO.includes(e.triggerEvent) && (
        <LinhaConfig rotulo="Filtro" valor={condicaoDoGatilhoTexto(e)} onClick={e.onEditarFiltro} />
      )}
      {e.triggerEvent && (
        <LinhaConfig
          rotulo="Janela"
          valor={janelaTexto(e.scheduleWindow)}
          onClick={e.onEditarJanela}
        />
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-coral" />
    </NodeShell>
  );
}

function acaoResumo(data: AutomationNodeData, stages: PipelineStage[]): string {
  const action = data.action;
  if (!action) return "(vazio)";
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

export function ActionNode({ id, data }: { id: string; data: AutomationNodeData }) {
  const e = useEditor();
  const tipo = data.action?.type;
  const escopo = tipo ? ACTION_ESCOPO[tipo] : "fluxo";
  const ehEspera = tipo === "wait";
  return (
    <NodeShell
      icon={ehEspera ? <Clock className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      title={ehEspera ? "Espera" : "Ação"}
      tone={ehEspera ? "info" : "success"}
      hasTarget
      onRemover={() => e.onRemoverNo(id)}
      rodape={
        <div className="flex items-center justify-end gap-2 border-t border-border px-3.5 py-2">
          <span className="text-2xs text-muted-foreground">Próximo passo</span>
          <BotaoSaida onClick={() => e.onAdicionarDe(id, null)} titulo="Adicionar próximo card" />
        </div>
      }
    >
      <button
        type="button"
        onClick={() => e.onEditarNo(id)}
        className="nodrag w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
      >
        <p className="truncate text-sm font-medium">
          {tipo ? ACTION_LABEL[tipo] : "Escolher ação"}
        </p>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          {acaoResumo(data, e.stages)}
        </p>
      </button>
      {tipo && escopo !== "fluxo" && (
        <span
          className={cn(
            "inline-block rounded-full px-2 py-0.5 text-3xs font-semibold",
            escopo === "pessoa" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          )}
        >
          {ESCOPO_LABEL[escopo]}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-coral" />
    </NodeShell>
  );
}

function condicaoTexto(data: AutomationNodeData, stages: PipelineStage[]): string {
  if (!data.field) return "Escolher condição";
  if (data.field === "hasContact") return CONDITION_FIELD_LABEL.hasContact;
  const campo = CONDITION_FIELD_LABEL[data.field] ?? data.field;
  if (data.field === "amount") {
    return `${campo} ${CONDITION_OPERATOR_LABEL[data.operator ?? "eq"]} ${data.value ?? ""}`;
  }
  if (data.field === "stageId") {
    const s = stages.find((x) => x.id === data.value);
    return `${campo}: ${s?.name ?? data.value ?? ""}`;
  }
  const lista = data.field === "status" ? APPOINTMENT_STATUSES : DEAL_STATUSES;
  return `${campo}: ${lista.find((x) => x.value === data.value)?.label ?? data.value ?? ""}`;
}

export function ConditionNode({ id, data }: { id: string; data: AutomationNodeData }) {
  const e = useEditor();
  return (
    <NodeShell
      icon={<Split className="h-3.5 w-3.5" />}
      title="Condição"
      tone="warning"
      hasTarget
      onRemover={() => e.onRemoverNo(id)}
      rodape={
        <div className="space-y-1.5 border-t border-border px-3.5 py-2">
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xs font-semibold text-success">Sim</span>
            <BotaoSaida onClick={() => e.onAdicionarDe(id, "sim")} titulo="Card do caminho Sim" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xs font-semibold text-muted-foreground">Não</span>
            <BotaoSaida onClick={() => e.onAdicionarDe(id, "nao")} titulo="Card do caminho Não" />
          </div>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => e.onEditarNo(id)}
        className="nodrag w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
      >
        <p className="text-sm font-medium">{condicaoTexto(data, e.stages)}</p>
      </button>
      {/* Handles nomeados: sem o id, `sourceHandle` chega nulo na ligação e o
          executor não sabe qual ramo seguir. */}
      <Handle
        id="sim"
        type="source"
        position={Position.Right}
        style={{ top: "auto", bottom: 34 }}
        className="!h-2 !w-2 !bg-success"
      />
      <Handle
        id="nao"
        type="source"
        position={Position.Right}
        style={{ top: "auto", bottom: 12 }}
        className="!h-2 !w-2 !bg-muted-foreground"
      />
    </NodeShell>
  );
}

export function RandomizerNode({ id, data }: { id: string; data: AutomationNodeData }) {
  const e = useEditor();
  const pesoA = Number(data.weights?.a ?? 50);
  const pesoB = Number(data.weights?.b ?? 50);
  return (
    <NodeShell
      icon={<Dices className="h-3.5 w-3.5" />}
      title="Randomizador"
      tone="info"
      hasTarget
      onRemover={() => e.onRemoverNo(id)}
      rodape={
        <div className="space-y-1.5 border-t border-border px-3.5 py-2">
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xs font-semibold text-muted-foreground">A · {pesoA}%</span>
            <BotaoSaida onClick={() => e.onAdicionarDe(id, "a")} titulo="Card do caminho A" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xs font-semibold text-muted-foreground">B · {pesoB}%</span>
            <BotaoSaida onClick={() => e.onAdicionarDe(id, "b")} titulo="Card do caminho B" />
          </div>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => e.onEditarNo(id)}
        className="nodrag w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-coral"
      >
        <p className="text-sm font-medium">Sorteia entre dois caminhos</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {pesoA}% no A, {pesoB}% no B
        </p>
      </button>
      <Handle
        id="a"
        type="source"
        position={Position.Right}
        style={{ top: "auto", bottom: 34 }}
        className="!h-2 !w-2 !bg-coral"
      />
      <Handle
        id="b"
        type="source"
        position={Position.Right}
        style={{ top: "auto", bottom: 12 }}
        className="!h-2 !w-2 !bg-coral"
      />
    </NodeShell>
  );
}
