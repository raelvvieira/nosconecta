import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  MessageCircle,
  StickyNote,
} from "lucide-react";
import { CardDoPainel, NumeroDoPainel } from "@/components/painel/CardDoPainel";
import { formatPatientWhatsApp, getPatientDetail } from "@/lib/patients/patients.functions";
import { montarPainel } from "@/lib/atendimentos/painelDoContato";
import { historicoDoPaciente, type ConsultaDoHistorico } from "@/lib/agenda/historicoDoPaciente";
import { FotoDoContato } from "@/components/atendimentos/chat/FotoDoContato";
import { getFotoDoWhatsapp } from "@/lib/atendimentos/contacts.functions";
import { STATUS_LABEL } from "./appointment-utils";
import { clinicNowStamp, diaParaLer } from "@/lib/date";
import { formatBRL } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/** Quantas consultas cabem antes de a coluna virar uma lista para rolar. */
const MAX_NO_HISTORICO = 6;

/**
 * Quem é a pessoa deste agendamento.
 *
 * ── Por que não é o `PainelDoContato` ──────────────────────────────────
 *
 * Aquele recebe uma `ConversationRow` e é dono das tags, das notas do funil,
 * da criação de ficha e das sugestões de fala da IA — nada disso existe na
 * agenda. O que se reaproveita são as PRIMITIVAS (`CardDoPainel` e irmãos) e a
 * função pura `montarPainel`, que é exatamente para isso que elas servem.
 *
 * ── Por que pinta antes de a rede responder ────────────────────────────
 *
 * A agenda já tem todos os agendamentos em memória. Então a próxima, a última
 * e o histórico aparecem em zero milissegundo, e a consulta ao servidor só
 * melhora o que já está na tela.
 *
 * Os dois caminhos passam pela MESMA função pura, então não divergem. O
 * servidor ganha de propósito quando chega: a agenda filtra por unidade e tem
 * teto de 2000 linhas; a ficha não tem nem um nem outro. Por isso um valor
 * pode mudar um instante depois de aparecer — não é piscada, é a lista mais
 * completa substituindo a parcial.
 */
