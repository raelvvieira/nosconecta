import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bot,
  Dices,
  Split,
  CalendarPlus,
  GitBranch,
  MessageSquare,
  StickyNote,
  Timer,
  UserPlus,
  Wallet,
  Webhook,
  XCircle,
  Zap,
  BellRing,
  MessageSquareReply,
  CalendarCheck,
} from "lucide-react";
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
import {
  AUTOMATION_EVENTS,
  type AutomationEvent,
} from "@/lib/atendimentos/automation-events";
import { varsDoGatilho } from "@/lib/atendimentos/automation-vars";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  GATILHOS_COM_AGENDAMENTO,
  GATILHOS_COM_CONTAGEM,
  GATILHOS_COM_RESPOSTA,
  OPERADORES_DO_CAMPO,
  type AutomationAction,
  type AutomationActionType,
  type AutomationNodeData,
  type AutomationScheduleWindow,
  type ConditionField,
  type ConditionOperator,
} from "@/lib/atendimentos/automations.functions";
import type { PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  APPOINTMENT_STATUSES,
  CONDITION_OPERATOR_LABEL,
  DEAL_STATUSES,
  DIAS_SEMANA,
  TRIGGER_LABEL,
  TRIGGERS_SEM_CONTATO_GARANTIDO,
} from "./automationLabels";

const TRIGGER_ICON: Record<AutomationEvent, React.ReactNode> = {
  "patient.created": <UserPlus className="h-4 w-4" />,
  "appointment.created": <CalendarPlus className="h-4 w-4" />,
  "appointment.status_changed": <CalendarPlus className="h-4 w-4" />,
  "receivable.paid": <Wallet className="h-4 w-4" />,
  "deal.status_changed": <XCircle className="h-4 w-4" />,
  "pipeline.stage_changed": <GitBranch className="h-4 w-4" />,
  "appointment.reminder_due": <BellRing className="h-4 w-4" />,
  "whatsapp.reply_received": <MessageSquareReply className="h-4 w-4" />,
};

const TRIGGER_HINT: Record<AutomationEvent, string> = {
  "patient.created": "Sempre que uma ficha nova de paciente é criada.",
  "appointment.created": "Sempre que um agendamento entra na agenda.",
  "appointment.status_changed": "Confirmado, concluído, faltou, cancelado…",
  "receivable.paid": "Quando um recebimento é marcado como recebido.",
  "deal.status_changed": "Quando uma negociação é marcada como perdida no funil.",
  "pipeline.stage_changed": "Quando um card é movido para outra etapa do funil.",
  "appointment.reminder_due":
    "Todo dia de manhã, para cada consulta que está a 3 dias, 1 dia ou é hoje.",
  "whatsapp.reply_received":
    "Quando o paciente responde no WhatsApp. Vale para a consulta futura mais próxima dele.",
};

