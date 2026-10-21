import type { AppointmentNotification } from "./types";

/**
 * Os WhatsApp que esta consulta recebeu — e só eles.
 *
 * ── O que havia antes ─────────────────────────────────────────────────────
 *
 * Três linhas fixas (Confirmação, 1 dia antes, No dia), cada uma com uma
 * bolinha por canal: e-mail, SMS e WhatsApp. Eram os canais do caminho antigo,
 * o Brevo — e o Brevo não entregou nada: em outubro, 100% "sem contato" ou
 * "falhou". Os avisos que chegam ao paciente saem pelas automações, que não
 * escreviam aqui. A tela dizia "Ainda não enviado" três vezes para quem tinha
 * recebido os três.
 *
 * A clínica pediu em 21/10 "apenas os de WhatsApp que enviamos". Então a lista
 * é do que ACONTECEU: um aviso por linha, na ordem em que saiu, com a hora. O
 * que falhou também aparece — é exatamente o que alguém precisa ver para
 * avisar o paciente à mão. O que nunca foi tentado não aparece: uma linha
 * "não enviado" para um aviso que nem era para ter saído ainda é ruído.
 */

const ROTULOS: Record<string, string> = {
  "wa:confirmacao": "Confirmação do agendamento",
  "wa:lembrete_d3": "Lembrete 3 dias antes",
  "wa:lembrete_d2": "Lembrete 2 dias antes",
  "wa:lembrete_d1": "Lembrete 1 dia antes",
  "wa:lembrete_d0": "Lembrete no dia",
  "wa:whatsapp.reply_received": "Resposta à confirmação",
  "wa:appointment.status_changed": "Mudança de status",
  // As do caminho antigo, se um dia uma delas tiver saído.
  confirmation: "Confirmação do agendamento",
  reminder_day_before: "Lembrete 1 dia antes",
  reminder_day_of: "Lembrete no dia",
};

function rotulo(kind: string): string {
  const exato = ROTULOS[kind];
  if (exato) return exato;
  const dias = /^wa:lembrete_d(\d+)$/.exec(kind);
  if (dias) return `Lembrete ${dias[1]} dias antes`;
  return "Mensagem automática";
}

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "21/10 · 09:00" — sem ano: o aviso é sempre da consulta que está aberta. */
function hora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return quando.format(d).replace(", ", " · ");
}

function avisosDeWhatsapp(
  notifications: AppointmentNotification[] | undefined,
): AppointmentNotification[] {
  return (notifications ?? [])
    .filter((n) => n.channel === "whatsapp" && (n.status === "sent" || n.status === "failed"))
    .sort((a, b) =>
      String(a.sentAt ?? a.criadoEm ?? "").localeCompare(String(b.sentAt ?? b.criadoEm ?? "")),
    );
}

export function AvisosDeWhatsapp({
  notifications,
}: {
  notifications: AppointmentNotification[] | undefined;
}) {
  const avisos = avisosDeWhatsapp(notifications);

  if (!avisos.length) {
    return <p className="py-2 text-xs text-muted-foreground">Nenhum WhatsApp enviado ainda.</p>;
  }

  return (
    <ul className="divide-y divide-surface-muted">
      {avisos.map((a) => {
        const falhou = a.status === "failed";
        return (
          <li key={`${a.kind}`} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate text-sm text-foreground-secondary">
              {rotulo(a.kind)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground">
              {falhou ? "não saiu" : hora(a.sentAt)}
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: falhou ? "var(--danger)" : "var(--success)" }}
                aria-label={falhou ? "falhou" : "enviado"}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
