import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  saveMetaCapiTrigger,
  SYSTEM_EVENTS,
  type MetaCapiTrigger,
  type SystemEvent,
  type ValueSource,
} from "@/lib/integrations/meta-capi.functions";

// Eventos padrão da Meta que fazem sentido para uma clínica. "Personalizado"
// libera o campo livre para eventos próprios já criados no Gerenciador.
const META_EVENTS = [
  "Purchase",
  "Lead",
  "Schedule",
  "Contact",
  "CompleteRegistration",
  "InitiateCheckout",
  "SubmitApplication",
];

const SYSTEM_EVENT_LABEL: Record<SystemEvent, string> = {
  "deal.status_changed": "Negociação é marcada como ganha ou perdida",
  "pipeline.stage_changed": "Card entra numa etapa do funil",
  "appointment.created": "Agendamento é criado",
  "appointment.status_changed": "Agendamento muda de situação",
  "receivable.paid": "Recebimento é marcado como recebido",
  "patient.created": "Paciente é cadastrado",
};

const DEAL_STATUSES = [
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
  { value: "negotiating", label: "Em negociação" },
];

const APPOINTMENT_STATUSES = [
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "completed", label: "Concluído" },
  { value: "missed", label: "Faltou" },
  { value: "cancelled", label: "Cancelado" },
];

const CUSTOM = "__custom__";

interface Props {
  open: boolean;
  trigger: MetaCapiTrigger | null;
  stages: PipelineStage[];
  /** Todos os gatilhos já criados — usados só para avisar de redundância. */
  existing: MetaCapiTrigger[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function MetaTriggerSheet({
  open,
  trigger,
  stages,
  existing,
  onOpenChange,
  onSaved,
}: Props) {
  const save = useServerFn(saveMetaCapiTrigger);

  const [name, setName] = useState("");
  const [systemEvent, setSystemEvent] = useState<SystemEvent>("deal.status_changed");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("");
  const [dealStatus, setDealStatus] = useState("");
  const [metaEventName, setMetaEventName] = useState("Purchase");
  const [customEvent, setCustomEvent] = useState("");
  const [valueSource, setValueSource] = useState<ValueSource>("none");
  const [fixedValue, setFixedValue] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (trigger) {
      setName(trigger.name);
      setSystemEvent(trigger.systemEvent);
      setStageId(trigger.conditions.stageId ?? "");
      setStatus(trigger.conditions.status ?? "");
      setDealStatus(trigger.conditions.dealStatus ?? "");
      const known = META_EVENTS.includes(trigger.metaEventName);
      setMetaEventName(known ? trigger.metaEventName : CUSTOM);
      setCustomEvent(known ? "" : trigger.metaEventName);
      setValueSource(trigger.valueSource);
      setFixedValue(trigger.fixedValue ? String(trigger.fixedValue) : "");
      setActive(trigger.active);
      return;
    }
    setName("");
    setSystemEvent("deal.status_changed");
    setStageId("");
    setStatus("");
    setDealStatus("");
    setMetaEventName("Purchase");
    setCustomEvent("");
    setValueSource("none");
    setFixedValue("");
    setActive(true);
  }, [open, trigger]);

  // Dois gatilhos ativos mandando o mesmo evento no mesmo acontecimento
  // descrevem a mesma conversão. O event_id agora é (evento + registro), então
  // a Meta deduplica — mas o mais provável é que seja engano, e vale avisar.
  const resolvedEventName = metaEventName === CUSTOM ? customEvent.trim() : metaEventName;
  const duplicate = existing.find(
    (item) =>
      item.id !== trigger?.id &&
      item.active &&
      item.systemEvent === systemEvent &&
      item.metaEventName === resolvedEventName,
  );

