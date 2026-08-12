import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { durationBetween, endTimeFrom } from "@/lib/date";
import type { BlockedTime, Professional, Room } from "./types";

/**
 * Compromisso da equipe: reunião, almoço, treinamento — o que ocupa a agenda
 * sem ser atendimento de paciente.
 *
 * Continua gravando em `blocked_times`, a mesma tabela do antigo "Bloquear
 * Horário". O que mudou é o que dá para fazer com ele: antes o motivo saía de
 * uma lista fechada de seis opções, o bloco no calendário não era clicável, e
 * não existiam `updateBlockedTime` nem `deleteBlockedTime` — ou seja, criar um
 * bloqueio era definitivo. Um compromisso que não dá para remarcar nem cancelar
 * não serve, e compromisso é justamente o que mais muda de horário.
 */
interface Props {
  open: boolean;
  /** Preenchido = edição; vazio = novo. */
  commitment?: BlockedTime | null;
  defaultDate?: string;
  professionals: Professional[];
  rooms: Room[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (data: Partial<BlockedTime>) => void;
  onDelete?: (id: string) => void;
  /** Trocar para o formulário de consulta, quando o seletor faz sentido. */
  onTrocarParaConsulta?: () => void;
}

const MOTIVOS = ["Almoço", "Treinamento", "Reunião", "Manutenção", "Particular"];
const OUTRO = "Outro";
const DURACOES = [15, 30, 45, 60, 90, 120, 180, 240];

export function CommitmentDrawer({
  open,
  commitment,
  defaultDate,
  professionals,
  rooms,
  isSaving,
  onClose,
  onSave,
  onDelete,
  onTrocarParaConsulta,
}: Props) {
  const isEdit = Boolean(commitment?.id);

  const inicial = (): Partial<BlockedTime> => ({
    id: commitment?.id,
    professionalId: commitment?.professionalId ?? "",
    roomId: commitment?.roomId ?? "",
    date: commitment?.date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    startTime: commitment?.startTime ?? "12:00",
    endTime: commitment?.endTime ?? "13:00",
    reason: commitment?.reason ?? "Almoço",
  });

  const [form, setForm] = useState<Partial<BlockedTime>>(inicial);
  // Motivo fora da lista significa que alguém escreveu o próprio — o campo
  // livre precisa nascer aberto ao reabrir esse compromisso.
  const [motivoLivre, setMotivoLivre] = useState(
    Boolean(commitment?.reason && !MOTIVOS.includes(commitment.reason)),
  );

  useEffect(() => {
    if (!open) return;
    setForm(inicial());
    setMotivoLivre(Boolean(commitment?.reason && !MOTIVOS.includes(commitment.reason)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, commitment?.id]);

  const duracao = durationBetween(form.startTime ?? "12:00", form.endTime ?? "13:00");
  const opcoesDuracao = DURACOES.includes(duracao)
    ? DURACOES
    : [...DURACOES, duracao].sort((a, b) => a - b);

  const handleSave = () => {
    if (!form.professionalId) {
      toast.error("Selecione o profissional");
      return;
    }
    if (!form.reason?.trim()) {
      toast.error("Informe o motivo do compromisso");
      return;
    }
    onSave(form);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="w-full max-w-[420px] bg-white flex flex-col overflow-hidden"
        style={{ boxShadow: "var(--shadow-3)" }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-muted">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Compromisso" : "Novo Compromisso"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-xl text-muted-foreground hover:bg-surface transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Seletor Consulta/Compromisso, só ao criar: trocar o tipo de um
              compromisso já salvo significaria migrar de tabela. */}
          {!isEdit && onTrocarParaConsulta && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-full"
                onClick={onTrocarParaConsulta}
              >
                Consulta
              </Button>
              <Button type="button" variant="premium" className="h-10 flex-1 rounded-full">
                Compromisso
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm text-foreground-secondary">Motivo *</Label>
            <select
              className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
              value={motivoLivre ? OUTRO : form.reason}
              onChange={(e) => {
                if (e.target.value === OUTRO) {
                  setMotivoLivre(true);
                  setForm((f) => ({ ...f, reason: "" }));
                } else {
                  setMotivoLivre(false);
                  setForm((f) => ({ ...f, reason: e.target.value }));
                }
              }}
            >
              {MOTIVOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OUTRO}>Outro…</option>
            </select>
            {motivoLivre && (
              <Input
                autoFocus
                placeholder="Descreva o compromisso"
                value={form.reason ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="rounded-xl border-surface-muted"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-foreground-secondary">Profissional *</Label>
            <select
              className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
              value={form.professionalId}
              onChange={(e) => setForm((f) => ({ ...f, professionalId: e.target.value }))}
            >
              <option value="">Selecionar...</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-foreground-secondary">Sala</Label>
            <select
              className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
              value={form.roomId}
              onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
            >
              <option value="">Todas as salas</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-foreground-secondary">Data</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-xl border-surface-muted"
            />
          </div>

          {/* `min-w-0` pelo mesmo motivo da consulta: o Safari dá largura
              mínima própria ao `input[type=time]` e, sem isto, ele transborda
              por cima do campo ao lado em telas estreitas. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-2">
              <Label className="text-sm text-foreground-secondary">Início</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    startTime: e.target.value,
                    endTime: endTimeFrom(e.target.value, duracao),
                  }))
                }
                className="w-full min-w-0 rounded-xl border-surface-muted"
              />
            </div>
            {/* Mesma troca da consulta: duração no lugar do horário de fim. */}
            <div className="min-w-0 space-y-2">
              <Label className="text-sm text-foreground-secondary">Duração (min)</Label>
              <select
                className="w-full text-sm border border-surface-muted rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
                value={duracao}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    endTime: endTimeFrom(f.startTime ?? "12:00", Number(e.target.value)),
                  }))
                }
              >
                {opcoesDuracao.map((min) => (
                  <option key={min} value={min}>
                    {min}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-surface-muted flex gap-3">
          {isEdit && onDelete && (
            <Button
              variant="outline"
              onClick={() => onDelete(commitment!.id)}
              disabled={isSaving}
              className="rounded-xl text-danger"
              aria-label="Excluir compromisso"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-xl text-white"
            style={{ background: "var(--gradient-primary)" }}
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