export function ResumoDoPaciente({
  patientId,
  patientName,
  appointments,
  appointmentId,
}: {
  patientId?: string;
  patientName: string;
  /** Os agendamentos que a agenda já carregou. */
  appointments: readonly ConsultaDoHistorico[];
  /** O agendamento aberto, marcado como "este" na lista. */
  appointmentId?: string;
}) {
  const buscarFicha = useServerFn(getPatientDetail);

  // A MESMA chave da ficha completa e do painel do chat: quem já passou por
  // uma das duas telas vê o resumo preenchido sem nova ida ao servidor.
  const ficha = useQuery({
    queryKey: ["patient-detail", patientId],
    queryFn: () => buscarFicha({ data: { patientId: patientId! } }),
    enabled: Boolean(patientId),
    staleTime: 30_000,
    // `getPatientDetail` LANÇA quando o id aponta para ficha apagada, e este
    // modal não tem error boundary. Sem isto, um agendamento órfão derrubaria
    // a tela inteira da agenda.
    retry: false,
  });

  const detalhe = ficha.data ?? null;

  // A foto do WhatsApp. Só depois da ficha, porque é dela que saem os dois
  // dados que identificam a pessoa com segurança — ver o comentário longo em
  // `getFotoDoWhatsapp` sobre por que o telefone sozinho não serve.
  const buscarFoto = useServerFn(getFotoDoWhatsapp);
  const foto = useQuery({
    queryKey: ["foto-whatsapp", detalhe?.crmContactId ?? null, detalhe?.phone ?? null],
    queryFn: () =>
      buscarFoto({
        data: { crmContactId: detalhe?.crmContactId ?? null, phone: detalhe?.phone ?? null },
      }),
    enabled: Boolean(detalhe?.crmContactId || detalhe?.phone),
    // A URL do WhatsApp vence, mas não em minutos: cinco minutos de cache
    // evita uma ida ao banco a cada agendamento reaberto.
    staleTime: 5 * 60_000,
    retry: false,
  });

  // O prontuário não entra: `allergyNotes` vem da própria ficha, e é a única
  // coisa dali que este resumo mostra. Uma consulta a mais numa tabela com
  // zero linhas não pagaria por si.
  const painel = montarPainel({
    contato: { nome: patientName, telefone: null },
    paciente: detalhe,
    prontuario: null,
    campanha: null,
  });

  const historico = historicoDoPaciente(appointments, patientId, clinicNowStamp());
  const whatsapp = formatPatientWhatsApp(detalhe?.phone ?? null);

  /**
   * O card de dinheiro só aparece quando há dinheiro.
   *
   * Antes bastava o valor não ser `null` — e a clínica não tem cobrança
   * nenhuma, então ele aparecia com três zeros em toda ficha, ocupando um
   * card inteiro para dizer que não há nada a dizer.
   *
   * O atraso saiu daqui: ele tem a própria faixa lá em cima, em amarelo, que
   * é onde ele muda o que alguém faz. Repetido como terceira coluna, era o
   * mesmo número duas vezes na mesma coluna da tela.
   */
  const temFinanceiro = Boolean(painel.financeiro?.aReceber || painel.financeiro?.pago);

  if (!patientId) return <SemFicha />;

  return (
    <div className="space-y-3">
      {/* ── 1. Alergia ────────────────────────────────────────────────────
          Primeiro de tudo, e em faixa e não em card: é a única informação
          aqui que muda o que a doutora faz nos próximos cinco minutos. */}
      {painel.prontuario?.alergias && (
        <p className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{painel.prontuario.alergias}</span>
        </p>
      )}

      {painel.atraso !== null && (
        <p className="flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
          <CircleDollarSign className="h-4 w-4 shrink-0 text-warning" />
          <span>
            <strong>{formatBRL(painel.atraso)}</strong> em atraso
          </span>
        </p>
      )}

      {/* ── 2. Quem é, e como falar com ela ──────────────────────────────
          Sem moldura de card: é o cabeçalho da coluna, não mais uma seção
          entre outras. Era um card "Contato" com título, ícone e o nome
          dentro — e o nome já está no topo do modal, a um palmo daqui.
          Escrito três vezes na mesma tela, ele parava de ser identificação e
          virava ruído.

          A foto vem do WhatsApp e existe por um motivo prático: a dentista
          nem sempre lembra quem é pelo nome, e pelo rosto reconhece na hora.
          Quando não há — hoje 14 dos 23 pacientes com agendamento — ficam as
          iniciais, como no resto do sistema.

          O telefone fica grande e em fonte de largura fixa porque é o que se
          lê em voz alta para ligar; a idade e o nascimento, pequenos ao lado,
          porque são conferência. */}
      <div className="flex items-center gap-3.5">
        <FotoDoContato
          nome={detalhe?.name ?? patientName}
          url={foto.data?.url ?? null}
          className="h-14 w-14 shrink-0 rounded-2xl bg-coral-soft text-base text-coral"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-foreground">
            {detalhe?.phone ?? "Sem telefone"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[
              detalhe?.age !== null && detalhe?.age !== undefined ? `${detalhe.age} anos` : null,
              painel.dados.find((d) => d.rotulo === "Nascimento" && d.valor)?.valor ?? null,
            ]
              .filter(Boolean)
              .join(" · ") || "Paciente da clínica"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/pacientes/$patientId"
          params={{ patientId }}
          className="press inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver ficha
        </Link>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        )}
      </div>

      {/* ── 3. As consultas, numa lista só ───────────────────────────────
          Eram dois cards. "Agenda" mostrava a próxima e a última; "Histórico"
          mostrava a lista inteira — que começa pela próxima e traz a última
          logo abaixo. As mesmas duas consultas apareciam duas vezes cada, uma
          acima da outra, e ocupavam metade da coluna para isso.

          A lista vem da mais recente para a mais antiga, então a próxima já
          está no topo e a última logo depois das futuras: a ordem responde
          "quando eu vi essa pessoa" sem precisar de rótulo.

          A contagem sobrou só com falta e cancelamento. "1 realizada · 1
          marcada" repetia o que as duas linhas abaixo já diziam; "faltou duas
          vezes" é o que não dá para ver correndo o olho. */}
      {historico.historico.length > 0 && (
        <CardDoPainel
          icone={CalendarDays}
          titulo="Consultas"
          acao={
            historico.historico.length > MAX_NO_HISTORICO ? (
              <Link
                to="/pacientes/$patientId"
                params={{ patientId }}
                search={{ aba: "clinico" }}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver todas ({historico.historico.length})
              </Link>
            ) : null
          }
        >
          <ul className="space-y-2">
            {historico.historico.slice(0, MAX_NO_HISTORICO).map((c) => {
              const esta = c.id === appointmentId;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs",
                    esta ? "bg-coral-soft ring-1 ring-coral/20" : "bg-muted/50",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {diaParaLer(c.date)} · {c.startTime.slice(0, 5)}
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {esta ? "este" : STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {c.procedureName || "—"}
                    {c.professionalName && ` · ${c.professionalName}`}
                  </p>
                </li>
              );
            })}
          </ul>

          {(historico.contagem.faltas > 0 || historico.contagem.canceladas > 0) && (
            <p className="mt-3 text-2xs text-muted-foreground">
              {[
                historico.contagem.faltas > 0 && `${historico.contagem.faltas} falta(s)`,
                historico.contagem.canceladas > 0 &&
                  `${historico.contagem.canceladas} cancelada(s)`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </CardDoPainel>
      )}

      {/* ── 5. Financeiro ────────────────────────────────────────────────
          Só quando há algum número. Três travessões lado a lado pareceriam
          uma tela quebrada, e hoje a clínica não tem cobrança nenhuma. */}
      {temFinanceiro && (
        <CardDoPainel icone={CircleDollarSign} titulo="Financeiro">
          {/* Travessão, nunca "R$ 0,00": `dinheiro()` já devolve `null` para
              zero, e a regra do painel é que ausência não é zero — "tudo pago"
              e "ninguém lançou nada" são histórias opostas. */}
          <div className="grid grid-cols-2 gap-3">
            <NumeroDoPainel
              rotulo="A receber"
              valor={
                painel.financeiro?.aReceber != null ? formatBRL(painel.financeiro.aReceber) : null
              }
            />
            <NumeroDoPainel
              rotulo="Já pago"
              valor={painel.financeiro?.pago != null ? formatBRL(painel.financeiro.pago) : null}
            />
          </div>
        </CardDoPainel>
      )}

      {/* ── 6. Observações DA FICHA ──────────────────────────────────────
          O rótulo diz "da ficha" de propósito: o formulário ao lado tem um
          campo "Observações" que é do AGENDAMENTO, outra coisa. Sem a
          distinção, alguém edita um achando que mexe no outro. */}
      {detalhe?.notes?.trim() && (
        <CardDoPainel icone={StickyNote} titulo="Observações da ficha">
          <p className="whitespace-pre-wrap text-sm leading-6">{detalhe.notes}</p>
        </CardDoPainel>
      )}
    </div>
  );
}

/**
 * Agendamento sem ficha — cinco casos na base hoje.
 *
 * Não repete o botão "Criar ficha de paciente" do chat: o formulário AO LADO
 * já tem os campos de nome e telefone, e a ficha nasce sozinha ao salvar (ver
 * `resolvePatientId` em `useSaveAppointment.ts`). Dois caminhos de criação na
 * mesma tela é o tipo de duplicata que diverge.
 */
function SemFicha() {
  return (
    <p className="rounded-2xl bg-muted/60 px-4 py-3.5 text-sm leading-6 text-muted-foreground">
      Este agendamento ainda não tem ficha de paciente. Preencha nome, sobrenome e telefone ao lado
      — é o que abre histórico, prontuário e financeiro para esta pessoa.
    </p>
  );
}
