import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  cancelScheduledMessage,
  getScheduledMessages,
  scheduleWhatsappMessage,
} from "@/lib/atendimentos/atendimentos.functions";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  executing: "Enviando…",
  completed: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

// datetime-local devolve "2026-08-12T14:00" sem fuso. Mandar assim faria o
// CRM interpretar no fuso dele, não no de quem agendou — então anexamos o
// offset local (ex.: "-03:00") pro horário significar o que o usuário viu.
function toOffsetIso(localValue: string): string {
  const date = new Date(localValue);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localValue}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Valor mínimo do input: agora + 1 min, no formato que datetime-local espera.
function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
  contactId,
  initialText,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactId: string | null;
  initialText: string;
  onScheduled: () => void;
}) {
  const queryClient = useQueryClient();
  const doSchedule = useServerFn(scheduleWhatsappMessage);
  const fetchScheduled = useServerFn(getScheduledMessages);
  const doCancel = useServerFn(cancelScheduledMessage);

  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState("");

  useEffect(() => {
    if (open) {
      setText(initialText);
      setWhen("");
    }
  }, [open, initialText]);

  const scheduledQuery = useQuery({
    queryKey: ["scheduled-messages", contactId],
    queryFn: () => fetchScheduled({ data: { contactId: contactId! } }),
    enabled: open && !!contactId,
    staleTime: 15_000,
  });
  const pending = (scheduledQuery.data ?? []).filter((s) => s.status === "scheduled");

  const scheduleMutation = useMutation({
    mutationFn: () =>
      doSchedule({
        data: { conversationId, contactId, text: text.trim(), scheduledFor: toOffsetIso(when) },
      }),
    onSuccess: () => {
      toast.success("Mensagem agendada.");
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages", contactId] });
      onScheduled();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (scheduledId: string) => doCancel({ data: { scheduledId } }),
    onSuccess: () => {
      toast.success("Agendamento cancelado.");
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages", contactId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSchedule = text.trim().length > 0 && when.length > 0 && !scheduleMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-coral" />
            Agendar mensagem
          </DialogTitle>
          <DialogDescription>A mensagem é enviada automaticamente no horário escolhido.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="schedule-text">Mensagem</Label>
            <Textarea
              id="schedule-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva a mensagem que será enviada"
              rows={4}
              className="mt-1.5 resize-none rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="schedule-when">Data e hora</Label>
            <Input
              id="schedule-when"
              type="datetime-local"
              value={when}
              min={minDateTimeLocal()}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1.5 h-11 rounded-xl"
            />
          </div>

          <Button
            className="w-full gap-2 bg-gradient-primary text-white"
            disabled={!canSchedule}
            onClick={() => scheduleMutation.mutate()}
          >
            {scheduleMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            Agendar
          </Button>

          {!contactId && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
              Esta conversa não tem contato vinculado no CRM, então não é possível listar agendamentos
              anteriores dela.
            </p>
          )}

          {pending.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Já agendadas
              </p>
              <ul className="mt-2 space-y-2">
                {pending.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded-2xl border border-border bg-white p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-foreground">{formatWhen(s.scheduledFor)}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{s.content}</span>
                      <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-3xs text-muted-foreground">
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(s.id)}
                      disabled={cancelMutation.isPending}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft"
                      aria-label="Cancelar agendamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
