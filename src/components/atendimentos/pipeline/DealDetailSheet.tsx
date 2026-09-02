import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  Check,
  MessageCircle,
  Phone,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppointmentDrawer } from "@/components/agenda/AppointmentDrawer";
import { ConfirmarGanho, type DadosGanho } from "./ConfirmarGanho";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { useAgendaCatalog } from "@/lib/agenda/useAppointmentForm";
import { useSaveAppointment } from "@/lib/agenda/useSaveAppointment";
import { sendWhatsappMessage } from "@/lib/atendimentos/atendimentos.functions";
import { getPatientByCrmContact } from "@/lib/patients/patients.functions";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { haptic } from "@/lib/haptics";
import type { PipelineItem, PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import {
  addDealNote,
  confirmarGanho,
  getDealTimeline,
  logDealAppointment,
  saveDealStatus,
  saveDealValue,
  DEAL_STATUS_LABEL,
  LOSS_REASONS,
  MOTIVO_OUTRO,
  motivoNormalizado,
  type Deal,
  type DealEvent,
  type DealStatus,
} from "@/lib/atendimentos/deals.functions";

interface Props {
  item: PipelineItem | null;
  stage: PipelineStage | null;
  stages: PipelineStage[];
  deal: Deal | null;
  /** Conversa vinculada, quando existe — habilita chat e nota interna. */
  conversationId: string | null;
  contactId: string | null;
  phone: string | null;
  onOpenChange: (open: boolean) => void;
  onMove: (toStageId: string, notes?: string) => void;
  onChanged: () => void;
}

export function DealDetailSheet({
  item,
  stage,
  stages,
  deal,
  conversationId,
  contactId,
  phone,
  onOpenChange,
  onMove,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const fetchTimeline = useServerFn(getDealTimeline);
  const fetchPatient = useServerFn(getPatientByCrmContact);
  const doSaveStatus = useServerFn(saveDealStatus);
  const doConfirmarGanho = useServerFn(confirmarGanho);
  const { selectedUnitId, units, isAdmin } = useUnitSelection();
  const doSaveValue = useServerFn(saveDealValue);
  const doAddNote = useServerFn(addDealNote);
  const doLogAppointment = useServerFn(logDealAppointment);
  const doSendNote = useServerFn(sendWhatsappMessage);

  const open = Boolean(item);
  const itemId = item?.id ?? "";

  const timeline = useQuery({
    queryKey: ["deal-timeline", itemId],
    queryFn: () => fetchTimeline({ data: { itemId } }),
    enabled: open,
    staleTime: 5_000,
  });

  const patient = useQuery({
    queryKey: ["patient-by-crm-contact", contactId],
    queryFn: () => fetchPatient({ data: { crmContactId: contactId! } }),
    enabled: open && Boolean(contactId),
    staleTime: 60_000,
  });

  const [value, setValue] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [askingLoss, setAskingLoss] = useState(false);
  const [note, setNote] = useState("");
  const [mirrorNote, setMirrorNote] = useState(true);
  const [moveNote, setMoveNote] = useState("");
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  const agendaCatalog = useAgendaCatalog();
  const saveAppointment = useSaveAppointment({
    onSaved: () => {
      setAppointmentOpen(false);
      if (itemId) {
        doLogAppointment({ data: { itemId, body: "Agendamento criado a partir do funil." } })
          .then(() => refreshTimeline())
          .catch(() => undefined);
      }
    },
  });

  useEffect(() => {
    if (!open) return;
    setValue(deal?.value ? String(deal.value) : "");
    setLossReason(deal?.lossReason ?? "");
    setAskingLoss(false);
    setNote("");
    setMoveNote("");
    setMirrorNote(Boolean(conversationId));
  }, [open, deal, conversationId]);

  const refreshTimeline = () =>
    queryClient.invalidateQueries({ queryKey: ["deal-timeline", itemId] });

  const statusMutation = useMutation({
    mutationFn: (vars: { status: DealStatus; reason?: string }) =>
      doSaveStatus({
        data: {
          itemId,
          status: vars.status,
          lossReason: vars.reason,
          contactName: item?.title ?? undefined,
          crmContactId: contactId,
        },
      }),
    onSuccess: (_result, vars) => {
      // Acompanha o toast, não substitui: no iPhone não vibra nada.
      haptic(vars.status === "lost" ? "warn" : "commit");
      toast.success(`Marcado como ${DEAL_STATUS_LABEL[vars.status]}`);
      setAskingLoss(false);
      refreshTimeline();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // "Ganho" não grava mais direto: abre a confirmação, que pede valor e data.
  // Era o clique que mandava conversão sem telefone, sem valor e sem dia.
  const [confirmandoGanho, setConfirmandoGanho] = useState(false);

  const ganhoMutation = useMutation({
    mutationFn: (dados: DadosGanho) =>
      doConfirmarGanho({
        data: {
          itemId,
          contactName: item?.title ?? "",
          crmContactId: contactId,
          phone: dados.phone,
          patientId: patient.data?.id ?? null,
          valor: dados.valor,
          realizadoEm: dados.realizadoEm,
          gerarCobranca: dados.gerarCobranca,
          pagamentoRecebido: dados.pagamentoRecebido,
          unitId: dados.unitId ?? selectedUnitId ?? undefined,
        },
      }),
    onSuccess: (r) => {
      haptic("commit");
      setConfirmandoGanho(false);
      if (r.jaConsolidado) {
        // Não é erro nem sucesso silencioso: o ganho ficou registrado, mas o
        // atendimento já existia e a conversão não saiu de novo.
        toast.warning(
          "Ganho registrado. Esta pessoa já tinha atendimento realizado nesta data, então a conversão não foi enviada outra vez.",
          { duration: 8000 },
        );
      } else {
        toast.success("Atendimento realizado registrado e conversão enviada.");
      }
      refreshTimeline();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valueMutation = useMutation({
    mutationFn: (amount: number | null) => doSaveValue({ data: { itemId, value: amount } }),
    onSuccess: () => {
      toast.success("Valor salvo");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      await doAddNote({ data: { itemId, body: note } });
      // Best-effort: a observação local é a fonte da verdade. Espelhar na
      // conversa é conveniência (a equipe vive no chat), então uma falha do
      // CRM avisa mas não perde o que foi escrito.
      if (mirrorNote && conversationId) {
        try {
          await doSendNote({ data: { conversationId, text: note, isPrivate: true } });
        } catch {
          toast.warning("Observação salva, mas não foi possível espelhar na conversa.");
        }
      }
    },
    onSuccess: () => {
      setNote("");
      refreshTimeline();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = deal?.status ?? "negotiating";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/60 to-coral-soft/40 px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-sm font-bold text-coral">
                {initials(item?.title ?? "?")}
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate">{item?.title ?? "Sem nome"}</SheetTitle>
                <SheetDescription className="truncate">
                  {stage?.name ?? "Sem etapa"}
                  {phone ? ` · ${phone}` : ""}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6 px-6 py-6">
            {/* Ações rápidas */}
            <div className="grid grid-cols-3 gap-2">
              {conversationId ? (
                <Link
                  to="/atendimentos/chat"
                  search={{ conversationId }}
                  onClick={() => onOpenChange(false)}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white p-3 text-center text-2xs font-medium transition-colors hover:bg-muted/50"
                >
                  <MessageCircle className="h-4 w-4 text-pink" />
                  Abrir conversa
                </Link>
              ) : (
                <span className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white/50 p-3 text-center text-2xs font-medium text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  Sem conversa
                </span>
              )}
              <button
                type="button"
                onClick={() => setAppointmentOpen(true)}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white p-3 text-center text-2xs font-medium transition-colors hover:bg-muted/50"
              >
                <CalendarPlus className="h-4 w-4 text-pink" />
                Agendar
              </button>
              {phone ? (
                <a
                  href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white p-3 text-center text-2xs font-medium transition-colors hover:bg-muted/50"
                >
                  <Phone className="h-4 w-4 text-pink" />
                  WhatsApp
                </a>
              ) : (
                <span className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white/50 p-3 text-center text-2xs font-medium text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  Sem telefone
                </span>
              )}
            </div>

            {patient.data && (
              <Link
                to="/pacientes/$patientId"
                params={{ patientId: patient.data.id }}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <UserRound className="h-4 w-4 text-pink" />
                <span className="min-w-0 flex-1 truncate">
                  Paciente cadastrado: <strong>{patient.data.name}</strong>
                </span>
              </Link>
            )}

            {/* Status da negociação */}
            <section>
              <Label>Situação da negociação</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <StatusButton
                  active={status === "negotiating"}
                  tone="neutral"
                  onClick={() => statusMutation.mutate({ status: "negotiating" })}
                >
                  Em negociação
                </StatusButton>
                <StatusButton
                  active={status === "won"}
                  tone="win"
                  icon={<Check className="h-3.5 w-3.5" />}
                  onClick={() => setConfirmandoGanho(true)}
                >
                  Ganho
                </StatusButton>
                <StatusButton
                  active={status === "lost"}
                  tone="loss"
                  icon={<X className="h-3.5 w-3.5" />}
                  onClick={() => setAskingLoss(true)}
                >
                  Perdido
                </StatusButton>
              </div>

              {/* Sem motivo, "perdido" não ensina nada depois — por isso o
                  campo é exigido antes de gravar. */}
              {askingLoss && (
                <div className="mt-3 space-y-2 rounded-2xl border border-border p-3">
                  <Label className="text-xs">Motivo da perda</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {LOSS_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setLossReason(reason)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-2xs transition-colors",
                          reason === motivoNormalizado(lossReason)
                            ? "border-transparent bg-foreground text-white"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  {/* Campo livre só em "Outro". Antes ele ficava sempre
                      visível e sobrescrevia o chip escolhido — o que gravava
                      era texto livre, e texto livre não filtra nem classifica.
                      É por isso que o funil de recuperação não conseguia
                      separar quem pode ser abordado de quem pediu para não
                      ser. */}
                  {lossReason === MOTIVO_OUTRO || !LOSS_REASONS.includes(lossReason) ? (
                    <Textarea
                      value={lossReason === MOTIVO_OUTRO ? "" : lossReason}
                      onChange={(event) => setLossReason(event.target.value || MOTIVO_OUTRO)}
                      placeholder="Qual foi o motivo?"
                      className="min-h-16"
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-gradient-primary text-white"
                      disabled={!lossReason.trim() || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ status: "lost", reason: lossReason })}
                    >
                      Marcar como perdido
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAskingLoss(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {status === "lost" && deal?.lossReason && !askingLoss && (
                <p className="mt-2 text-2xs text-muted-foreground">
                  Motivo: {deal.lossReason}
                </p>
              )}
              {/* Ganho é afirmação; a data e o valor são a prova. Sem isto o
                  painel diria "Ganho" sem dizer de quando. */}
              {status === "won" && deal?.realizedOn && (
                <p className="mt-2 text-2xs text-muted-foreground">
                  Atendimento realizado em {deal.realizedOn.split("-").reverse().join("/")}
                  {deal.value !== null ? ` · ${formatBRL(deal.value)}` : ""}
                </p>
              )}
            </section>

            {/* Valor */}
            <section>
              <Label htmlFor="deal-value">Valor da negociação</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="deal-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="bg-white"
                />
                <Button
                  variant="outline"
                  disabled={valueMutation.isPending}
                  onClick={() => {
                    const parsed = Number(value.replace(/\./g, "").replace(",", "."));
                    valueMutation.mutate(value.trim() && Number.isFinite(parsed) ? parsed : null);
                  }}
                >
                  Salvar
                </Button>
              </div>
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Soma no total da etapa e vai como valor da conversão na Meta.
              </p>
            </section>

            {/* Mover de etapa com observação */}
            <section>
              <Label>Mover para outra etapa</Label>
              <Textarea
                value={moveNote}
                onChange={(event) => setMoveNote(event.target.value)}
                placeholder="Observação da mudança (opcional)"
                className="mt-1.5 min-h-16"
              />
              <Select
                value=""
                onValueChange={(stageId) => {
                  onMove(stageId, moveNote.trim() || undefined);
                  setMoveNote("");
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Escolher etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages
                    .filter((s) => s.id !== stage?.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </section>

            {/* Observações + histórico */}
            <section>
              <Label htmlFor="deal-note">Observações</Label>
              <Textarea
                id="deal-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="O que aconteceu nessa negociação?"
                className="mt-1.5 min-h-20"
              />
              {conversationId && (
                <label className="mt-2 flex items-center gap-2 text-2xs text-muted-foreground">
                  <Checkbox
                    checked={mirrorNote}
                    onCheckedChange={(checked) => setMirrorNote(checked === true)}
                  />
                  Também registrar como nota interna na conversa
                </label>
              )}
              <Button
                className="mt-2 gap-2 bg-gradient-primary text-white"
                size="sm"
                disabled={!note.trim() || noteMutation.isPending}
                onClick={() => noteMutation.mutate()}
              >
                <StickyNote className="h-4 w-4" />
                Registrar
              </Button>

              <ul className="mt-4 space-y-2">
                {(timeline.data ?? []).map((event) => (
                  <TimelineRow key={event.id} event={event} stages={stages} />
                ))}
                {!timeline.isLoading && !(timeline.data ?? []).length && (
                  <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                    Nada registrado ainda.
                  </li>
                )}
              </ul>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mesmo formulário e mesma gravação da Agenda — o drawer já é montado
          fora da Agenda pelo chat, então isso é uso previsto. */}
      {item && (
        <AppointmentDrawer
          open={appointmentOpen}
          catalog={agendaCatalog}
          origin={`Agendamento a partir do funil de atendimento (${item.title ?? "contato"}).`}
          defaultPatient={
            patient.data
              ? { id: patient.data.id, name: patient.data.name }
              : item.title
                ? { id: "", name: item.title }
                : null
          }
          contact={
            // Só quando o contato ainda não virou paciente: com paciente
            // vinculado o nome já é o certo e o telefone já está no cadastro.
            patient.data ? null : { name: item.title, phone, crmContactId: contactId }
          }
          isSaving={saveAppointment.isPending}
          onClose={() => setAppointmentOpen(false)}
          onSave={(data) => saveAppointment.mutate({ data, contact: { phone, crmContactId: contactId } })}
        />
      )}

      <ConfirmarGanho
        open={confirmandoGanho}
        contactName={item?.title ?? "Contato"}
        phone={phone}
        valorSugerido={deal?.value ?? null}
        isPending={ganhoMutation.isPending}
        units={units}
        isAdmin={isAdmin}
        unitIdInicial={selectedUnitId}
        onOpenChange={(o) => !o && setConfirmandoGanho(false)}
        onConfirm={(dados) => ganhoMutation.mutate(dados)}
      />
    </>
  );
}

function StatusButton({
  active,
  tone,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  tone: "neutral" | "win" | "loss";
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-2xs font-semibold transition-colors",
        !active && "border-border bg-white text-muted-foreground hover:bg-muted/50",
        active && tone === "neutral" && "border-transparent bg-foreground text-white",
        active && tone === "win" && "border-transparent bg-success text-white",
        active && tone === "loss" && "border-transparent bg-danger text-white",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TimelineRow({ event, stages }: { event: DealEvent; stages: PipelineStage[] }) {
  const label = () => {
    if (event.kind === "status") {
      const status = (event.meta?.status as DealStatus) ?? "negotiating";
      return `Situação: ${DEAL_STATUS_LABEL[status] ?? status}`;
    }
    if (event.kind === "stage") {
      const stageId = event.meta?.stageId as string | undefined;
      const name = stages.find((s) => s.id === stageId)?.name;
      return name ? `Movido para ${name}` : "Mudou de etapa";
    }
    if (event.kind === "appointment") return "Agendamento";
    return "Observação";
  };

  return (
    <li className="rounded-2xl border border-border bg-white px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-semibold">{label()}</span>
        <span className="shrink-0 text-3xs text-muted-foreground">
          {new Date(event.createdAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {event.body && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{event.body}</p>}
    </li>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