export function EscolherGatilhoDialog({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscolher: (event: AutomationEvent) => void;
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
        <div className="space-y-1">
          {AUTOMATION_EVENTS.map((event) => (
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
  triggerEvent: AutomationEvent | null;
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

/** Chips das variáveis que o gatilho escolhido consegue preencher.
 *
 *  Clicar insere no ponto onde o cursor está, e não no fim do texto: escrever
 *  "confirmado para o dia " e ter {{data}} caindo no fim da frase seria pior
 *  do que digitar à mão. Só aparecem as compatíveis — o save recusa o resto,
 *  então oferecer uma variável que aquele gatilho não preenche seria convidar
 *  para um erro. */
function VariaveisDisponiveis({
  trigger,
  campoRef,
  valor,
  onInserir,
}: {
  trigger: AutomationEvent | null;
  campoRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  valor: string;
  onInserir: (novo: string) => void;
}) {
  const vars = varsDoGatilho(trigger);
  if (!vars.length) return null;

  const inserir = (chave: string) => {
    const token = `{{${chave}}}`;
    const el = campoRef.current;
    const pos = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? pos;
    onInserir(valor.slice(0, pos) + token + valor.slice(fim));
    // Devolve o foco com o cursor depois do token, senão o próximo clique
    // recomeça do fim do texto.
    requestAnimationFrame(() => {
      el?.focus();
      const p = pos + token.length;
      el?.setSelectionRange?.(p, p);
    });
  };

  return (
    <div className="mt-2">
      <p className="text-2xs text-muted-foreground">
        Toque para inserir — o valor real entra na hora do envio:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {vars.map((v) => (
          <button
            key={v.chave}
            type="button"
            onClick={() => inserir(v.chave)}
            title={`${v.rotulo} — ex.: ${v.exemplo}`}
            className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 font-mono text-2xs text-foreground-secondary transition-colors hover:border-coral hover:text-coral"
          >
            {`{{${v.chave}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdicionarAcaoDialog({
  open,
  onOpenChange,
  triggerEvent,
  stages,
  acaoAtual,
  onAdicionar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerEvent: AutomationEvent | null;
  stages: PipelineStage[];
  /** Ação já configurada, quando o card está sendo reaberto pra editar. */
  acaoAtual?: AutomationAction | null;
  onAdicionar: (action: AutomationAction) => void;
}) {
  const [tipo, setTipo] = useState<AutomationActionType | "escolher">("escolher");
  const [mensagem, setMensagem] = useState("");
  // Refs pra inserir a variável na posição do cursor (ver VariaveisDisponiveis).
  const refMensagem = useRef<HTMLTextAreaElement>(null);
  const refNota = useRef<HTMLTextAreaElement>(null);
  const refPushTitulo = useRef<HTMLInputElement>(null);
  const refPushTexto = useRef<HTMLTextAreaElement>(null);
  const [stageId, setStageId] = useState("");
  const [nota, setNota] = useState("");
  const [pushTitulo, setPushTitulo] = useState("");
  const [pushTexto, setPushTexto] = useState("");
  const [url, setUrl] = useState("");
  const [statusAgendamento, setStatusAgendamento] = useState("");
  const [esperaValor, setEsperaValor] = useState("1");
  const [esperaUnidade, setEsperaUnidade] = useState<"minutos" | "horas" | "dias">("dias");

  useEffect(() => {
    if (!open) return;
    // Card sendo reaberto: abre direto no formulário dele, já preenchido.
    setTipo(acaoAtual?.type ?? "escolher");
    setMensagem(acaoAtual?.message ?? "");
    setStageId(acaoAtual?.stageId ?? "");
    setNota(acaoAtual?.noteBody ?? "");
    setPushTitulo(acaoAtual?.pushTitle ?? "");
    setPushTexto(acaoAtual?.pushBody ?? "");
    setUrl(acaoAtual?.webhookUrl ?? "");
    setStatusAgendamento(acaoAtual?.appointmentStatus ?? "");
    const min = Number(acaoAtual?.waitMinutes ?? 0);
    if (min > 0 && min % (60 * 24) === 0) {
      setEsperaValor(String(min / (60 * 24)));
      setEsperaUnidade("dias");
    } else if (min > 0 && min % 60 === 0) {
      setEsperaValor(String(min / 60));
      setEsperaUnidade("horas");
    } else if (min > 0) {
      setEsperaValor(String(min));
      setEsperaUnidade("minutos");
    } else {
      setEsperaValor("1");
      setEsperaUnidade("dias");
    }
  }, [open, acaoAtual]);

  // Guardrail de loop: mover etapa não pode ser ação de quem já dispara ao
  // mudar de etapa (o servidor também recusa — ver saveAutomation).
  const podeMoverEtapa = triggerEvent !== "pipeline.stage_changed";
  const podeMudarStatus = !!triggerEvent && GATILHOS_COM_AGENDAMENTO.includes(triggerEvent);
  const avisaSemContato = triggerEvent && TRIGGERS_SEM_CONTATO_GARANTIDO.includes(triggerEvent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Selecione uma ação</DialogTitle>
          <DialogDescription>O que a automação faz quando o gatilho acontece.</DialogDescription>
        </DialogHeader>

        {tipo === "escolher" && (
          <div className="space-y-1">
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
              Agenda
            </p>
            <button
              type="button"
              disabled={!podeMudarStatus}
              onClick={() => setTipo("set_appointment_status")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                <CalendarCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Mudar status do agendamento</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {podeMudarStatus
                    ? "Marca como confirmado, pendente, cancelado…"
                    : "Indisponível: este gatilho não traz um agendamento."}
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
            <button
              type="button"
              onClick={() => setTipo("add_deal_note")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-soft text-violet">
                <StickyNote className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Registrar observação</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  Escreve uma anotação no histórico do card.
                </span>
              </span>
            </button>

            <p className="px-1 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Equipe
            </p>
            <button
              type="button"
              onClick={() => setTipo("send_push")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                <Bell className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Notificar a equipe</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  Manda uma notificação para os aparelhos da clínica.
                </span>
              </span>
            </button>

            <p className="px-1 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Avançado
            </p>
            <button
              type="button"
              onClick={() => setTipo("wait")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                <Timer className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Aguardar tempo</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  Espera antes de seguir para as próximas ações.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTipo("webhook")}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                <Webhook className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Disparar webhook</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  Chama uma URL externa com os dados do evento.
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
                ref={refMensagem}
                id="acao-mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Oi {{nome}}! Seu agendamento está confirmado para {{data}} às {{hora}} na {{unidade}}."
                className="mt-1.5"
              />
              <VariaveisDisponiveis
                trigger={triggerEvent}
                campoRef={refMensagem}
                valor={mensagem}
                onInserir={setMensagem}
              />
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

        {tipo === "add_deal_note" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="acao-nota">Observação *</Label>
              <Textarea
                ref={refNota}
                id="acao-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Paciente {{nome}} entrou em contato pelo site."
                className="mt-1.5"
              />
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Aparece no histórico do card, junto das anotações escritas à mão.
              </p>
              <VariaveisDisponiveis
                trigger={triggerEvent}
                campoRef={refNota}
                valor={nota}
                onInserir={setNota}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!nota.trim()}
                onClick={() => {
                  onAdicionar({ type: "add_deal_note", noteBody: nota.trim() });
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

        {tipo === "send_push" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="acao-push-titulo">Título *</Label>
              <Input
                ref={refPushTitulo}
                id="acao-push-titulo"
                value={pushTitulo}
                onChange={(e) => setPushTitulo(e.target.value)}
                autoFocus
                placeholder="Novo paciente cadastrado"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="acao-push-texto">Texto *</Label>
              <Textarea
                ref={refPushTexto}
                id="acao-push-texto"
                value={pushTexto}
                onChange={(e) => setPushTexto(e.target.value)}
                rows={2}
                placeholder="{{nome}} acabou de entrar na base."
                className="mt-1.5"
              />
              <VariaveisDisponiveis
                trigger={triggerEvent}
                campoRef={refPushTexto}
                valor={pushTexto}
                onInserir={setPushTexto}
              />
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-2xs leading-4 text-info">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              A notificação vai para todos os aparelhos da clínica — não dá para endereçar uma
              pessoa só. Quem não quiser receber desliga em Configurações › Notificações.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!pushTitulo.trim() || !pushTexto.trim()}
                onClick={() => {
                  onAdicionar({
                    type: "send_push",
                    pushTitle: pushTitulo.trim(),
                    pushBody: pushTexto.trim(),
                  });
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

        {tipo === "set_appointment_status" && (
          <div className="space-y-4">
            <div>
              <Label>Marcar o agendamento como *</Label>
              <Select value={statusAgendamento} onValueChange={setStatusAgendamento}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha o status" />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_STATUSES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Vale para o agendamento do evento. A mudança não dispara outras automações —
                senão um fluxo que ouve mudança de status e muda o status se alimentaria sozinho.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!statusAgendamento}
                onClick={() => {
                  onAdicionar({
                    type: "set_appointment_status",
                    appointmentStatus: statusAgendamento,
                  });
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

        {tipo === "webhook" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="acao-url">URL *</Label>
              <Input
                id="acao-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                inputMode="url"
                placeholder="https://hook.make.com/..."
                className="mt-1.5"
              />
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Recebe um POST com o evento, a automação e os dados do contato. Precisa ser
                https:// e um endereço público.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!/^https:\/\//i.test(url.trim())}
                onClick={() => {
                  onAdicionar({ type: "webhook", webhookUrl: url.trim() });
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

        {tipo === "wait" && (
          <div className="space-y-4">
            <div>
              <Label>Esperar *</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={esperaValor}
                  onChange={(e) => setEsperaValor(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoFocus
                  className="w-24"
                />
                <Select
                  value={esperaUnidade}
                  onValueChange={(v) => setEsperaUnidade(v as typeof esperaUnidade)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutos">minutos</SelectItem>
                    <SelectItem value="horas">horas</SelectItem>
                    <SelectItem value="dias">dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                De 1 minuto a 30 dias. As ações seguintes só rodam depois da espera — então
                adicione ao menos uma ação abaixo desta.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-primary text-white"
                disabled={!(Number(esperaValor) >= 1)}
                onClick={() => {
                  const fator =
                    esperaUnidade === "dias" ? 60 * 24 : esperaUnidade === "horas" ? 60 : 1;
                  const minutos = Math.min(Number(esperaValor) * fator, 60 * 24 * 30);
                  onAdicionar({ type: "wait", waitMinutes: minutos });
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

/** Janela em que a automação pode agir. Fora dela, ou adia para a próxima
 *  abertura (padrão — "não mande de madrugada" ≠ "não mande") ou não roda. */
export function EditarJanelaDialog({
  open,
  onOpenChange,
  janela,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  janela: AutomationScheduleWindow;
  onSalvar: (janela: AutomationScheduleWindow) => void;
}) {
  const [ativa, setAtiva] = useState(false);
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("18:00");
  const [foraDaJanela, setForaDaJanela] = useState<"defer" | "skip">("defer");

  useEffect(() => {
    if (!open) return;
    setAtiva(Boolean(janela?.enabled));
    setDias(janela?.days?.length ? janela.days : [1, 2, 3, 4, 5]);
    setInicio(janela?.start ?? "08:00");
    setFim(janela?.end ?? "18:00");
    setForaDaJanela(janela?.outside === "skip" ? "skip" : "defer");
  }, [open, janela]);

  const minutos = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const ini = minutos(inicio);
  const f = minutos(fim);
  const horarioValido = ini !== null && f !== null && ini < f;
  const podeSalvar = !ativa || (dias.length > 0 && horarioValido);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Janela de horário</DialogTitle>
          <DialogDescription>
            Quando a automação pode agir, no horário de Brasília.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
          <span>
            <span className="block text-sm font-medium">Limitar a dias e horários</span>
            <span className="block text-2xs text-muted-foreground">
              Desligado, a automação age a qualquer hora.
            </span>
          </span>
          <Switch checked={ativa} onCheckedChange={setAtiva} />
        </label>

        {ativa && (
          <div className="space-y-4">
            <div>
              <Label>Dias *</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d) => {
                  const marcado = dias.includes(d.valor);
                  return (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() =>
                        setDias((atual) =>
                          marcado ? atual.filter((v) => v !== d.valor) : [...atual, d.valor],
                        )
                      }
                      className={
                        marcado
                          ? "rounded-xl bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-coral"
                      }
                    >
                      {d.curto}
                    </button>
                  );
                })}
              </div>
              {!dias.length && (
                <p className="mt-1.5 text-2xs text-danger">Escolha ao menos um dia.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="janela-inicio">Início *</Label>
                <Input
                  id="janela-inicio"
                  type="time"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="janela-fim">Fim *</Label>
                <Input
                  id="janela-fim"
                  type="time"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            {!horarioValido && (
              <p className="text-2xs text-danger">O fim precisa ser depois do início.</p>
            )}

            <div>
              <Label>Se acontecer fora da janela</Label>
              <Select
                value={foraDaJanela}
                onValueChange={(v) => setForaDaJanela(v as "defer" | "skip")}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="defer">Guardar para a próxima janela</SelectItem>
                  <SelectItem value="skip">Não executar</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                {foraDaJanela === "defer"
                  ? "A automação fica na fila e roda assim que a janela abrir."
                  : "O evento é ignorado e nada acontece."}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 bg-gradient-primary text-white"
            disabled={!podeSalvar}
            onClick={() => {
              onSalvar(
                ativa
                  ? { enabled: true, days: [...dias].sort((a, b) => a - b), start: inicio, end: fim, outside: foraDaJanela }
                  : {},
              );
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Escolhe que tipo de card criar. Chamado pelo "+" de uma saída — o card
 *  nasce já ligado ali, que é o que faz isso funcionar no celular. */
export function EscolherCardDialog({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscolher: (tipo: "action" | "condition" | "randomizer") => void;
}) {
  const opcoes: {
    tipo: "action" | "condition" | "randomizer";
    titulo: string;
    descricao: string;
    icone: React.ReactNode;
    cor: string;
  }[] = [
    {
      tipo: "action",
      titulo: "Ação",
      descricao: "Enviar WhatsApp, mover no funil, notificar, esperar…",
      icone: <Bot className="h-4 w-4" />,
      cor: "bg-success-soft text-success",
    },
    {
      tipo: "condition",
      titulo: "Condição",
      descricao: "Divide o fluxo em dois caminhos: sim e não.",
      icone: <Split className="h-4 w-4" />,
      cor: "bg-warning-soft text-warning",
    },
    {
      tipo: "randomizer",
      titulo: "Randomizador",
      descricao: "Sorteia entre dois caminhos, para testar mensagens.",
      icone: <Dices className="h-4 w-4" />,
      cor: "bg-info-soft text-info",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Adicionar card</DialogTitle>
          <DialogDescription>
            O card entra solto no canvas. Depois arraste do ponto de saída de um card até a entrada
            do outro para ligá-los.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {opcoes.map((o) => (
            <button
              key={o.tipo}
              type="button"
              onClick={() => {
                onEscolher(o.tipo);
                onOpenChange(false);
              }}
              className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface-subtle"
            >
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${o.cor}`}>
                {o.icone}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">{o.descricao}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Condição de um card de ramificação. Só testa o que já vem no contexto do
 *  disparo — sem consulta extra ao banco nem ao CRM. */
export function EditarCondicaoNoDialog({
  open,
  onOpenChange,
  data,
  stages,
  units,
  triggerEvent,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AutomationNodeData;
  stages: PipelineStage[];
  units: { id: string; name: string }[];
  /** Decide se "Unidade do agendamento" é oferecida: só gatilho de agenda
   *  carrega unidade, e o save recusa a combinação errada de qualquer jeito. */
  triggerEvent: AutomationEvent | null;
  onSalvar: (data: AutomationNodeData) => void;
}) {
  const [field, setField] = useState<ConditionField>("hasContact");
  const [operator, setOperator] = useState<ConditionOperator>("gt");
  const [valor, setValor] = useState("");

  useEffect(() => {
    if (!open) return;
    setField((data.field as ConditionField) ?? "hasContact");
    setOperator((data.operator as ConditionOperator) ?? "gt");
    setValor(data.value ?? "");
  }, [open, data]);

  const precisaValor = field !== "hasContact";
  const ofereceUnidade =
    units.length > 0 && !!triggerEvent && GATILHOS_COM_AGENDAMENTO.includes(triggerEvent);
  const ofereceContagem = !!triggerEvent && GATILHOS_COM_CONTAGEM.includes(triggerEvent);
  const ofereceResposta = !!triggerEvent && GATILHOS_COM_RESPOSTA.includes(triggerEvent);
  // Operadores do campo escolhido. Oferecer "contém" para número (ou "maior
  // que" para texto) só produziria condição que nunca bate.
  const operadores = OPERADORES_DO_CAMPO[field] ?? [];
  const listaStatus =
    field === "status" ? APPOINTMENT_STATUSES : field === "dealStatus" ? DEAL_STATUSES : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Condição</DialogTitle>
          <DialogDescription>
            Se der certo, o fluxo segue pelo "sim"; senão, pelo "não".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Testar</Label>
            <Select
              value={field}
              onValueChange={(v) => {
                const novo = v as ConditionField;
                setField(novo);
                setValor("");
                // Operador do campo anterior pode não existir no novo ("contém"
                // não vale para número). Sem isto o card salvaria uma combinação
                // que o save recusa e a condição nunca bateria.
                const validos = OPERADORES_DO_CAMPO[novo] ?? [];
                if (validos.length && !validos.includes(operator)) setOperator(validos[0]);
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hasContact">Tem paciente vinculado</SelectItem>
                <SelectItem value="amount">Valor do evento</SelectItem>
                <SelectItem value="status">Situação do agendamento</SelectItem>
                <SelectItem value="stageId">Etapa do funil</SelectItem>
                <SelectItem value="dealStatus">Situação da negociação</SelectItem>
                {ofereceUnidade && (
                  <SelectItem value="unitId">Unidade do agendamento</SelectItem>
                )}
                {ofereceContagem && (
                  <SelectItem value="daysUntil">Faltam quantos dias</SelectItem>
                )}
                {ofereceResposta && (
                  <SelectItem value="replyText">Resposta do paciente</SelectItem>
                )}
              </SelectContent>
            </Select>
            {field === "replyText" && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Ignora acento e maiúscula: "Não", "nao" e "NÃO" caem no mesmo ramo. "Contém"
                procura a palavra inteira — pega "sim, confirmo" e "confirmo sim", mas não
                confunde "assim" com "sim".
              </p>
            )}
            {field === "daysUntil" && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                3 = faltam três dias · 1 = é amanhã · 0 = é hoje.
              </p>
            )}
            {field === "unitId" && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                O ramo "não" recebe todas as outras unidades — inclusive as que você abrir
                depois. Use-o para a mensagem mais genérica.
              </p>
            )}
            {field === "amount" && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Cadastro de paciente e mudança de etapa não carregam valor — nesses casos a
                condição cai sempre no "não".
              </p>
            )}
          </div>

          {field === "amount" && (
            <div className="flex gap-2">
              <Select value={operator} onValueChange={(v) => setOperator(v as ConditionOperator)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gt">maior que</SelectItem>
                  <SelectItem value="lt">menor que</SelectItem>
                  <SelectItem value="eq">igual a</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="500"
                className="flex-1"
              />
            </div>
          )}

          {listaStatus && (
            <div>
              <Label>Valor</Label>
              <Select value={valor} onValueChange={setValor}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {listaStatus.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(field === "daysUntil" || field === "replyText") && (
            <div className="flex gap-2">
              <Select value={operator} onValueChange={(v) => setOperator(v as ConditionOperator)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operadores.map((op) => (
                    <SelectItem key={op} value={op}>
                      {CONDITION_OPERATOR_LABEL[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode={field === "daysUntil" ? "numeric" : "text"}
                placeholder={field === "daysUntil" ? "1" : "sim"}
                className="flex-1"
              />
            </div>
          )}

          {field === "unitId" && (
            <div>
              <Label>Unidade</Label>
              <Select value={valor} onValueChange={setValor}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {field === "stageId" && (
            <div>
              <Label>Etapa</Label>
              <Select value={valor} onValueChange={setValor}>
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
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 bg-gradient-primary text-white"
            disabled={precisaValor && !valor.trim()}
            onClick={() => {
              onSalvar({ field, operator, value: precisaValor ? valor.trim() : undefined });
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pesos do randomizador. */
export function EditarRandomizadorDialog({
  open,
  onOpenChange,
  data,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AutomationNodeData;
  onSalvar: (data: AutomationNodeData) => void;
}) {
  const [pesoA, setPesoA] = useState("50");

  useEffect(() => {
    if (!open) return;
    setPesoA(String(data.weights?.a ?? 50));
  }, [open, data]);

  const a = Math.max(0, Math.min(100, Number(pesoA) || 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Randomizador</DialogTitle>
          <DialogDescription>Divide quem passa por aqui entre dois caminhos.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="peso-a">Porcentagem no caminho A</Label>
          <Input
            id="peso-a"
            value={pesoA}
            onChange={(e) => setPesoA(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="mt-1.5"
          />
          <p className="mt-1.5 text-2xs text-muted-foreground">
            {a}% seguem pelo A, {100 - a}% pelo B. Se um dos caminhos não estiver ligado, quem
            cair nele simplesmente para.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 bg-gradient-primary text-white"
            onClick={() => {
              onSalvar({ weights: { a, b: 100 - a } });
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
