import { useEffect, useState } from "react";
import { AlertTriangle, CalendarPlus, GitBranch, MessageSquare, UserPlus, Wallet, XCircle, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYSTEM_EVENTS, type SystemEvent } from "@/lib/integrations/meta-capi.functions";
import type { AutomationAction } from "@/lib/atendimentos/automations.functions";
import type { PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  APPOINTMENT_STATUSES,
  DEAL_STATUSES,
  TRIGGER_LABEL,
  TRIGGERS_SEM_CONTATO_GARANTIDO,
} from "./automationLabels";

const TRIGGER_ICON: Record<SystemEvent, React.ReactNode> = {
  "patient.created": <UserPlus className="h-4 w-4" />,
  "appointment.created": <CalendarPlus className="h-4 w-4" />,
  "appointment.status_changed": <CalendarPlus className="h-4 w-4" />,
  "receivable.paid": <Wallet className="h-4 w-4" />,
  "deal.status_changed": <XCircle className="h-4 w-4" />,
  "pipeline.stage_changed": <GitBranch className="h-4 w-4" />,
};

const TRIGGER_HINT: Record<SystemEvent, string> = {
  "patient.created": "Sempre que uma ficha nova de paciente é criada.",
  "appointment.created": "Sempre que um agendamento entra na agenda.",
  "appointment.status_changed": "Confirmado, concluído, faltou, cancelado…",
  "receivable.paid": "Quando um recebimento é marcado como recebido.",
  "deal.status_changed": "Quando uma negociação é marcada como perdida no funil.",
  "pipeline.stage_changed": "Quando um card é movido para outra etapa do funil.",
};

export function EscolherGatilhoDialog({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscolher: (event: SystemEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet" />
            Selecione um acionamento
          </DialogTitle>
          <DialogDescription>O que faz esta automação começar a rodar.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto px-2">
          {SYSTEM_EVENTS.map((event) => (
            <button
              key={event}
              type="button"
              onClick={() => {
                onEscolher(event);
                onOpenChange(false);
              }}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-soft text-violet">
                {TRIGGER_ICON[event]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{TRIGGER_LABEL[event]}</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {TRIGGER_HINT[event]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditarCondicaoDialog({
  open,
  onOpenChange,
  triggerEvent,
  conditions,
  stages,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerEvent: SystemEvent | null;
  conditions: { stageId?: string; status?: string; dealStatus?: string };
  stages: PipelineStage[];
  onSalvar: (conditions: { stageId?: string; status?: string; dealStatus?: string }) => void;
}) {
  const SEM_FILTRO = "__todas__";
  const [valor, setValor] = useState(SEM_FILTRO);

  useEffect(() => {
    if (!open) return;
    setValor(
      conditions.stageId ?? conditions.status ?? conditions.dealStatus ?? SEM_FILTRO,
    );
  }, [open, conditions]);

  const opcoes =
    triggerEvent === "pipeline.stage_changed"
      ? stages.map((s) => ({ value: s.id, label: s.name }))
      : triggerEvent === "appointment.status_changed"
        ? APPOINTMENT_STATUSES
        : triggerEvent === "deal.status_changed"
          ? DEAL_STATUSES
          : [];

  const rotulo =
    triggerEvent === "pipeline.stage_changed"
      ? "Etapa do funil"
      : triggerEvent === "appointment.status_changed"
        ? "Situação do agendamento"
        : "Situação da negociação";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Filtrar quando dispara</DialogTitle>
          <DialogDescription>
            Sem filtro, a automação roda toda vez que o gatilho acontecer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{rotulo}</Label>
            <Select value={valor} onValueChange={setValor}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_FILTRO}>Sem filtro — dispara sempre</SelectItem>
                {opcoes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {triggerEvent === "pipeline.stage_changed" && !stages.length && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Nenhuma etapa encontrada. Configure o funil em Atendimentos › Pipeline.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-gradient-primary text-white"
              onClick={() => {
                const limpo = valor === SEM_FILTRO ? undefined : valor;
                if (triggerEvent === "pipeline.stage_changed") onSalvar({ stageId: limpo });
                else if (triggerEvent === "appointment.status_changed") onSalvar({ status: limpo });
                else if (triggerEvent === "deal.status_changed") onSalvar({ dealStatus: limpo });
                onOpenChange(false);
              }}
            >
              Aplicar
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdicionarAcaoDialog({
  open,
  onOpenChange,
  triggerEvent,
  stages,
  onAdicionar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerEvent: SystemEvent | null;
  stages: PipelineStage[];
  onAdicionar: (action: AutomationAction) => void;
}) {
  const [tipo, setTipo] = useState<"escolher" | "send_whatsapp" | "move_pipeline_stage">("escolher");
  const [mensagem, setMensagem] = useState("");
  const [stageId, setStageId] = useState("");

  useEffect(() => {
    if (!open) return;
    setTipo("escolher");
    setMensagem("");
    setStageId("");
  }, [open]);

  // Guardrail de loop: mover etapa não pode ser ação de quem já dispara ao
  // mudar de etapa (o servidor também recusa — ver saveAutomation).
  const podeMoverEtapa = triggerEvent !== "pipeline.stage_changed";
  const avisaSemContato = triggerEvent && TRIGGERS_SEM_CONTATO_GARANTIDO.includes(triggerEvent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Selecione uma ação</DialogTitle>
          <DialogDescription>O que a automação faz quando o gatilho acontece.</DialogDescription>
        </DialogHeader>

        {tipo === "escolher" && (
          <div className="-mx-2 space-y-1 px-2">
            <p className="px-1 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Mensagem
            </p>
            <button
              type="button"
              onClick={() => setTipo("send_whatsapp")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Enviar WhatsApp</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  Manda uma mensagem para o contato do evento.
                </span>
              </span>
            </button>

            <p className="px-1 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Funil
            </p>
            <button
              type="button"
              disabled={!podeMoverEtapa}
              onClick={() => setTipo("move_pipeline_stage")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-soft text-violet">
                <GitBranch className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Mover para etapa</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {podeMoverEtapa
                    ? "Move o card do funil para outra etapa."
                    : "Indisponível: a automação já dispara ao mudar de etapa — mover de novo criaria um loop."}
                </span>
              </span>
            </button>
          </div>
        )}

        {tipo === "send_whatsapp" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="acao-mensagem">Mensagem *</Label>
              <Textarea
                id="acao-mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Oi {{nome}}! Tudo bem?"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1">{"{{nome}}"}</code> para inserir o nome
                da pessoa.
              </p>
            </div>
            {avisaSemContato && (
              <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                Este gatilho pode disparar sem paciente vinculado — nesses casos a mensagem não sai.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!mensagem.trim()}
                onClick={() => {
                  onAdicionar({ type: "send_whatsapp", message: mensagem.trim() });
                  onOpenChange(false);
                }}
              >
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setTipo("escolher")}>
                Voltar
              </Button>
            </div>
          </div>
        )}

        {tipo === "move_pipeline_stage" && (
          <div className="space-y-4">
            <div>
              <Label>Etapa de destino *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!stages.length && (
                <p className="mt-1.5 text-2xs text-muted-foreground">
                  Nenhuma etapa encontrada. Configure o funil em Atendimentos › Pipeline.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!stageId}
                onClick={() => {
                  onAdicionar({ type: "move_pipeline_stage", stageId });
                  onOpenChange(false);
                }}
              >
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setTipo("escolher")}>
                Voltar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
