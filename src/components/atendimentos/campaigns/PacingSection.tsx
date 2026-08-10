import { Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MESSAGE_INTERVAL_OPTIONS,
  PAUSE_AFTER_OPTIONS,
  RESUME_AFTER_MINUTES_OPTIONS,
  type MessageInterval,
} from "@/lib/atendimentos/campaigns.functions";

export function PacingSection({
  interval,
  pauseAfterCount,
  resumeAfterMinutes,
  onIntervalChange,
  onPauseAfterChange,
  onResumeAfterChange,
}: {
  interval: MessageInterval;
  pauseAfterCount: number | null;
  resumeAfterMinutes: number | null;
  onIntervalChange: (value: MessageInterval) => void;
  onPauseAfterChange: (value: number | null) => void;
  onResumeAfterChange: (value: number | null) => void;
}) {
  return (
    <section className="space-y-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Intervalos
      </p>

      <div>
        <label className="text-sm font-medium">Intervalo de segundos por mensagem enviada</label>
        <Select value={interval} onValueChange={(v) => onIntervalChange(v as MessageInterval)}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESSAGE_INTERVAL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Pausar envio a cada</label>
          <Select
            value={pauseAfterCount ? String(pauseAfterCount) : "none"}
            onValueChange={(v) => onPauseAfterChange(v === "none" ? null : Number(v))}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não pausar</SelectItem>
              {PAUSE_AFTER_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} mensagens enviadas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Voltar a enviar com</label>
          <Select
            value={resumeAfterMinutes ? String(resumeAfterMinutes) : "none"}
            onValueChange={(v) => onResumeAfterChange(v === "none" ? null : Number(v))}
            disabled={!pauseAfterCount}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {RESUME_AFTER_MINUTES_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} minuto{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-2xs text-muted-foreground">
        Pausar/retomar ainda não foi confirmado com o CRM — pode não ter efeito até validarmos com um disparo real.
      </p>
    </section>
  );
}
