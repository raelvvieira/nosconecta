import { ChevronDown } from "lucide-react";
import { STATUS_LABEL, TYPE_LABEL, statusStyle } from "./appointment-utils";
import { NOTIFICATION_KINDS, NotificationRow } from "./notification-utils";
import type { Appointment, AppointmentStatus, AppointmentType } from "./types";
import { dataPorExtenso, durationBetween } from "@/lib/date";
import { duracaoEmTexto } from "@/lib/agenda/procedimentos";
import { formatBRL } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/**
 * O agendamento para LER, não para preencher.
 *
 * ── Por que existe ─────────────────────────────────────────────────────
 *
 * O modal era só formulário: quem abria um agendamento da agenda para
 * responder "que dia é mesmo?" encontrava dezesseis campos, sete rótulos em
 * caixa alta e duas telas de rolagem. A pergunta de um segundo custava vinte.
 *
 * Aqui a mesma informação é texto: a data grande e por extenso, a hora, e
 * depois só as linhas que têm conteúdo. O formulário continua inteiro, atrás
 * do botão "Editar" — o que mudou é qual dos dois abre primeiro.
 *
 * ── Por que não reusa o `MobileAppointmentSheet` ───────────────────────
 *
 * Aquele é a versão de celular da agenda, com ações próprias (abrir a ficha,
 * ligar, remarcar) e sem o "Confirmar atendimento". Fundir os dois traria as
 * ações dele para dentro do modal, que já tem as suas no rodapé e na coluna
 * da direita. O que se compartilha são os rótulos e as cores de status, que
 * já moram em `appointment-utils`.
 */
export function DetalheDoAgendamento({
  date,
  startTime,
  endTime,
  status,
  type,
  procedureName,
  professionalName,
  salaRotulo,
  expectedRevenue,
  actualRevenue,
  notes,
  notifications,
}: {
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  type: AppointmentType;
  /** O resumo já pronto: "Limpeza + Restauração". */
  procedureName: string;
  professionalName: string;
  /** Cadeira e unidade num rótulo só, como o seletor mostra. */
  salaRotulo: string | null;
  expectedRevenue: number;
  actualRevenue: number | null;
  notes: string;
  notifications?: Appointment["notifications"];
}) {
  const cor = statusStyle(status);
  const duracao = durationBetween(startTime, endTime);

  // Concluído mostra o COBRADO; o resto mostra o previsto. São números
  // diferentes — o previsto é estimativa do catálogo, o cobrado é o que a
  // pessoa pagou — e chamar os dois de "valor" foi o que já confundiu antes.
  const cobrado = status === "completed" && actualRevenue !== null;
  const valor = cobrado ? actualRevenue : expectedRevenue;

  return (
    <div className="space-y-5">
      {/* ── O que se bate o olho e já sabe ──────────────────────────────
          Data, hora e situação. Três linhas no lugar de três campos de
          formulário espalhados por duas seções diferentes. */}
      <div>
        <p className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
          {dataPorExtenso(date)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
          <span className="text-lg font-medium tabular-nums text-foreground">
            {startTime.slice(0, 5)} – {endTime.slice(0, 5)}
          </span>
          <span>{duracaoEmTexto(duracao)}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-2xs font-semibold"
            style={{ background: cor.bg, color: cor.text }}
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-2xs font-medium text-foreground-secondary">
            {TYPE_LABEL[type]}
          </span>
          {valor > 0 && (
            <span className="text-2xs text-muted-foreground">
              {cobrado ? "Cobrado" : "Previsto"}{" "}
              <span className="font-semibold text-foreground-secondary">{formatBRL(valor)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── O resto, em linhas ──────────────────────────────────────────
          As três continuam aparecendo vazias, com travessão: "sem
          profissional" é diferente de "não perguntei", e é justamente o
          buraco que alguém precisa ver para ir preencher. */}
      <dl className="divide-y divide-border">
        <Linha rotulo="Procedimento" valor={procedureName} />
        <Linha rotulo="Profissional" valor={professionalName} />
        <Linha rotulo="Sala" valor={salaRotulo} />
      </dl>

      {/* Observação do AGENDAMENTO — 40 dos 46 têm uma. Em bloco e não em
          linha porque costuma ser frase, não palavra. */}
      {notes.trim() && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observações
          </p>
          <p className="mt-1.5 whitespace-pre-wrap rounded-2xl bg-surface px-4 py-3 text-sm leading-6">
            {notes}
          </p>
        </div>
      )}

      {/* Sempre presente, sempre fechada. `NotificationRow` já desenha
          "não enviado" quando não há registro nenhum — e é justamente esse o
          estado que alguém precisa poder conferir. Sumir com a seção quando o
          Brevo nunca mandou nada faria a pergunta "avisaram o paciente?"
          ficar sem lugar onde ser respondida. */}
      <Recolhivel titulo="Confirmação e lembretes">
        <div className="divide-y divide-surface-muted rounded-xl border border-border px-3">
          {NOTIFICATION_KINDS.map((k) => (
            <NotificationRow
              key={k.value}
              label={k.label}
              kind={k.value}
              notifications={notifications}
            />
          ))}
        </div>
      </Recolhivel>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm",
          valor ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {valor || "—"}
      </dd>
    </div>
  );
}

/**
 * Uma seção que começa fechada.
 *
 * `<details>` nativo de propósito: abre sem estado em React, sem animação
 * para acertar e — o que importa aqui — o conteúdo continua no DOM, então o
 * Ctrl+F do navegador encontra o que está dentro e abre a seção sozinho.
 */
export function Recolhivel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span>{titulo}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          strokeWidth={1.75}
        />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