  const mutation = useMutation({
    mutationFn: () => {
      const conditions: MetaCapiTrigger["conditions"] = {};
      if (systemEvent === "pipeline.stage_changed" && stageId) conditions.stageId = stageId;
      if (systemEvent === "appointment.status_changed" && status) conditions.status = status;
      if (systemEvent === "deal.status_changed" && dealStatus) conditions.dealStatus = dealStatus;
      return save({
        data: {
          id: trigger?.id,
          name,
          systemEvent,
          conditions,
          metaEventName: metaEventName === CUSTOM ? customEvent : metaEventName,
          valueSource,
          fixedValue: valueSource === "fixed" ? Number(fixedValue.replace(",", ".")) : null,
          currency: "BRL",
          active,
        },
      });
    },
    onSuccess: () => {
      toast.success(trigger ? "Gatilho atualizado" : "Gatilho criado");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[540px]">
        <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/60 to-coral-soft/40 px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle>{trigger ? "Editar gatilho" : "Adicionar gatilho"}</SheetTitle>
              <SheetDescription>
                Um acontecimento do sistema vira um evento na Meta.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="space-y-6 px-6 py-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="trigger-name">Nome do gatilho *</Label>
            <Input
              id="trigger-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="Lead ganho vira Purchase"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Quando *</Label>
            <Select
              value={systemEvent}
              onValueChange={(value) => setSystemEvent(value as SystemEvent)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_EVENTS.map((event) => (
                  <SelectItem key={event} value={event}>
                    {SYSTEM_EVENT_LABEL[event]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {systemEvent === "deal.status_changed" && (
            <div>
              <Label>Situação da negociação</Label>
              <Select value={dealStatus} onValueChange={setDealStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Qualquer situação" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STATUSES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Dispara quando a negociação é marcada no painel do card, no funil. O valor da
                negociação vai junto como valor da conversão.
              </p>
            </div>
          )}

          {systemEvent === "pipeline.stage_changed" && (
            <div>
              <Label>Etapa</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Qualquer etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                {stages.length
                  ? "Prefira \u201cNegociação é marcada como ganha ou perdida\u201d: não depende de lembrar qual etapa significa ganho, e leva o valor da negociação junto."
                  : "Nenhuma etapa encontrada. Configure o funil em Atendimentos › Pipeline."}
              </p>
            </div>
          )}

          {systemEvent === "appointment.status_changed" && (
            <div>
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Qualquer situação" />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_STATUSES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Enviar evento *</Label>
            <Select value={metaEventName} onValueChange={setMetaEventName}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {META_EVENTS.map((event) => (
                  <SelectItem key={event} value={event}>
                    {event}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {metaEventName === CUSTOM && (
              <Input
                value={customEvent}
                onChange={(event) => setCustomEvent(event.target.value)}
                placeholder="NomeDoSeuEvento"
                className="mt-2"
              />
            )}
            {duplicate && (
              <p className="mt-2 flex items-start gap-2 rounded-2xl bg-coral-soft px-3 py-2 text-2xs text-foreground/80">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral" />
                <span>
                  O gatilho “{duplicate.name}” já manda {resolvedEventName} neste mesmo
                  acontecimento. A Meta trata os dois como a mesma conversão e não conta duas
                  vezes — mas confira se é isso mesmo que você quer.
                </span>
              </p>
            )}
          </div>

          <div>
            <Label>Valor</Label>
            <Select
              value={valueSource}
              onValueChange={(value) => setValueSource(value as ValueSource)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem valor</SelectItem>
                <SelectItem value="event">Valor do próprio evento</SelectItem>
                <SelectItem value="fixed">Valor fixo</SelectItem>
              </SelectContent>
            </Select>
            {valueSource === "event" && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Usa o valor do lançamento ou o valor previsto do agendamento. Mudança de etapa e
                cadastro de paciente não carregam valor — nesses casos o evento vai sem.
              </p>
            )}
            {valueSource === "fixed" && (
              <Input
                value={fixedValue}
                onChange={(event) => setFixedValue(event.target.value)}
                inputMode="decimal"
                placeholder="450,00"
                className="mt-2"
              />
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Gatilho ativo</span>
              <span className="block text-2xs text-muted-foreground">
                Pausado, ele fica salvo mas não dispara.
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              className="flex-1 bg-gradient-primary text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Salvando..." : "Salvar gatilho"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
