import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  History,
  MessageCircle,
  Phone,
  StickyNote,
} from "lucide-react";
import {
  CardDeConsulta,
  CardDoPainel,
  LinhaDoPainel,
  NumeroDoPainel,
} from "@/components/painel/CardDoPainel";
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
          A foto vem do WhatsApp e existe por um motivo prático: a dentista
          nem sempre lembra quem é pelo nome, e pelo rosto reconhece na hora.

          Quando não há foto — hoje 14 dos 23 pacientes com agendamento — as
          iniciais ficam, que é o mesmo que o resto do sistema já mostra. */}
      <CardDoPainel icone={Phone} titulo="Contato">
        <div className="mb-4 flex items-center gap-3.5">
          <FotoDoContato
            nome={detalhe?.name ?? patientName}
            url={foto.data?.url ?? null}
            className="h-16 w-16 rounded-2xl bg-coral-soft text-lg text-coral"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{detalhe?.name ?? patientName}</p>
            {detalhe?.age !== null && detalhe?.age !== undefined && (
              <p className="mt-0.5 text-xs text-muted-foreground">{detalhe.age} anos</p>
            )}
          </div>
        </div>

        <div className="divide-y divide-border">
          <LinhaDoPainel rotulo="Telefone" valor={detalhe?.phone ?? null} />
          {painel.dados
            .filter((d) => d.rotulo === "Nascimento" && d.valor)
            .map((d) => (
              <LinhaDoPainel key={d.rotulo} rotulo={d.rotulo} valor={d.valor} />
            ))}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            to="/pacientes/$patientId"
            params={{ patientId }}
            className="press inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver ficha
          </Link>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
        </div>
      </CardDoPainel>

      {/* ── 3. Próxima e última ──────────────────────────────────────────
          Quase sempre tem conteúdo: o próprio agendamento aberto conta. */}
      {(historico.proxima || historico.ultima) && (
        <CardDoPainel icone={CalendarDays} titulo="Agenda">
          <div className="space-y-2">
            {historico.proxima && (
              <CardDeConsulta
                rotulo="Próxima"
                destaque
                c={{
                  date: historico.proxima.date,
                  time: historico.proxima.startTime.slice(0, 5),
                  procedure: historico.proxima.procedureName,
                  professional: historico.proxima.professionalName,
                }}
              />
            )}
            {historico.ultima && (
              <CardDeConsulta
                rotulo="Última"
                c={{
                  date: historico.ultima.date,
                  time: historico.ultima.startTime.slice(0, 5),
                  procedure: historico.ultima.procedureName,
                  professional: historico.ultima.professionalName,
                }}
              />
            )}
          </div>
        </CardDoPainel>
      )}

      {/* ── 4. O histórico ─────────────────────────────────────────────── */}
      {historico.historico.length > 0 && (
        <CardDoPainel
          icone={History}
          titulo="Histórico"
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
          <p className="text-xs text-muted-foreground">
            {[
              historico.contagem.realizadas > 0 && `${historico.contagem.realizadas} realizada(s)`,
              historico.contagem.futuras > 0 && `${historico.contagem.futuras} marcada(s)`,
              historico.contagem.faltas > 0 && `${historico.contagem.faltas} falta(s)`,
              historico.contagem.canceladas > 0 && `${historico.contagem.canceladas} cancelada(s)`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <ul className="mt-3 space-y-2">
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
        </CardDoPainel>
      )}

      {/* ── 5. Financeiro ────────────────────────────────────────────────
          Só quando há algum número. Três travessões lado a lado pareceriam
          uma tela quebrada, e hoje a clínica não tem cobrança nenhuma. */}
      {painel.financeiro &&
        (painel.financeiro.atraso !== null ||
          painel.financeiro.aReceber !== null ||
          painel.financeiro.pago !== null) && (
          <CardDoPainel icone={CircleDollarSign} titulo="Financeiro">
            <div className="grid grid-cols-3 gap-3">
              <NumeroDoPainel
                rotulo="Em atraso"
                tom="atraso"
                valor={
                  painel.financeiro.atraso !== null ? formatBRL(painel.financeiro.atraso) : null
                }
              />
              <NumeroDoPainel
                rotulo="A receber"
                valor={
                  painel.financeiro.aReceber !== null ? formatBRL(painel.financeiro.aReceber) : null
                }
              />
              <NumeroDoPainel
                rotulo="Já pago"
                valor={painel.financeiro.pago !== null ? formatBRL(painel.financeiro.pago) : null}
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
